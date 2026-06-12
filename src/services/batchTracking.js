/**
 * Batch/Lot Tracking System
 * - Track products by batch number
 * - Expiry alerts by batch
 * - FIFO (First-In-First-Out) management
 */

import { getDatabase, generateId } from './localDatabase.js';

// ========================================
// Batch Management Functions
// ========================================

/**
 * Create a new batch for an item
 * @param {string} itemId - The item ID
 * @param {object} batchData - Batch details
 * @returns {object} - Created batch record
 */
export async function createBatch(itemId, batchData) {
  const db = await getDatabase();
  
  const batch = {
    id: generateId(),
    itemId,
    batchNumber: batchData.batchNumber || generateBatchNumber(),
    quantity: parseFloat(batchData.quantity) || 0,
    originalQuantity: parseFloat(batchData.quantity) || 0,
    purchasePrice: parseFloat(batchData.purchasePrice) || 0,
    expiryDate: batchData.expiryDate || null,
    manufacturingDate: batchData.manufacturingDate || null,
    supplier: batchData.supplier || '',
    purchaseDate: batchData.purchaseDate || new Date().toISOString().split('T')[0],
    notes: batchData.notes || '',
    status: 'active', // active, depleted, expired
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  await db.put('batches', batch);
  return batch;
}

/**
 * Generate a unique batch number
 * Format: YYYYMMDD-XXXX (date + random)
 */
export function generateBatchNumber() {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${dateStr}-${random}`;
}

/**
 * Get all batches for an item
 * @param {string} itemId - The item ID
 * @returns {array} - List of batches sorted by expiry (FIFO)
 */
export async function getBatchesForItem(itemId) {
  const db = await getDatabase();
  const allBatches = await db.getAll('batches');
  
  return allBatches
    .filter(b => String(b.itemId) === String(itemId) && b.status !== 'depleted')
    .sort((a, b) => {
      // FIFO: Sort by expiry date first, then by purchase date
      if (a.expiryDate && b.expiryDate) {
        return new Date(a.expiryDate) - new Date(b.expiryDate);
      }
      if (a.expiryDate) return -1;
      if (b.expiryDate) return 1;
      return new Date(a.purchaseDate) - new Date(b.purchaseDate);
    });
}

/**
 * Get all batches (for reporting)
 */
export async function getAllBatches() {
  const db = await getDatabase();
  return await db.getAll('batches');
}

/**
 * Consume stock using FIFO method
 * Automatically picks from oldest/nearest expiry batches first
 * @param {string} itemId - The item ID
 * @param {number} quantity - Quantity to consume
 * @returns {array} - List of batches consumed with quantities
 */
export async function consumeStockFIFO(itemId, quantity) {
  const batches = await getBatchesForItem(itemId);
  const db = await getDatabase();
  
  let remaining = quantity;
  const consumed = [];
  
  for (const batch of batches) {
    if (remaining <= 0) break;
    if (batch.quantity <= 0) continue;
    
    const takeFromBatch = Math.min(batch.quantity, remaining);
    batch.quantity -= takeFromBatch;
    batch.updated_at = new Date().toISOString();
    
    if (batch.quantity === 0) {
      batch.status = 'depleted';
    }
    
    await db.put('batches', batch);
    
    consumed.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      quantity: takeFromBatch,
      expiryDate: batch.expiryDate,
    });
    
    remaining -= takeFromBatch;
  }
  
  return {
    consumed,
    remainingQuantity: remaining, // If > 0, not enough stock
    success: remaining === 0,
  };
}

/**
 * Add stock to a batch (for returns or adjustments)
 * @param {string} batchId - The batch ID
 * @param {number} quantity - Quantity to add back
 */
export async function addStockToBatch(batchId, quantity) {
  const db = await getDatabase();
  const batch = await db.get('batches', batchId);
  
  if (!batch) throw new Error('Batch not found');
  
  batch.quantity += quantity;
  batch.status = 'active';
  batch.updated_at = new Date().toISOString();
  
  await db.put('batches', batch);
  return batch;
}

/**
 * Get expiring batches
 * @param {number} daysAhead - Days to look ahead
 * @returns {array} - List of batches expiring soon
 */
export async function getExpiringBatches(daysAhead = 30) {
  const db = await getDatabase();
  const allBatches = await db.getAll('batches');
  const today = new Date();
  const futureDate = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  
  return allBatches
    .filter(b => {
      if (!b.expiryDate || b.status === 'depleted' || b.quantity === 0) return false;
      const expiry = new Date(b.expiryDate);
      return expiry <= futureDate;
    })
    .map(b => ({
      ...b,
      daysUntilExpiry: Math.ceil((new Date(b.expiryDate) - today) / (24 * 60 * 60 * 1000)),
      isExpired: new Date(b.expiryDate) < today,
    }))
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

/**
 * Get expired batches
 */
export async function getExpiredBatches() {
  const db = await getDatabase();
  const allBatches = await db.getAll('batches');
  const today = new Date();
  
  return allBatches.filter(b => {
    if (!b.expiryDate || b.status === 'depleted' || b.quantity === 0) return false;
    return new Date(b.expiryDate) < today;
  });
}

/**
 * Get batch summary for an item
 * @param {string} itemId - The item ID
 */
export async function getBatchSummary(itemId) {
  const batches = await getBatchesForItem(itemId);
  const today = new Date();
  
  return {
    totalQuantity: batches.reduce((sum, b) => sum + b.quantity, 0),
    batchCount: batches.length,
    activeBatches: batches.filter(b => b.quantity > 0).length,
    nearestExpiry: batches.find(b => b.expiryDate)?.expiryDate || null,
    expiredQuantity: batches
      .filter(b => b.expiryDate && new Date(b.expiryDate) < today)
      .reduce((sum, b) => sum + b.quantity, 0),
    avgPurchasePrice: batches.length > 0
      ? batches.reduce((sum, b) => sum + b.purchasePrice * b.quantity, 0) / 
        batches.reduce((sum, b) => sum + b.quantity, 0) || 0
      : 0,
  };
}

/**
 * Update batch details
 */
export async function updateBatch(batchId, updates) {
  const db = await getDatabase();
  const batch = await db.get('batches', batchId);
  
  if (!batch) throw new Error('Batch not found');
  
  Object.assign(batch, updates, { updated_at: new Date().toISOString() });
  await db.put('batches', batch);
  return batch;
}

/**
 * Delete a batch
 */
export async function deleteBatch(batchId) {
  const db = await getDatabase();
  await db.delete('batches', batchId);
}

/**
 * Get FIFO valuation for inventory
 */
export async function getFIFOValuation() {
  const db = await getDatabase();
  const allBatches = await db.getAll('batches');
  
  const itemValuations = {};
  
  allBatches.forEach(batch => {
    if (batch.quantity <= 0 || batch.status === 'depleted') return;
    
    if (!itemValuations[batch.itemId]) {
      itemValuations[batch.itemId] = {
        itemId: batch.itemId,
        totalQuantity: 0,
        totalValue: 0,
        batches: [],
      };
    }
    
    itemValuations[batch.itemId].totalQuantity += batch.quantity;
    itemValuations[batch.itemId].totalValue += batch.quantity * batch.purchasePrice;
    itemValuations[batch.itemId].batches.push({
      batchNumber: batch.batchNumber,
      quantity: batch.quantity,
      purchasePrice: batch.purchasePrice,
      expiryDate: batch.expiryDate,
    });
  });
  
  return Object.values(itemValuations);
}

// ========================================
// Database Schema Update
// ========================================

/**
 * Ensure batches table exists
 */
export async function ensureBatchesTable() {
  const db = await getDatabase();
  // IndexedDB handles this automatically in localDatabase.js
  // For SQLite, we need to create the table
  if (db.createBatchesTable) {
    await db.createBatchesTable();
  }
}
