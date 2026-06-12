/**
 * Local Database Service
 * Uses SQLite (via Electron) for desktop app - MORE RELIABLE for 10+ years
 * Falls back to IndexedDB for browser/web app
 */

// Check if running in Electron with SQLite
export const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
};

export const useSQLite = () => {
  return typeof window !== 'undefined'
    && window.electronAPI?.useSQLite === true
    && window.electronAPI?.db != null;
};

// ========================================
// SQLite Store (for Electron desktop app)
// ========================================
class SQLiteStore {
  constructor() {
    this.api = null;
  }

  async init() {
    if (typeof window !== 'undefined' && window.electronAPI?.db) {
      this.api = window.electronAPI.db;
      // ✅ Probe the IPC handler with a real call. On Windows builds where
      //    better-sqlite3 fails to load (antivirus, missing VC runtime, etc.),
      //    main.cjs returns { success: false, error: 'SQLite not available' }.
      //    We must throw here so getDatabase() can fall back to IndexedDB and
      //    prevent silent data loss (writes succeed in React state but never
      //    persist to disk → data disappears on next launch).
      try {
        const probe = await this.api.getAll('store_settings');
        if (!probe || probe.success === false) {
          throw new Error(probe?.error || 'SQLite probe failed');
        }
      } catch (e) {
        console.warn('⚠️ SQLite IPC probe failed, will fall back to IndexedDB:', e.message);
        throw e;
      }
      console.log('✅ SQLite database connected (via Electron)');
    } else {
      throw new Error('SQLite not available - electronAPI.db not found');
    }
    return this;
  }

  async getAll(storeName) {
    const result = await this.api.getAll(storeName);
    if (!result.success) {
      console.error(`SQLite getAll error:`, result.error);
      return [];
    }
    return result.data || [];
  }

  async get(storeName, id) {
    const result = await this.api.get(storeName, id);
    if (!result.success) {
      console.error(`SQLite get error:`, result.error);
      return null;
    }
    return result.data;
  }

  async put(storeName, data) {
    const result = await this.api.put(storeName, data);
    if (!result.success) {
      console.error(`SQLite put error:`, result.error);
      throw new Error(result.error);
    }
    return result.data;
  }

  async delete(storeName, id) {
    const result = await this.api.delete(storeName, id);
    if (!result.success) {
      console.error(`SQLite delete error:`, result.error);
      throw new Error(result.error);
    }
    return true;
  }

  async putAll(storeName, dataArray) {
    const result = await this.api.putAll(storeName, dataArray);
    if (!result.success) {
      console.error(`SQLite putAll error:`, result.error);
      throw new Error(result.error);
    }
    return true;
  }

  // Clear + putAll fallback for SQLite (deletions stick across reload)
  async replaceAll(storeName, dataArray) {
    try { await this.api.clear(storeName); } catch (e) { /* ignore */ }
    const result = await this.api.putAll(storeName, dataArray || []);
    if (!result.success) {
      console.error(`SQLite replaceAll error:`, result.error);
      throw new Error(result.error);
    }
    return true;
  }

  async clear(storeName) {
    const result = await this.api.clear(storeName);
    if (!result.success) {
      console.error(`SQLite clear error:`, result.error);
      throw new Error(result.error);
    }
    return true;
  }

  async checkHealth() {
    const result = await this.api.checkHealth();
    if (!result.success) {
      return { status: 'critical', error: result.error };
    }
    return result.data;
  }

  async exportAllData() {
    const result = await this.api.exportAll();
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.data;
  }

  async importAllData(data) {
    const result = await this.api.importAll(data);
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.data;
  }

  async vacuum() {
    return await this.api.vacuum();
  }

  async createBackup(path) {
    return await this.api.createBackup(path);
  }

  async restoreBackup(path) {
    return await this.api.restoreBackup(path);
  }

  async getDbPath() {
    return await this.api.getPath();
  }

  // Checkpoint methods (for compatibility - SQLite doesn't need these)
  async createCheckpoint() {
    // SQLite auto-saves, but we can trigger a backup
    console.log('✅ SQLite checkpoint (auto-saved)');
    return true;
  }

  async restoreFromCheckpoint(index = 0) {
    console.warn('SQLite uses file backups instead of checkpoints');
    return false;
  }

  getCheckpoints() {
    return []; // SQLite uses file backups
  }
}

// ========================================
// IndexedDB Store (fallback for browser)
// ========================================
class IndexedDBStore {
  constructor() {
    this.dbName = 'AgriStoreDB';
    this.version = 6;
    this.db = null;
    this.initPromise = null;
  }

  async init() {
    // Prevent multiple initializations
    if (this.db) return this;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => {
        console.error('Failed to open database:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ Local database initialized (IndexedDB)');
        resolve(this);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object stores for each table
        const stores = [
          'users', 'customers', 'items', 'invoices', 'purchases',
          'companies', 'categories', 'purchase_items', 'purchase_categories',
          'activity', 'store_settings', 'settings', 'batches', 'sync_queue'
        ];
        
        stores.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            store.createIndex('updated_at', 'updated_at', { unique: false });
            // Add itemId index for batches table
            if (storeName === 'batches') {
              store.createIndex('itemId', 'itemId', { unique: false });
            }
          }
        });
      };
    });

    return this.initPromise;
  }

  async ensureDB() {
    if (!this.db) {
      await this.init();
    }
    return this.db;
  }

  async getAll(storeName) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        
        request.onsuccess = () => {
          // Filter out deleted records
          const results = (request.result || []).filter(r => !r.deleted);
          resolve(results);
        };
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.error(`Error in getAll(${storeName}):`, err);
        resolve([]); // Return empty array on error
      }
    });
  }

  async get(storeName, id) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(id);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.error(`Error in get(${storeName}, ${id}):`, err);
        resolve(null);
      }
    });
  }

  async put(storeName, data) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        
        const record = {
          ...data,
          updated_at: Date.now()
        };
        
        const request = store.put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.error(`Error in put(${storeName}):`, err);
        reject(err);
      }
    });
  }

  async delete(storeName, id) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(id);
        
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.error(`Error in delete(${storeName}, ${id}):`, err);
        reject(err);
      }
    });
  }

  async putAll(storeName, dataArray) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        
        dataArray.forEach(data => {
          const record = {
            ...data,
            updated_at: data.updated_at || Date.now()
          };
          store.put(record);
        });
        
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
      } catch (err) {
        console.error(`Error in putAll(${storeName}):`, err);
        reject(err);
      }
    });
  }

  // Replace entire store contents in a single transaction (clear + put all).
  // Without this, deleted items would silently come back on reload because putAll only upserts.
  async replaceAll(storeName, dataArray) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        store.clear();
        (dataArray || []).forEach((data) => {
          const record = { ...data, updated_at: data.updated_at || Date.now() };
          store.put(record);
        });
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error);
      } catch (err) {
        console.error(`Error in replaceAll(${storeName}):`, err);
        reject(err);
      }
    });
  }

  async clear(storeName) {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      } catch (err) {
        console.error(`Error in clear(${storeName}):`, err);
        reject(err);
      }
    });
  }

  // ========================================
  // DATA INTEGRITY & PROTECTION FEATURES
  // ========================================

  /**
   * Check database health and integrity
   */
  async checkHealth() {
    try {
      const db = await this.ensureDB();
      const stores = ['customers', 'items', 'invoices', 'purchases', 'users'];
      const health = { status: 'healthy', stores: {}, totalRecords: 0 };

      for (const storeName of stores) {
        try {
          const records = await this.getAll(storeName);
          health.stores[storeName] = {
            count: records.length,
            status: 'ok'
          };
          health.totalRecords += records.length;
        } catch (err) {
          health.stores[storeName] = {
            count: 0,
            status: 'error',
            error: err.message
          };
          health.status = 'degraded';
        }
      }

      return health;
    } catch (err) {
      return { status: 'critical', error: err.message };
    }
  }

  /**
   * Export all data to JSON (for file backup)
   */
  async exportAllData() {
    const stores = ['customers', 'items', 'invoices', 'purchases', 'users', 'companies', 'categories', 'activity', 'store_settings'];
    const data = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      dbVersion: this.version,
      stores: {}
    };

    for (const storeName of stores) {
      try {
        data.stores[storeName] = await this.getAll(storeName);
      } catch (err) {
        data.stores[storeName] = [];
        console.error(`Failed to export ${storeName}:`, err);
      }
    }

    return data;
  }

  /**
   * Import all data from JSON backup
   */
  async importAllData(data) {
    if (!data || !data.stores) {
      throw new Error('Invalid backup data format');
    }

    const results = { success: true, imported: {}, errors: [] };

    for (const [storeName, records] of Object.entries(data.stores)) {
      if (!Array.isArray(records)) continue;
      
      try {
        // Clear existing data
        await this.clear(storeName);
        
        // Import new data
        if (records.length > 0) {
          await this.putAll(storeName, records);
        }
        
        results.imported[storeName] = records.length;
      } catch (err) {
        results.errors.push({ store: storeName, error: err.message });
        results.success = false;
      }
    }

    return results;
  }

  /**
   * Create a checkpoint backup in localStorage
   */
  async createCheckpoint() {
    try {
      const data = await this.exportAllData();
      const checkpoint = {
        timestamp: Date.now(),
        data: data
      };
      
      // Store compressed in localStorage (keeps last 3 checkpoints)
      const checkpoints = JSON.parse(localStorage.getItem('db_checkpoints') || '[]');
      checkpoints.unshift(checkpoint);
      
      // Keep only last 3 checkpoints
      while (checkpoints.length > 3) {
        checkpoints.pop();
      }
      
      localStorage.setItem('db_checkpoints', JSON.stringify(checkpoints));
      console.log('✅ Database checkpoint created');
      return true;
    } catch (err) {
      console.error('❌ Checkpoint creation failed:', err);
      return false;
    }
  }

  /**
   * Restore from checkpoint
   */
  async restoreFromCheckpoint(checkpointIndex = 0) {
    try {
      const checkpoints = JSON.parse(localStorage.getItem('db_checkpoints') || '[]');
      
      if (checkpoints.length === 0) {
        throw new Error('No checkpoints available');
      }
      
      if (checkpointIndex >= checkpoints.length) {
        throw new Error('Invalid checkpoint index');
      }
      
      const checkpoint = checkpoints[checkpointIndex];
      await this.importAllData(checkpoint.data);
      
      console.log('✅ Restored from checkpoint:', new Date(checkpoint.timestamp).toLocaleString());
      return true;
    } catch (err) {
      console.error('❌ Restore from checkpoint failed:', err);
      throw err;
    }
  }

  /**
   * Get available checkpoints
   */
  getCheckpoints() {
    const checkpoints = JSON.parse(localStorage.getItem('db_checkpoints') || '[]');
    return checkpoints.map((cp, index) => ({
      index,
      date: new Date(cp.timestamp).toLocaleString(),
      timestamp: cp.timestamp,
      stores: Object.keys(cp.data.stores || {}).length
    }));
  }
}

// Singleton instance
let dbInstance = null;

export async function getDatabase() {
  if (!dbInstance) {
    let usingIndexedDbFallback = false;

    // Try SQLite first when running in Electron
    if (useSQLite()) {
      try {
        console.log('🗄️ Trying SQLite database (Electron)...');
        const sqlite = new SQLiteStore();
        await sqlite.init(); // probes IPC; throws if main can't load better-sqlite3
        dbInstance = sqlite;
      } catch (err) {
        console.warn('⚠️ SQLite unavailable, falling back to IndexedDB to prevent data loss:', err?.message || err);
        dbInstance = new IndexedDBStore();
        await dbInstance.init();
        usingIndexedDbFallback = true;
      }
    } else {
      console.log('🗄️ Using IndexedDB (Browser fallback)');
      dbInstance = new IndexedDBStore();
      await dbInstance.init();
      usingIndexedDbFallback = true;
    }

    // Create checkpoint on first load (IndexedDB only)
    if (usingIndexedDbFallback) {
      setTimeout(() => {
        try { dbInstance.createCheckpoint?.(); } catch (_) {}
      }, 5000);
    }
  }
  return dbInstance;
}

// Generate unique ID
export function generateId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ── Password hashing ────────────────────────────────────────────────────────
// Current algorithm: PBKDF2-SHA256, per-user random salt, 100k iterations.
// Stored format:  pbkdf2$sha256$<iterations>$<salt_b64>$<hash_b64>
// Legacy bare-hex SHA-256 strings (with shared salt "agristore_salt_2024")
// are still accepted on login and transparently upgraded to PBKDF2.

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_HASH_BYTES = 32;
const LEGACY_SHARED_SALT = 'agristore_salt_2024';

function b64encode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2Derive(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    key,
    PBKDF2_HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

// Constant-time string compare — prevents timing attacks
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// Hash password using PBKDF2-SHA256 with a fresh random salt
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await pbkdf2Derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${b64encode(salt)}$${b64encode(hash)}`;
}

// Legacy SHA-256 with a shared salt (kept only for verifying old hashes)
async function legacySha256(password) {
  const data = new TextEncoder().encode(password + LEGACY_SHARED_SALT);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password, hash) {
  if (!hash) return false;
  if (hash.startsWith('pbkdf2$sha256$')) {
    const [, , iterStr, saltB64, hashB64] = hash.split('$');
    const iterations = parseInt(iterStr, 10);
    if (!Number.isFinite(iterations)) return false;
    const derived = await pbkdf2Derive(password, b64decode(saltB64), iterations);
    return constantTimeEqual(b64encode(derived), hashB64);
  }
  // Legacy bare SHA-256 hex
  const legacy = await legacySha256(password);
  return constantTimeEqual(legacy, hash);
}

// True when a stored hash uses the deprecated algorithm and should be re-hashed on next login
export function needsRehash(hash) {
  return !!hash && !hash.startsWith('pbkdf2$sha256$');
}

export default { getDatabase, generateId, hashPassword, verifyPassword, needsRehash, isElectron };
