/**
 * Cloud Sync Service (Optional)
 * - Sync between multiple devices
 * - Access from phone app (PWA ready)
 * - Automatic offsite backup
 * 
 * Uses a simple REST API approach that can work with:
 * - Your own server (Node.js/Express)
 * - Firebase Realtime Database
 * - Supabase
 * - Any REST API backend
 */

import { getDatabase } from './localDatabase.js';

// ========================================
// Cloud Sync Configuration
// ========================================

const SYNC_CONFIG_KEY = 'agristore_cloud_sync';
const SYNC_QUEUE_KEY = 'agristore_sync_queue';
const LAST_SYNC_KEY = 'agristore_last_sync';

/**
 * Get cloud sync configuration
 */
export function getCloudConfig() {
  try {
    const config = localStorage.getItem(SYNC_CONFIG_KEY);
    return config ? JSON.parse(config) : null;
  } catch {
    return null;
  }
}

/**
 * Save cloud sync configuration
 * @param {object} config - { serverUrl, apiKey, storeId, enabled }
 */
export function setCloudConfig(config) {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify({
    ...config,
    updatedAt: new Date().toISOString(),
  }));
}

/**
 * Check if cloud sync is enabled
 */
export function isCloudSyncEnabled() {
  const config = getCloudConfig();
  return config?.enabled === true && config?.serverUrl;
}

// ========================================
// Sync Queue Management
// ========================================

/**
 * Add change to sync queue (for offline-first)
 */
export function queueChange(table, action, data) {
  const queue = getSyncQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    table,
    action, // 'create', 'update', 'delete'
    data,
    timestamp: new Date().toISOString(),
    attempts: 0,
  });
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Get pending sync queue
 */
export function getSyncQueue() {
  try {
    const queue = localStorage.getItem(SYNC_QUEUE_KEY);
    return queue ? JSON.parse(queue) : [];
  } catch {
    return [];
  }
}

/**
 * Clear sync queue
 */
export function clearSyncQueue() {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify([]));
}

/**
 * Remove item from sync queue
 */
export function removeFromQueue(queueId) {
  const queue = getSyncQueue().filter(item => item.id !== queueId);
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

// ========================================
// Cloud Sync Operations
// ========================================

/**
 * Sync local changes to cloud
 */
export async function pushToCloud() {
  const config = getCloudConfig();
  if (!config?.enabled || !config?.serverUrl) {
    return { success: false, error: 'Cloud sync not configured' };
  }
  
  const queue = getSyncQueue();
  if (queue.length === 0) {
    return { success: true, synced: 0 };
  }
  
  let synced = 0;
  const errors = [];
  
  for (const item of queue) {
    try {
      const response = await fetch(`${config.serverUrl}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'X-Store-ID': config.storeId,
        },
        body: JSON.stringify({
          table: item.table,
          action: item.action,
          data: item.data,
          timestamp: item.timestamp,
        }),
      });
      
      if (response.ok) {
        removeFromQueue(item.id);
        synced++;
      } else {
        item.attempts++;
        errors.push({ item, error: await response.text() });
      }
    } catch (err) {
      item.attempts++;
      errors.push({ item, error: err.message });
    }
  }
  
  // Update queue with failed items
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(
    getSyncQueue().map(q => {
      const failed = errors.find(e => e.item.id === q.id);
      return failed ? { ...q, attempts: failed.item.attempts } : q;
    })
  ));
  
  return {
    success: errors.length === 0,
    synced,
    errors: errors.length,
    pending: getSyncQueue().length,
  };
}

/**
 * Pull changes from cloud
 */
export async function pullFromCloud() {
  const config = getCloudConfig();
  if (!config?.enabled || !config?.serverUrl) {
    return { success: false, error: 'Cloud sync not configured' };
  }
  
  const lastSync = localStorage.getItem(LAST_SYNC_KEY) || '1970-01-01T00:00:00Z';
  
  try {
    const response = await fetch(`${config.serverUrl}/sync/changes?since=${encodeURIComponent(lastSync)}`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'X-Store-ID': config.storeId,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const changes = await response.json();
    const db = await getDatabase();
    
    let applied = 0;
    
    for (const change of changes) {
      try {
        if (change.action === 'delete') {
          await db.delete(change.table, change.data.id);
        } else {
          await db.put(change.table, change.data);
        }
        applied++;
      } catch (err) {
        console.error('Failed to apply change:', err);
      }
    }
    
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    
    return {
      success: true,
      applied,
      total: changes.length,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Full sync - push then pull
 */
export async function fullSync() {
  const pushResult = await pushToCloud();
  const pullResult = await pullFromCloud();
  
  return {
    push: pushResult,
    pull: pullResult,
    success: pushResult.success && pullResult.success,
    lastSync: new Date().toISOString(),
  };
}

// ========================================
// Automatic Backup to Cloud
// ========================================

/**
 * Upload full backup to cloud
 */
export async function uploadBackupToCloud() {
  const config = getCloudConfig();
  if (!config?.enabled || !config?.serverUrl) {
    return { success: false, error: 'Cloud sync not configured' };
  }
  
  const db = await getDatabase();
  
  // Get all data
  const backup = {
    timestamp: new Date().toISOString(),
    storeId: config.storeId,
    data: {
      customers: await db.getAll('customers'),
      items: await db.getAll('items'),
      invoices: await db.getAll('invoices'),
      purchases: await db.getAll('purchases'),
      companies: await db.getAll('companies'),
      categories: await db.getAll('categories'),
      batches: await db.getAll('batches'),
      users: await db.getAll('users'),
      store_settings: await db.get('store_settings', 'main'),
    },
    _meta: {
      version: '1.1.0',
      recordCount: 0,
    },
  };
  
  // Count records
  backup._meta.recordCount = Object.values(backup.data)
    .reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 1), 0);
  
  try {
    const response = await fetch(`${config.serverUrl}/backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'X-Store-ID': config.storeId,
      },
      body: JSON.stringify(backup),
    });
    
    if (!response.ok) {
      throw new Error(`Backup failed: ${response.status}`);
    }
    
    return {
      success: true,
      timestamp: backup.timestamp,
      recordCount: backup._meta.recordCount,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Download and restore backup from cloud
 */
export async function restoreFromCloud(backupId = 'latest') {
  const config = getCloudConfig();
  if (!config?.enabled || !config?.serverUrl) {
    return { success: false, error: 'Cloud sync not configured' };
  }
  
  try {
    const response = await fetch(`${config.serverUrl}/backup/${backupId}`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'X-Store-ID': config.storeId,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    
    const backup = await response.json();
    const db = await getDatabase();
    
    // Restore each table
    for (const [table, records] of Object.entries(backup.data)) {
      if (table === 'store_settings' && records) {
        await db.put('store_settings', { ...records, id: 'main' });
      } else if (Array.isArray(records)) {
        for (const record of records) {
          await db.put(table, record);
        }
      }
    }
    
    return {
      success: true,
      timestamp: backup.timestamp,
      recordCount: backup._meta?.recordCount || 0,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Get list of available cloud backups
 */
export async function getCloudBackups() {
  const config = getCloudConfig();
  if (!config?.enabled || !config?.serverUrl) {
    return { success: false, backups: [], error: 'Cloud sync not configured' };
  }
  
  try {
    const response = await fetch(`${config.serverUrl}/backups`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'X-Store-ID': config.storeId,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get backups: ${response.status}`);
    }
    
    const backups = await response.json();
    return { success: true, backups };
  } catch (err) {
    return { success: false, backups: [], error: err.message };
  }
}

// ========================================
// Sync Status & Monitoring
// ========================================

/**
 * Get sync status
 */
export function getSyncStatus() {
  const config = getCloudConfig();
  const queue = getSyncQueue();
  const lastSync = localStorage.getItem(LAST_SYNC_KEY);
  
  return {
    enabled: config?.enabled || false,
    configured: !!config?.serverUrl,
    pendingChanges: queue.length,
    lastSync: lastSync || null,
    serverUrl: config?.serverUrl || null,
    storeId: config?.storeId || null,
  };
}

/**
 * Test cloud connection
 */
export async function testCloudConnection() {
  const config = getCloudConfig();
  if (!config?.serverUrl) {
    return { success: false, error: 'Server URL not configured' };
  }
  
  try {
    const response = await fetch(`${config.serverUrl}/ping`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'X-Store-ID': config.storeId,
      },
    });
    
    return {
      success: response.ok,
      latency: 0, // Could measure this
      serverVersion: response.headers.get('X-Server-Version') || 'unknown',
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

// ========================================
// Auto-Sync Setup
// ========================================

let syncInterval = null;

/**
 * Start automatic sync (call on app load)
 * @param {number} intervalMinutes - Sync interval in minutes
 */
export function startAutoSync(intervalMinutes = 5) {
  if (syncInterval) {
    clearInterval(syncInterval);
  }
  
  if (!isCloudSyncEnabled()) {
    return;
  }
  
  // Sync immediately
  fullSync().catch(console.error);
  
  // Then sync periodically
  syncInterval = setInterval(() => {
    fullSync().catch(console.error);
  }, intervalMinutes * 60 * 1000);
}

/**
 * Stop automatic sync
 */
export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

// ========================================
// Simple Server Implementation (Reference)
// ========================================

/**
 * For a simple self-hosted sync server, you can use this Express.js code:
 * 
 * ```javascript
 * const express = require('express');
 * const cors = require('cors');
 * const fs = require('fs');
 * 
 * const app = express();
 * app.use(cors());
 * app.use(express.json({ limit: '50mb' }));
 * 
 * const DATA_DIR = './data';
 * 
 * // Store changes per store
 * app.post('/sync', (req, res) => {
 *   const storeId = req.headers['x-store-id'];
 *   const change = req.body;
 *   
 *   const changesFile = `${DATA_DIR}/${storeId}/changes.json`;
 *   const changes = fs.existsSync(changesFile) 
 *     ? JSON.parse(fs.readFileSync(changesFile)) 
 *     : [];
 *   
 *   changes.push(change);
 *   fs.writeFileSync(changesFile, JSON.stringify(changes, null, 2));
 *   
 *   res.json({ success: true });
 * });
 * 
 * // Get changes since timestamp
 * app.get('/sync/changes', (req, res) => {
 *   const storeId = req.headers['x-store-id'];
 *   const since = new Date(req.query.since);
 *   
 *   const changesFile = `${DATA_DIR}/${storeId}/changes.json`;
 *   const changes = fs.existsSync(changesFile) 
 *     ? JSON.parse(fs.readFileSync(changesFile)) 
 *     : [];
 *   
 *   const filtered = changes.filter(c => new Date(c.timestamp) > since);
 *   res.json(filtered);
 * });
 * 
 * // Save backup
 * app.post('/backup', (req, res) => {
 *   const storeId = req.headers['x-store-id'];
 *   const backup = req.body;
 *   
 *   const backupFile = `${DATA_DIR}/${storeId}/backup-${Date.now()}.json`;
 *   fs.mkdirSync(`${DATA_DIR}/${storeId}`, { recursive: true });
 *   fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
 *   
 *   res.json({ success: true, id: backupFile });
 * });
 * 
 * app.get('/ping', (req, res) => res.json({ pong: true }));
 * 
 * app.listen(3001, () => console.log('Sync server on :3001'));
 * ```
 */
