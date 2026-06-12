/**
 * Firebase Cloud Sync Service
 * - Uses Firebase Realtime Database (FREE tier available)
 * - Sync between multiple devices
 * - Automatic offsite backup
 * - Works offline with local persistence
 * 
 * Firebase Free Tier:
 * - 1GB storage
 * - 10GB/month downloads
 * - 100 simultaneous connections
 */

import { getDatabase as getLocalDatabase } from './localDatabase.js';

// Firebase SDK (loaded dynamically)
let firebaseApp = null;
let firebaseDb = null;
let firebaseAuth = null;

// ========================================
// Firebase Configuration
// ========================================

const FIREBASE_CONFIG_KEY = 'agristore_firebase_config';
const LAST_SYNC_KEY = 'agristore_firebase_last_sync';

/**
 * Default Firebase config (you can change this)
 * Create your own at: https://console.firebase.google.com
 */
const DEFAULT_CONFIG = {
  // REPLACE WITH YOUR FIREBASE CONFIG
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

/**
 * Get Firebase configuration
 */
export function getFirebaseConfig() {
  try {
    const saved = localStorage.getItem(FIREBASE_CONFIG_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

/**
 * Save Firebase configuration
 */
export function setFirebaseConfig(config) {
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

/**
 * Check if Firebase sync is configured
 */
export function isFirebaseSyncConfigured() {
  const config = getFirebaseConfig();
  return config?.enabled && config?.databaseURL;
}

// ========================================
// Firebase Initialization
// ========================================

/**
 * Load Firebase SDK dynamically
 */
async function loadFirebaseSDK() {
  if (firebaseApp) return { app: firebaseApp, db: firebaseDb, auth: firebaseAuth };
  
  try {
    // Import Firebase modules
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
    const { getDatabase, ref, set, get, push, update, remove, onValue, off } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
    const { getAuth, signInAnonymously, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    
    const config = getFirebaseConfig();
    if (!config?.apiKey) {
      throw new Error('Firebase not configured');
    }
    
    // Initialize Firebase
    firebaseApp = initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      databaseURL: config.databaseURL,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    });
    
    firebaseDb = getDatabase(firebaseApp);
    firebaseAuth = getAuth(firebaseApp);
    
    // Sign in anonymously (or you can add email auth)
    await signInAnonymously(firebaseAuth);
    
    console.log('✅ Firebase initialized');
    
    return {
      app: firebaseApp,
      db: firebaseDb,
      auth: firebaseAuth,
      ref, set, get, push, update, remove, onValue, off
    };
  } catch (err) {
    console.error('Firebase init error:', err);
    throw err;
  }
}

// ========================================
// Sync Operations
// ========================================

/**
 * Get store path in Firebase
 */
function getStorePath() {
  const config = getFirebaseConfig();
  return `stores/${config?.storeId || 'default'}`;
}

/**
 * Upload all local data to Firebase
 */
export async function uploadToFirebase() {
  const config = getFirebaseConfig();
  if (!config?.enabled) {
    return { success: false, error: 'Firebase sync not enabled' };
  }
  
  try {
    const firebase = await loadFirebaseSDK();
    const localDb = await getLocalDatabase();
    
    // Get all local data
    const data = {
      customers: await localDb.getAll('customers'),
      items: await localDb.getAll('items'),
      invoices: await localDb.getAll('invoices'),
      purchases: await localDb.getAll('purchases'),
      companies: await localDb.getAll('companies'),
      categories: await localDb.getAll('categories'),
      batches: await localDb.getAll('batches'),
      users: await localDb.getAll('users'),
      activity: (await localDb.getAll('activity')).slice(0, 100), // Limit activity
      store_settings: await localDb.get('store_settings', 'main'),
      _meta: {
        lastSync: new Date().toISOString(),
        version: '1.1.0',
        recordCount: 0,
      }
    };
    
    // Count records
    data._meta.recordCount = Object.values(data)
      .filter(v => Array.isArray(v))
      .reduce((sum, arr) => sum + arr.length, 0);
    
    // Upload to Firebase
    const storePath = getStorePath();
    const storeRef = firebase.ref(firebase.db, storePath);
    await firebase.set(storeRef, data);
    
    // Save last sync time
    localStorage.setItem(LAST_SYNC_KEY, data._meta.lastSync);
    
    console.log(`✅ Uploaded ${data._meta.recordCount} records to Firebase`);
    
    return {
      success: true,
      recordCount: data._meta.recordCount,
      timestamp: data._meta.lastSync,
    };
  } catch (err) {
    console.error('Firebase upload error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Download all data from Firebase to local
 */
export async function downloadFromFirebase() {
  const config = getFirebaseConfig();
  if (!config?.enabled) {
    return { success: false, error: 'Firebase sync not enabled' };
  }
  
  try {
    const firebase = await loadFirebaseSDK();
    const localDb = await getLocalDatabase();
    
    // Get data from Firebase
    const storePath = getStorePath();
    const storeRef = firebase.ref(firebase.db, storePath);
    const snapshot = await firebase.get(storeRef);
    
    if (!snapshot.exists()) {
      return { success: true, message: 'No data in Firebase', recordCount: 0 };
    }
    
    const data = snapshot.val();
    let imported = 0;
    
    // Import each table
    const tables = ['customers', 'items', 'invoices', 'purchases', 'companies', 'categories', 'batches', 'users', 'activity'];
    
    for (const table of tables) {
      if (data[table] && Array.isArray(data[table])) {
        for (const record of data[table]) {
          if (record && record.id) {
            await localDb.put(table, record);
            imported++;
          }
        }
      }
    }
    
    // Import store settings
    if (data.store_settings) {
      await localDb.put('store_settings', { ...data.store_settings, id: 'main' });
    }
    
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    
    console.log(`✅ Downloaded ${imported} records from Firebase`);
    
    return {
      success: true,
      recordCount: imported,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error('Firebase download error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Full sync - merge local and cloud data
 */
export async function syncWithFirebase() {
  const config = getFirebaseConfig();
  if (!config?.enabled) {
    return { success: false, error: 'Firebase sync not enabled' };
  }
  
  try {
    // Upload local changes first
    const uploadResult = await uploadToFirebase();
    
    return {
      success: uploadResult.success,
      uploaded: uploadResult.recordCount || 0,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ========================================
// Real-time Sync (Optional)
// ========================================

let realtimeUnsubscribe = null;

/**
 * Start real-time sync listener
 * Changes in Firebase will automatically update local database
 */
export async function startRealtimeSync(onUpdate) {
  const config = getFirebaseConfig();
  if (!config?.enabled || !config?.realtimeSync) {
    return;
  }
  
  try {
    const firebase = await loadFirebaseSDK();
    const storePath = getStorePath();
    const storeRef = firebase.ref(firebase.db, storePath);
    
    realtimeUnsubscribe = firebase.onValue(storeRef, async (snapshot) => {
      if (snapshot.exists()) {
        console.log('📥 Real-time update from Firebase');
        await downloadFromFirebase();
        onUpdate?.();
      }
    });
    
    console.log('✅ Real-time sync started');
  } catch (err) {
    console.error('Real-time sync error:', err);
  }
}

/**
 * Stop real-time sync
 */
export function stopRealtimeSync() {
  if (realtimeUnsubscribe) {
    realtimeUnsubscribe();
    realtimeUnsubscribe = null;
    console.log('⏹️ Real-time sync stopped');
  }
}

// ========================================
// Backup Operations
// ========================================

/**
 * Create a timestamped backup in Firebase
 */
export async function createFirebaseBackup() {
  const config = getFirebaseConfig();
  if (!config?.enabled) {
    return { success: false, error: 'Firebase sync not enabled' };
  }
  
  try {
    const firebase = await loadFirebaseSDK();
    const localDb = await getLocalDatabase();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `backups/${config.storeId}/${timestamp}`;
    
    // Get all local data
    const data = {
      customers: await localDb.getAll('customers'),
      items: await localDb.getAll('items'),
      invoices: await localDb.getAll('invoices'),
      purchases: await localDb.getAll('purchases'),
      companies: await localDb.getAll('companies'),
      batches: await localDb.getAll('batches'),
      store_settings: await localDb.get('store_settings', 'main'),
      _meta: {
        timestamp: new Date().toISOString(),
        storeId: config.storeId,
      }
    };
    
    // Save backup
    const backupRef = firebase.ref(firebase.db, backupPath);
    await firebase.set(backupRef, data);
    
    console.log(`✅ Backup created: ${backupPath}`);
    
    return {
      success: true,
      backupId: timestamp,
      path: backupPath,
    };
  } catch (err) {
    console.error('Backup error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * List available backups
 */
export async function listFirebaseBackups() {
  const config = getFirebaseConfig();
  if (!config?.enabled) {
    return { success: false, backups: [] };
  }
  
  try {
    const firebase = await loadFirebaseSDK();
    const backupsPath = `backups/${config.storeId}`;
    const backupsRef = firebase.ref(firebase.db, backupsPath);
    const snapshot = await firebase.get(backupsRef);
    
    if (!snapshot.exists()) {
      return { success: true, backups: [] };
    }
    
    const backups = [];
    snapshot.forEach((child) => {
      const data = child.val();
      backups.push({
        id: child.key,
        timestamp: data._meta?.timestamp || child.key,
        storeId: data._meta?.storeId,
      });
    });
    
    // Sort by newest first
    backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return { success: true, backups };
  } catch (err) {
    console.error('List backups error:', err);
    return { success: false, backups: [], error: err.message };
  }
}

/**
 * Restore from a backup
 */
export async function restoreFirebaseBackup(backupId) {
  const config = getFirebaseConfig();
  if (!config?.enabled) {
    return { success: false, error: 'Firebase sync not enabled' };
  }
  
  try {
    const firebase = await loadFirebaseSDK();
    const localDb = await getLocalDatabase();
    
    const backupPath = `backups/${config.storeId}/${backupId}`;
    const backupRef = firebase.ref(firebase.db, backupPath);
    const snapshot = await firebase.get(backupRef);
    
    if (!snapshot.exists()) {
      return { success: false, error: 'Backup not found' };
    }
    
    const data = snapshot.val();
    let restored = 0;
    
    // Restore each table
    const tables = ['customers', 'items', 'invoices', 'purchases', 'companies', 'batches'];
    
    for (const table of tables) {
      if (data[table] && Array.isArray(data[table])) {
        // Clear existing data
        await localDb.clear(table);
        // Import backup data
        for (const record of data[table]) {
          if (record && record.id) {
            await localDb.put(table, record);
            restored++;
          }
        }
      }
    }
    
    // Restore store settings
    if (data.store_settings) {
      await localDb.put('store_settings', { ...data.store_settings, id: 'main' });
    }
    
    console.log(`✅ Restored ${restored} records from backup`);
    
    return {
      success: true,
      recordCount: restored,
      backupId,
    };
  } catch (err) {
    console.error('Restore error:', err);
    return { success: false, error: err.message };
  }
}

// ========================================
// Status & Connection Test
// ========================================

/**
 * Get sync status
 */
export function getFirebaseSyncStatus() {
  const config = getFirebaseConfig();
  const lastSync = localStorage.getItem(LAST_SYNC_KEY);
  
  return {
    configured: !!config?.apiKey,
    enabled: config?.enabled || false,
    storeId: config?.storeId || null,
    lastSync: lastSync || null,
    realtimeSync: config?.realtimeSync || false,
  };
}

/**
 * Test Firebase connection
 */
export async function testFirebaseConnection() {
  try {
    const firebase = await loadFirebaseSDK();
    const testRef = firebase.ref(firebase.db, '.info/connected');
    const snapshot = await firebase.get(testRef);
    
    return {
      success: true,
      connected: snapshot.val() === true,
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

let autoSyncInterval = null;

/**
 * Start automatic sync (every N minutes)
 */
export function startAutoSync(intervalMinutes = 5) {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
  }
  
  const config = getFirebaseConfig();
  if (!config?.enabled) {
    return;
  }
  
  // Sync immediately
  syncWithFirebase().catch(console.error);
  
  // Then sync periodically
  autoSyncInterval = setInterval(() => {
    syncWithFirebase().catch(console.error);
  }, intervalMinutes * 60 * 1000);
  
  console.log(`✅ Auto-sync started (every ${intervalMinutes} minutes)`);
}

/**
 * Stop automatic sync
 */
export function stopAutoSync() {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
    console.log('⏹️ Auto-sync stopped');
  }
}
