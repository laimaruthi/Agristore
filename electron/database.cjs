/**
 * SQLite Database Service for Electron
 * More reliable than IndexedDB for 10+ years of data storage
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db = null;
let dbPath = null;

// Table schemas
const TABLES = {
  customers: `
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      gst_number TEXT,
      balance REAL DEFAULT 0,
      notes TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  items: `
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      unit TEXT,
      purchase_price REAL DEFAULT 0,
      selling_price REAL DEFAULT 0,
      stock REAL DEFAULT 0,
      min_stock REAL DEFAULT 0,
      hsn_code TEXT,
      gst_rate REAL DEFAULT 0,
      description TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  invoices: `
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT,
      customer_id TEXT,
      customer_name TEXT,
      items TEXT,
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      paid REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      payment_method TEXT,
      notes TEXT,
      status TEXT DEFAULT 'pending',
      date TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  purchases: `
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      purchase_number TEXT,
      supplier_name TEXT,
      supplier_phone TEXT,
      items TEXT,
      subtotal REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total REAL DEFAULT 0,
      paid REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      payment_method TEXT,
      notes TEXT,
      status TEXT DEFAULT 'pending',
      date TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      role TEXT DEFAULT 'staff',
      phone TEXT,
      active INTEGER DEFAULT 1,
      last_login INTEGER,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  companies: `
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      gst_number TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  categories: `
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  activity: `
    CREATE TABLE IF NOT EXISTS activity (
      id TEXT PRIMARY KEY,
      type TEXT,
      action TEXT,
      description TEXT,
      user_id TEXT,
      user_name TEXT,
      data TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  store_settings: `
    CREATE TABLE IF NOT EXISTS store_settings (
      id TEXT PRIMARY KEY,
      store_name TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      gst_number TEXT,
      logo TEXT,
      invoice_prefix TEXT,
      invoice_footer TEXT,
      settings TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  settings: `
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      key TEXT,
      value TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  // Generic JSON-blob tables for state that doesn't fit a typed schema.
  // Each row's data column is a JSON-encoded version of the original record.
  kv_store: `
    CREATE TABLE IF NOT EXISTS kv_store (
      id TEXT PRIMARY KEY,
      data TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  other_expenses: `
    CREATE TABLE IF NOT EXISTS other_expenses (
      id TEXT PRIMARY KEY,
      data TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  purchase_items: `
    CREATE TABLE IF NOT EXISTS purchase_items (
      id TEXT PRIMARY KEY,
      data TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  purchase_categories: `
    CREATE TABLE IF NOT EXISTS purchase_categories (
      id TEXT PRIMARY KEY,
      data TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `,
  category_gst: `
    CREATE TABLE IF NOT EXISTS category_gst (
      id TEXT PRIMARY KEY,
      data TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      deleted INTEGER DEFAULT 0
    )
  `
};

// Initialize database
function initDatabase() {
  try {
    // Get user data path
    const userDataPath = app.getPath('userData');
    dbPath = path.join(userDataPath, 'agristore.db');
    
    console.log('📁 Database path:', dbPath);
    
    // Create database
    db = new Database(dbPath);
    
    // Enable WAL mode for better performance and reliability
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');
    db.pragma('temp_store = MEMORY');
    
    // Create tables
    for (const [tableName, schema] of Object.entries(TABLES)) {
      db.exec(schema);
      console.log(`✅ Table ready: ${tableName}`);
    }

    // Run migrations for existing databases
    runMigrations();

    // Create indexes for faster queries
    createIndexes();
    
    console.log('✅ SQLite database initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

/**
 * Run migrations to upgrade existing databases to the latest schema.
 * Safe to run on every startup — each step checks current state first.
 */
function runMigrations() {
  try {
    // ── Migration: users.password → users.password_hash ──────────────────────
    const userCols = db.prepare("PRAGMA table_info(users)").all();
    const hasOldPwd = userCols.some(c => c.name === 'password');
    const hasNewPwd = userCols.some(c => c.name === 'password_hash');

    if (hasOldPwd && !hasNewPwd) {
      // SQLite 3.25+ supports RENAME COLUMN
      try {
        db.exec("ALTER TABLE users RENAME COLUMN password TO password_hash");
        console.log('✅ Migrated users.password → password_hash');
      } catch (e) {
        // Fallback: add new column and copy values
        db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
        db.exec("UPDATE users SET password_hash = password WHERE password_hash IS NULL");
        console.log('✅ Added users.password_hash (copied from password)');
      }
    } else if (!hasNewPwd) {
      db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
      console.log('✅ Added users.password_hash column');
    }
  } catch (err) {
    console.warn('⚠️ Migration warning:', err.message);
  }
}

function createIndexes() {
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name)',
    'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)',
    'CREATE INDEX IF NOT EXISTS idx_items_name ON items(name)',
    'CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date)',
    'CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number)',
    'CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date)',
    'CREATE INDEX IF NOT EXISTS idx_activity_type ON activity(type)',
    'CREATE INDEX IF NOT EXISTS idx_activity_date ON activity(created_at)'
  ];
  
  for (const idx of indexes) {
    try {
      db.exec(idx);
    } catch (err) {
      // Index may already exist, ignore
    }
  }
}

// Tables that store the entire record as a JSON blob in `data` column.
// Used for arbitrary state objects/arrays without a typed schema.
const BLOB_TABLES = new Set(['kv_store','other_expenses','purchase_items','purchase_categories','category_gst']);

// Allowlist guard for any function that interpolates a table name into SQL.
// Prepared statements protect the *parameters*, not the identifier. Without this,
// a compromised renderer could pass `; DROP TABLE invoices; --` as a table name.
const ASSERT_TABLE = (tableName) => {
  if (!TABLES[tableName] && !BLOB_TABLES.has(tableName)) {
    throw new Error(`Unknown table: ${tableName}`);
  }
};

// Pack arbitrary record into {id, data:JSON, created_at, updated_at, deleted}
function packBlob(data) {
  const meta = ['id','created_at','updated_at','deleted'];
  const payload = {};
  for (const k of Object.keys(data || {})) {
    if (!meta.includes(k)) payload[k] = data[k];
  }
  return {
    id: data.id || ('row_' + Date.now() + '_' + Math.random().toString(36).slice(2,8)),
    data: JSON.stringify(payload),
    created_at: data.created_at,
    updated_at: data.updated_at,
    deleted: data.deleted || 0,
  };
}

// Unpack {id, data:JSON, ...} back into the original-shape record
function unpackBlob(row) {
  if (!row) return row;
  let payload = {};
  if (row.data && typeof row.data === 'string') {
    try { payload = JSON.parse(row.data); } catch { payload = {}; }
  }
  return { ...payload, id: row.id, created_at: row.created_at, updated_at: row.updated_at };
}

// Get all records from a table
function getAll(tableName) {
  try {
    ASSERT_TABLE(tableName);
    const stmt = db.prepare(`SELECT * FROM ${tableName} WHERE deleted = 0 ORDER BY updated_at DESC`);
    const rows = stmt.all();
    if (BLOB_TABLES.has(tableName)) {
      return rows.map(unpackBlob);
    }
    // Parse JSON fields
    return rows.map(row => parseJsonFields(row, tableName));
  } catch (error) {
    console.error(`Error in getAll(${tableName}):`, error);
    return [];
  }
}

// Get single record by ID
function get(tableName, id) {
  try {
    ASSERT_TABLE(tableName);
    const stmt = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`);
    const row = stmt.get(id);
    if (!row) return null;
    if (BLOB_TABLES.has(tableName)) return unpackBlob(row);
    return parseJsonFields(row, tableName);
  } catch (error) {
    console.error(`Error in get(${tableName}, ${id}):`, error);
    return null;
  }
}

// Insert or update a record
function put(tableName, data) {
  try {
    ASSERT_TABLE(tableName);
    const now = Date.now();
    let record = {
      ...data,
      created_at: data.created_at || now,
      updated_at: now,
      deleted: data.deleted || 0
    };
    
    // Blob-tables: pack arbitrary fields into a single JSON column
    let processedRecord;
    if (BLOB_TABLES.has(tableName)) {
      processedRecord = packBlob(record);
    } else {
      // Stringify JSON fields
      processedRecord = stringifyJsonFields(record, tableName);
    }
    
    // Get column names from record
    const columns = Object.keys(processedRecord);
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns.map(col => `${col} = excluded.${col}`).join(', ');
    
    const sql = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT(id) DO UPDATE SET ${updates}
    `;
    
    const stmt = db.prepare(sql);
    stmt.run(...columns.map(col => processedRecord[col]));
    
    return record;
  } catch (error) {
    console.error(`Error in put(${tableName}):`, error);
    throw error;
  }
}

// Soft delete a record
function deleteRecord(tableName, id) {
  try {
    ASSERT_TABLE(tableName);
    const stmt = db.prepare(`UPDATE ${tableName} SET deleted = 1, updated_at = ? WHERE id = ?`);
    stmt.run(Date.now(), id);
    return true;
  } catch (error) {
    console.error(`Error in delete(${tableName}, ${id}):`, error);
    throw error;
  }
}

// Insert multiple records
function putAll(tableName, dataArray) {
  try {
    const insertMany = db.transaction((records) => {
      for (const data of records) {
        put(tableName, data);
      }
    });
    
    insertMany(dataArray);
    return true;
  } catch (error) {
    console.error(`Error in putAll(${tableName}):`, error);
    throw error;
  }
}

// Clear all records from a table
function clear(tableName) {
  try {
    ASSERT_TABLE(tableName);
    const stmt = db.prepare(`DELETE FROM ${tableName}`);
    stmt.run();
    return true;
  } catch (error) {
    console.error(`Error in clear(${tableName}):`, error);
    throw error;
  }
}

// Parse JSON fields (items array, settings, etc.)
function parseJsonFields(row, tableName) {
  if (!row) return row;
  
  const jsonFields = {
    invoices: ['items'],
    purchases: ['items'],
    store_settings: ['settings'],
    activity: ['data']
  };
  
  const fields = jsonFields[tableName] || [];
  const result = { ...row };
  
  for (const field of fields) {
    if (result[field] && typeof result[field] === 'string') {
      try {
        result[field] = JSON.parse(result[field]);
      } catch (e) {
        // Keep as string if parse fails
      }
    }
  }
  
  return result;
}

// Stringify JSON fields for storage
function stringifyJsonFields(record, tableName) {
  const jsonFields = {
    invoices: ['items'],
    purchases: ['items'],
    store_settings: ['settings'],
    activity: ['data']
  };
  
  const fields = jsonFields[tableName] || [];
  const result = { ...record };
  
  for (const field of fields) {
    if (result[field] && typeof result[field] === 'object') {
      result[field] = JSON.stringify(result[field]);
    }
  }
  
  return result;
}

// Export all data
function exportAllData() {
  const tables = ['customers', 'items', 'invoices', 'purchases', 'users', 'companies', 'categories', 'activity', 'store_settings', 'other_expenses', 'purchase_items', 'purchase_categories', 'category_gst'];
  const data = {
    exportDate: new Date().toISOString(),
    version: '1.0',
    dbType: 'sqlite',
    stores: {}
  };
  
  for (const table of tables) {
    data.stores[table] = getAll(table);
  }
  
  return data;
}

// Import all data
function importAllData(data) {
  if (!data || !data.stores) {
    throw new Error('Invalid backup data format');
  }
  
  const results = { success: true, imported: {}, errors: [] };
  
  const importTransaction = db.transaction(() => {
    for (const [tableName, records] of Object.entries(data.stores)) {
      if (!Array.isArray(records)) continue;
      
      try {
        // Clear existing data
        clear(tableName);
        
        // Import new data
        if (records.length > 0) {
          putAll(tableName, records);
        }
        
        results.imported[tableName] = records.length;
      } catch (err) {
        results.errors.push({ store: tableName, error: err.message });
        results.success = false;
      }
    }
  });
  
  importTransaction();
  return results;
}

// Check database health
function checkHealth() {
  try {
    const tables = ['customers', 'items', 'invoices', 'purchases', 'users'];
    const health = { 
      status: 'healthy', 
      stores: {}, 
      totalRecords: 0,
      dbPath: dbPath,
      dbSize: 0
    };
    
    // Get database file size
    try {
      const stats = fs.statSync(dbPath);
      health.dbSize = Math.round(stats.size / 1024); // KB
    } catch (e) {}
    
    for (const table of tables) {
      try {
        const stmt = db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE deleted = 0`);
        const result = stmt.get();
        health.stores[table] = {
          count: result.count,
          status: 'ok'
        };
        health.totalRecords += result.count;
      } catch (err) {
        health.stores[table] = {
          count: 0,
          status: 'error',
          error: err.message
        };
        health.status = 'degraded';
      }
    }
    
    // Run integrity check
    try {
      const integrity = db.pragma('integrity_check');
      health.integrityCheck = integrity[0].integrity_check === 'ok' ? 'passed' : 'failed';
    } catch (e) {
      health.integrityCheck = 'error';
    }
    
    return health;
  } catch (err) {
    return { status: 'critical', error: err.message };
  }
}

// Vacuum database (optimize and reclaim space)
function vacuumDatabase() {
  try {
    db.exec('VACUUM');
    return { success: true, message: 'Database optimized successfully' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Create backup file
function createBackup(backupPath) {
  try {
    db.backup(backupPath);
    return { success: true, path: backupPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Restore from backup file. Atomic: stages backup in a temp file, snapshots the
// existing DB to .pre-restore so we can roll back if anything goes wrong.
function restoreFromBackup(backupPath) {
  if (!backupPath || !fs.existsSync(backupPath)) {
    return { success: false, error: 'Backup file not found' };
  }
  const tempPath = dbPath + '.restore-tmp';
  const snapshotPath = dbPath + '.pre-restore';
  let closedDb = false;
  try {
    // 1) Stage the backup into a temp file (so a bad copy doesn't corrupt the live DB)
    fs.copyFileSync(backupPath, tempPath);

    // 2) Close the live DB and snapshot it
    if (db) { db.close(); closedDb = true; }
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, snapshotPath);
    }

    // 3) Atomic-ish rename — single syscall, no partial write window
    fs.renameSync(tempPath, dbPath);

    // 4) Reopen
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Snapshot served its purpose; safe to remove
    try { if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath); } catch (_) {}

    return { success: true, message: 'Database restored successfully' };
  } catch (error) {
    // Cleanup temp file if it exists
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    // If the live DB was replaced before we crashed, try rolling back from snapshot
    try {
      if (fs.existsSync(snapshotPath)) {
        fs.copyFileSync(snapshotPath, dbPath);
        fs.unlinkSync(snapshotPath);
      }
    } catch (_) {}
    // Reopen DB so the app remains usable even after a failed restore
    if (closedDb) {
      try { db = new Database(dbPath); db.pragma('journal_mode = WAL'); } catch (_) {}
    }
    return { success: false, error: error.message };
  }
}

// Get database path
function getDatabasePath() {
  return dbPath;
}

// Close database connection
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  getAll,
  get,
  put,
  delete: deleteRecord,
  putAll,
  clear,
  exportAllData,
  importAllData,
  checkHealth,
  vacuumDatabase,
  createBackup,
  restoreFromBackup,
  getDatabasePath,
  closeDatabase
};
