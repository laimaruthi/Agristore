/**
 * Batch Management Components
 * - Batch list view
 * - Add/Edit batch modal
 * - FIFO stock consumption
 * - Expiry alerts
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Btn, Input, Badge } from './UIComponents';
import { fmtCurrency, fmtDate } from '../utils/helpers';
import {
  getBatchesForItem,
  createBatch,
  updateBatch,
  deleteBatch,
  getExpiringBatches,
  getBatchSummary,
  generateBatchNumber,
} from '../services/batchTracking';

// ── Batch Status Badge ────────────────────────────────────────────────────────
export function BatchStatusBadge({ batch }) {
  if (!batch.expiryDate) {
    return <Badge color="gray">No Expiry</Badge>;
  }
  
  const today = new Date();
  const expiry = new Date(batch.expiryDate);
  const daysUntil = Math.ceil((expiry - today) / (24 * 60 * 60 * 1000));
  
  if (daysUntil < 0) {
    return <Badge color="red">Expired ({Math.abs(daysUntil)}d ago)</Badge>;
  } else if (daysUntil <= 30) {
    return <Badge color="yellow">Expires in {daysUntil}d</Badge>;
  } else if (daysUntil <= 60) {
    return <Badge color="blue">Expires in {daysUntil}d</Badge>;
  }
  return <Badge color="green">OK ({daysUntil}d)</Badge>;
}

// ── Add/Edit Batch Modal ──────────────────────────────────────────────────────
export function BatchModal({ item, batch, onSave, onClose }) {
  const isEdit = !!batch;
  const [form, setForm] = useState({
    batchNumber: batch?.batchNumber || generateBatchNumber(),
    quantity: batch?.quantity?.toString() || '',
    purchasePrice: batch?.purchasePrice?.toString() || '',
    expiryDate: batch?.expiryDate || '',
    manufacturingDate: batch?.manufacturingDate || '',
    supplier: batch?.supplier || '',
    notes: batch?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.quantity || parseInt(form.quantity) <= 0) {
      setError('Quantity is required');
      return;
    }
    
    setSaving(true);
    setError('');
    
    try {
      if (isEdit) {
        await updateBatch(batch.id, {
          batchNumber: form.batchNumber,
          quantity: parseInt(form.quantity),
          purchasePrice: parseFloat(form.purchasePrice) || 0,
          expiryDate: form.expiryDate || null,
          manufacturingDate: form.manufacturingDate || null,
          supplier: form.supplier,
          notes: form.notes,
        });
      } else {
        await createBatch(item.id, {
          batchNumber: form.batchNumber,
          quantity: parseInt(form.quantity),
          purchasePrice: parseFloat(form.purchasePrice) || 0,
          expiryDate: form.expiryDate || null,
          manufacturingDate: form.manufacturingDate || null,
          supplier: form.supplier,
          notes: form.notes,
        });
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal 
      title={isEdit ? `✏️ Edit Batch — ${form.batchNumber}` : `📦 Add Batch — ${item?.name}`} 
      onClose={onClose}
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-900/30 border border-red-700/40 text-red-400 text-sm">
            {error}
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Batch Number"
            value={form.batchNumber}
            onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
            placeholder="Auto-generated"
          />
          <Input
            label="Quantity *"
            type="number"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="0"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Purchase Price (₹)"
            type="number"
            value={form.purchasePrice}
            onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
            placeholder="0.00"
          />
          <Input
            label="Supplier"
            value={form.supplier}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            placeholder="Supplier name"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Expiry Date"
            type="date"
            value={form.expiryDate}
            onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
          />
          <Input
            label="Manufacturing Date"
            type="date"
            value={form.manufacturingDate}
            onChange={(e) => setForm({ ...form, manufacturingDate: e.target.value })}
          />
        </div>
        
        <Input
          label="Notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Optional notes..."
        />
        
        <div className="flex gap-3 justify-end">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Update Batch' : 'Add Batch'}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Batch List for an Item ────────────────────────────────────────────────────
export function BatchList({ item, onUpdate }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editBatch, setEditBatch] = useState(null);
  const [summary, setSummary] = useState(null);

  const loadBatches = async () => {
    setLoading(true);
    try {
      const data = await getBatchesForItem(item.id);
      setBatches(data);
      const summaryData = await getBatchSummary(item.id);
      setSummary(summaryData);
    } catch (err) {
      console.error('Failed to load batches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, [item.id]);

  const handleDelete = async (batchId) => {
    if (!confirm('Delete this batch?')) return;
    try {
      await deleteBatch(batchId);
      loadBatches();
      onUpdate?.();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-emerald-400/60">
        Loading batches...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
            <p className="text-xs text-emerald-500/60 uppercase">Total Stock</p>
            <p className="text-xl font-bold text-emerald-400">{summary.totalQuantity}</p>
          </div>
          <div className="p-3 rounded-xl bg-blue-900/20 border border-blue-700/30">
            <p className="text-xs text-blue-500/60 uppercase">Batches</p>
            <p className="text-xl font-bold text-blue-400">{summary.activeBatches}</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-900/20 border border-amber-700/30">
            <p className="text-xs text-amber-500/60 uppercase">Nearest Expiry</p>
            <p className="text-sm font-bold text-amber-400">
              {summary.nearestExpiry ? fmtDate(summary.nearestExpiry) : '—'}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-purple-900/20 border border-purple-700/30">
            <p className="text-xs text-purple-500/60 uppercase">Avg Cost</p>
            <p className="text-lg font-bold text-purple-400">
              {fmtCurrency(summary.avgPurchasePrice)}
            </p>
          </div>
        </div>
      )}

      {/* Add Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold text-emerald-300">
          📦 Batches (FIFO Order)
        </h3>
        <Btn size="sm" onClick={() => setShowAdd(true)}>+ Add Batch</Btn>
      </div>

      {/* Batch Table */}
      {batches.length === 0 ? (
        <div className="text-center py-8 text-emerald-400/40 border border-dashed border-emerald-700/30 rounded-xl">
          No batches recorded. Add your first batch!
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-emerald-700/30">
          <table className="w-full text-sm">
            <thead className="bg-emerald-900/30">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-emerald-400/70 uppercase">#</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-emerald-400/70 uppercase">Batch</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-emerald-400/70 uppercase">Qty</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-emerald-400/70 uppercase">Cost</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-emerald-400/70 uppercase">Expiry</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-emerald-400/70 uppercase">Supplier</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-emerald-400/70 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch, idx) => (
                <tr 
                  key={batch.id} 
                  className={`border-t border-emerald-700/20 ${idx === 0 ? 'bg-emerald-900/10' : ''}`}
                >
                  <td className="px-3 py-2 text-emerald-400/60">
                    {idx === 0 && <span title="Next to consume (FIFO)">🔜</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-emerald-300">{batch.batchNumber}</td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-200">{batch.quantity}</td>
                  <td className="px-3 py-2 text-right text-emerald-400">{fmtCurrency(batch.purchasePrice)}</td>
                  <td className="px-3 py-2">
                    <BatchStatusBadge batch={batch} />
                  </td>
                  <td className="px-3 py-2 text-emerald-300/70">{batch.supplier || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => setEditBatch(batch)}
                      className="text-blue-400 hover:text-blue-300 mr-2"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(batch.id)}
                      className="text-red-400 hover:text-red-300"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showAdd && (
        <BatchModal
          item={item}
          onSave={() => {
            setShowAdd(false);
            loadBatches();
            onUpdate?.();
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
      
      {editBatch && (
        <BatchModal
          item={item}
          batch={editBatch}
          onSave={() => {
            setEditBatch(null);
            loadBatches();
            onUpdate?.();
          }}
          onClose={() => setEditBatch(null)}
        />
      )}
    </div>
  );
}

// ── Expiring Batches Alert Panel ──────────────────────────────────────────────
export function ExpiringBatchesPanel({ items, daysAhead = 30 }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getExpiringBatches(daysAhead);
        setBatches(data);
      } catch (err) {
        console.error('Failed to load expiring batches:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [daysAhead]);

  const getItemName = (itemId) => {
    return items?.find(i => i.id === itemId)?.name || 'Unknown Item';
  };

  if (loading) return null;
  if (batches.length === 0) return null;

  const expired = batches.filter(b => b.isExpired);
  const expiringSoon = batches.filter(b => !b.isExpired);

  return (
    <div className="space-y-3">
      {/* Expired */}
      {expired.length > 0 && (
        <div className="p-4 rounded-xl bg-red-900/20 border border-red-700/40">
          <h3 className="text-sm font-bold text-red-400 mb-2">
            ⚠️ Expired Batches ({expired.length})
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {expired.map(batch => (
              <div key={batch.id} className="flex justify-between items-center text-sm">
                <span className="text-red-300">{getItemName(batch.itemId)}</span>
                <span className="text-red-400/70">
                  Batch {batch.batchNumber} • {batch.quantity} units
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expiring Soon */}
      {expiringSoon.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-700/40">
          <h3 className="text-sm font-bold text-amber-400 mb-2">
            🕐 Expiring Soon ({expiringSoon.length})
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {expiringSoon.slice(0, 5).map(batch => (
              <div key={batch.id} className="flex justify-between items-center text-sm">
                <span className="text-amber-300">{getItemName(batch.itemId)}</span>
                <span className="text-amber-400/70">
                  {batch.daysUntilExpiry}d • {batch.quantity} units
                </span>
              </div>
            ))}
            {expiringSoon.length > 5 && (
              <p className="text-xs text-amber-500/60">
                +{expiringSoon.length - 5} more batches expiring...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BatchList;
