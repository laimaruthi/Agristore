/**
 * Local Data Hooks - 100% Local Storage (No Firebase)
 * All data stored locally using IndexedDB
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getDatabase, generateId } from './localDatabase.js';

/**
 * Local data hook - stores all data in IndexedDB
 * No cloud/Firebase - everything is local
 */
export function useLocalData(key, defaultValue = [], enabled = true) {
  const [value, setValue] = useState(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const valueRef = useRef(defaultValue);
  const dbRef = useRef(null);
  
  // Map key names to local table names
  const tableMap = {
    'agristore_users': 'users',
    'agristore_customers': 'customers',
    'agristore_items': 'items',
    'agristore_invoices': 'invoices',
    'agristore_purchases': 'purchases',
    'agristore_companies': 'companies',
    'agristore_categories': 'categories',
    'agristore_purchase_items': 'purchase_items',
    'agristore_purchase_categories': 'purchase_categories',
    'agristore_activity': 'activity',
    'agristore_store': 'store_settings',
    'agristore_other_expenses': 'other_expenses',
    'agristore_category_gst': 'category_gst',
  };
  
  const tableName = tableMap[key] || key;

  // Load data on mount
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function loadData() {
      try {
        setLoading(true);
        const localDb = await getDatabase();
        dbRef.current = localDb;

        // Load from local database
        let localData;
        
        if (tableName === 'store_settings') {
          // Single object (store settings)
          const settings = await localDb.get('store_settings', 'main');
          localData = settings || defaultValue;
        } else {
          // Array of records
          localData = await localDb.getAll(tableName);
        }

        if (mounted) {
          if (localData && (Array.isArray(localData) ? localData.length > 0 : Object.keys(localData).length > 0)) {
            // Unwrap primitives and repair legacy corruption (string spread into numeric keys)
            let cleaned = Array.isArray(localData)
              ? localData.map((row) => {
                  if (row && typeof row === 'object' && '__value' in row) return row.__value;
                  if (row && typeof row === 'object') {
                    const meta = new Set(['id', 'updated_at', 'created_at']);
                    const ownKeys = Object.keys(row).filter((k) => !meta.has(k));
                    const allNumeric = ownKeys.length > 0 && ownKeys.every((k) => /^\d+$/.test(k));
                    if (allNumeric) {
                      // Reconstruct original string
                      return ownKeys
                        .map(Number)
                        .sort((a, b) => a - b)
                        .map((k) => row[k])
                        .join('');
                    }
                  }
                  return row;
                })
              : localData;

            // For arrays of primitives (e.g. categories), dedupe case-insensitively.
            // Storage previously could accumulate duplicates because writes were upserts.
            if (Array.isArray(cleaned) && cleaned.length > 0 && cleaned.every((v) => v == null || typeof v !== 'object')) {
              const seen = new Set();
              const out = [];
              cleaned.forEach((v) => {
                const k = String(v ?? '').trim().toLowerCase();
                if (k && !seen.has(k)) { seen.add(k); out.push(v); }
              });
              cleaned = out;
            }

            valueRef.current = cleaned;
            setValue(cleaned);
          }
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading " + key + ":", err);
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [key, tableName, enabled]); // eslint-disable-line

  // Update function
  const updateValue = useCallback(async (newVal) => {
    const resolved = typeof newVal === 'function' ? newVal(valueRef.current) : newVal;

    // Protection against accidental data wipe.
    // Only block if we're emptying a record-shaped collection (objects with id/name/etc.).
    // Don't block primitive arrays (categories, tags, etc.) — those legitimately can be cleared,
    // and may contain duplicates that all get filtered at once.
    if (Array.isArray(resolved) && resolved.length === 0) {
      const prev = Array.isArray(valueRef.current) ? valueRef.current : [];
      const prevLength = prev.length;
      const isRecordArray = prev.some((v) => v && typeof v === 'object' && !Array.isArray(v));
      if (isRecordArray && prevLength > 3) {
        console.error("BLOCKED: Attempted to clear " + key + " with " + prevLength + " items");
        return;
      }
    }

    valueRef.current = resolved;
    setValue(resolved);

    try {
      const localDb = dbRef.current || await getDatabase();

      // Save to local database
      if (Array.isArray(resolved)) {
        const itemsWithMeta = resolved.map((item, idx) => {
          // Primitive (string/number/boolean) — wrap, don't spread (would corrupt strings into char-objects)
          if (item === null || typeof item !== 'object') {
            return {
              id: `__primitive_${idx}_${String(item)}`,
              __value: item,
              updated_at: Date.now(),
            };
          }
          return {
            ...item,
            id: item.id || generateId(),
            updated_at: Date.now(),
          };
        });
        // Use replaceAll so deletions actually persist (putAll alone only upserts → removed rows came back on reload)
        if (typeof localDb.replaceAll === 'function') {
          await localDb.replaceAll(tableName, itemsWithMeta);
        } else {
          await localDb.putAll(tableName, itemsWithMeta);
        }
      } else if (typeof resolved === 'object' && resolved !== null) {
        await localDb.put(tableName, {
          ...resolved,
          id: 'main',
          updated_at: Date.now(),
        });
      }
    } catch (err) {
      console.error("Error saving " + key + ":", err);
      setError(err.message);
    }
  }, [key, tableName]);

  // Return synced as true always (local = always synced)
  return [value, updateValue, true, loading, error];
}

/**
 * Hook for single record CRUD operations
 */
export function useLocalRecord(tableName) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const create = useCallback(async (data) => {
    setLoading(true);
    setError(null);
    try {
      const localDb = await getDatabase();
      const record = {
        ...data,
        id: data.id || generateId(),
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      await localDb.put(tableName, record);
      setLoading(false);
      return record;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [tableName]);

  const update = useCallback(async (id, updates) => {
    setLoading(true);
    setError(null);
    try {
      const localDb = await getDatabase();
      const existing = await localDb.get(tableName, id);
      if (!existing) throw new Error('Record not found');
      
      const record = {
        ...existing,
        ...updates,
        updated_at: Date.now(),
      };
      await localDb.put(tableName, record);
      setLoading(false);
      return record;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [tableName]);

  const remove = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const localDb = await getDatabase();
      await localDb.delete(tableName, id);
      setLoading(false);
      return true;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [tableName]);

  const get = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      const localDb = await getDatabase();
      const record = await localDb.get(tableName, id);
      setLoading(false);
      return record;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [tableName]);

  return { create, update, remove, get, loading, error };
}

/**
 * Network status hook (kept for compatibility)
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  return isOnline;
}

// Data mode is always 'local' for this version
export function getDataMode() {
  return 'local';
}

export function setDataMode(mode) {
  // No-op for local-only version
}

export default {
  useLocalData,
  useLocalRecord,
  useNetworkStatus,
  getDataMode,
  setDataMode,
};
