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
    // Get user data path. AGRISTORE_DB_PATH lets tests point at a temp DB
    // without an Electron app instance.
    if (process.env.AGRISTORE_DB_PATH) {
      dbPath = process.env.AGRISTORE_DB_PATH;
    } else {
      const userDataPath = app.getPath('userData');
      dbPath = path.join(userDataPath, 'agristore.db');
    }
    
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

    // ── Migration: ensure every table has a `data` JSON column ───────────────
    // Records are stored losslessly as JSON in `data` (the typed columns are
    // best-effort, for indexes). This makes writes tolerant of any object shape
    // (camelCase fields, nested arrays like payments/items, new fields) instead
    // of throwing "no such column" and wiping data on restore.
    for (const tableName of Object.keys(TABLES)) {
      const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
      if (!cols.some((c) => c.name === 'data')) {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN data TEXT`);
        console.log(`✅ Added ${tableName}.data column`);
      }
    }
    _columnCache = {};
  } catch (err) {
    console.warn('⚠️ Migration warning:', err.message);
  }
}

// Generate a unique id for records that arrive without one.
function generateId() {
  return 'row_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

// Cache of column metadata per table (name → {notnull, type, dflt}). Reset after migrations.
let _columnCache = {};
function tableColumns(tableName) {
  if (!_columnCache[tableName]) {
    const map = new Map();
    for (const c of db.prepare(`PRAGMA table_info(${tableName})`).all()) {
      map.set(c.name, { notnull: c.notnull === 1, type: c.type || '', dflt: c.dflt_value });
    }
    _columnCache[tableName] = map;
  }
  return _columnCache[tableName];
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

// Turn a stored row back into the original-shape record. Prefers the lossless
// `data` JSON blob; falls back to the raw typed row for legacy rows that
// predate the `data` column.
function unpackRow(row) {
  if (!row) return row;
  if (row.data && typeof row.data === 'string') {
    try {
      const payload = JSON.parse(row.data);
      // The blob carries the original id with its original type (e.g. numeric).
      // Fall back to the id column only for legacy rows whose blob lacks it.
      return {
        ...payload,
        id: payload.id !== undefined ? payload.id : row.id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    } catch (_) { /* fall through to typed row */ }
  }
  const { data, deleted, ...rest } = row;
  return rest;
}

// Get all records from a table
function getAll(tableName) {
  try {
    ASSERT_TABLE(tableName);
    const rows = db.prepare(`SELECT * FROM ${tableName} WHERE deleted = 0 ORDER BY updated_at DESC`).all();
    return rows.map(unpackRow);
  } catch (error) {
    console.error(`Error in getAll(${tableName}):`, error);
    return [];
  }
}

// Get single record by ID
function get(tableName, id) {
  try {
    ASSERT_TABLE(tableName);
    const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
    return row ? unpackRow(row) : null;
  } catch (error) {
    console.error(`Error in get(${tableName}, ${id}):`, error);
    return null;
  }
}

// Insert or update a record.
// The COMPLETE record is stored losslessly in the `data` JSON column, so any
// object shape round-trips. Typed columns that happen to match are also filled
// (best-effort, for indexes/queries) — but we ONLY write columns that exist, so
// an unknown/camelCase field can never raise "no such column" and abort a save.
function put(tableName, data) {
  try {
    ASSERT_TABLE(tableName);
    const now = Date.now();
    const idVal = (data.id !== undefined && data.id !== null && data.id !== '') ? data.id : generateId();
    const record = {
      ...data,
      id: idVal,
      created_at: data.created_at || now,
      updated_at: now,
      deleted: data.deleted || 0,
    };

    const cols = tableColumns(tableName);
    // The id COLUMN is the string form (clean TEXT primary key); the `data` blob
    // carries the COMPLETE record incl. the original id with its original type,
    // so numeric ids survive intact and relationships (e.g. invoice.customerId
    // → customer.id) keep matching after a restore.
    const row = {
      id: String(idVal),
      created_at: record.created_at,
      updated_at: record.updated_at,
      deleted: record.deleted,
    };

    // Lossless full payload (everything except system meta) → `data`
    const blobExclude = new Set(['created_at', 'updated_at', 'deleted', 'data']);
    if (cols.has('data')) {
      const payload = {};
      for (const k of Object.keys(record)) if (!blobExclude.has(k)) payload[k] = record[k];
      row.data = JSON.stringify(payload);
    }

    // Best-effort typed columns (only those that actually exist on the table).
    // - Fields the record provides are copied (objects serialized to JSON).
    // - Required (NOT NULL, no default) columns the record lacks get a safe
    //   default so the INSERT never fails — the authoritative value still lives
    //   in `data`. This keeps writes tolerant of records whose shape doesn't
    //   match the legacy typed schema (e.g. primitive-wrapped categories).
    for (const [col, info] of cols) {
      if (col in row) continue; // id + system meta already set above
      if (col in record) {
        const v = record[col];
        row[col] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
      } else if (info.notnull && info.dflt == null) {
        row[col] = /INT|REAL|NUM|BOOL|DOUB|FLOA/i.test(info.type) ? 0 : '';
      }
    }

    const columns = Object.keys(row);
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`;
    db.prepare(sql).run(...columns.map((c) => row[c]));

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

// Restore from backup file. Atomic + validated: rejects non-SQLite files up
// front, stages the backup in a temp file, snapshots the live DB to
// .pre-restore, clears stale WAL/SHM sidecars, swaps via rename, then verifies
// the restored DB (integrity + core schema) BEFORE discarding the snapshot.
function restoreFromBackup(backupPath) {
  if (!backupPath || !fs.existsSync(backupPath)) {
    return { success: false, error: 'Backup file not found' };
  }
  const tempPath = dbPath + '.restore-tmp';
  const snapshotPath = dbPath + '.pre-restore';
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';
  const rm = (p) => { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) { /* ignore */ } };
  let closedDb = false;
  try {
    // 0) Reject anything that isn't a SQLite database (magic header check), so a
    //    stray file picked via "All Files" can't replace the live data.
    const fd = fs.openSync(backupPath, 'r');
    const header = Buffer.alloc(16);
    const read = fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    if (read < 16 || header.toString('utf8', 0, 15) !== 'SQLite format 3') {
      return { success: false, error: 'Selected file is not a valid SQLite database (.db).' };
    }

    // 1) Stage the backup into a temp file (so a bad copy never touches the live DB)
    fs.copyFileSync(backupPath, tempPath);

    // 2) Close the live DB and snapshot it for rollback
    if (db) { db.close(); closedDb = true; }
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, snapshotPath);
    }

    // 3) Clear stale WAL/SHM sidecars — a leftover -wal would otherwise be
    //    replayed onto the freshly restored file and corrupt/mix data.
    rm(walPath); rm(shmPath);

    // 4) Atomic-ish rename — single syscall, no partial write window
    fs.renameSync(tempPath, dbPath);

    // 5) Reopen and VALIDATE before committing the restore
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    const integrity = db.pragma('integrity_check');
    const integrityOk = integrity && integrity[0] && integrity[0].integrity_check === 'ok';
    const coreTables = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('items','invoices','customers')")
      .get().n;
    if (!integrityOk) throw new Error('Restored database failed the integrity check.');
    if (coreTables === 0) throw new Error('This file is not an AgriStore database (core tables missing).');

    // 6) Validated — snapshot no longer needed
    rm(snapshotPath);
    return { success: true, message: 'Database restored successfully' };
  } catch (error) {
    // Cleanup the staged temp file
    rm(tempPath);
    // Roll back from the snapshot if the live DB was already swapped. Must close
    // the (bad) restored handle first — Windows can't overwrite an open file.
    try {
      if (fs.existsSync(snapshotPath)) {
        if (db) { try { db.close(); } catch (_) { /* ignore */ } db = null; }
        rm(walPath); rm(shmPath);
        fs.copyFileSync(snapshotPath, dbPath);
        rm(snapshotPath);
      }
    } catch (_) { /* ignore */ }
    // Reopen so the app stays usable after a failed restore
    if (closedDb) {
      try { db = new Database(dbPath); db.pragma('journal_mode = WAL'); } catch (_) { /* ignore */ }
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
