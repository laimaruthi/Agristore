/**
 * Crash Recovery & Data Protection Service
 * Handles app crashes, auto-backup, and data recovery
 */

import { getDatabase } from './localDatabase.js';

// Auto-backup interval (every 5 minutes)
const AUTO_BACKUP_INTERVAL = 5 * 60 * 1000;

// Maximum number of auto-backups to keep
const MAX_AUTO_BACKUPS = 10;

// Backup storage key prefix
const BACKUP_PREFIX = 'agristore_backup_';
const LAST_BACKUP_KEY = 'agristore_last_backup';
const CRASH_FLAG_KEY = 'agristore_app_running';
const HEARTBEAT_KEY = 'agristore_heartbeat';
const LAST_FILE_EXPORT_KEY = 'agristore_last_file_export';
const BACKUP_REMINDER_DISMISSED_KEY = 'agristore_reminder_dismissed';

// Heartbeat: write a timestamp while the app is alive. A crash is only real
// if the running flag is set AND the last heartbeat is older than this window —
// this prevents false positives on normal refreshes where beforeunload/unload
// didn't fire reliably (Chrome bfcache, force-close, dev HMR).
const HEARTBEAT_INTERVAL = 3000;
const CRASH_STALENESS_MS = 10000;

// Reminder thresholds
const DAYS_UNTIL_WARNING = 3; // Show warning after 3 days
const DAYS_UNTIL_CRITICAL = 7; // Critical warning after 7 days

let autoBackupTimer = null;
let heartbeatTimer = null;

function writeHeartbeat() {
  try { localStorage.setItem(HEARTBEAT_KEY, Date.now().toString()); } catch {}
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  writeHeartbeat();
  heartbeatTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL);
  // Also update on tab becoming visible — keeps heartbeat fresh even if timers were throttled
  document.addEventListener('visibilitychange', writeHeartbeat);
}

/**
 * Initialize crash recovery system
 * Call this when app starts
 */
export async function initCrashRecovery() {
  console.log('🛡️ Initializing crash recovery system...');

  // Only treat the previous session as crashed if the running flag is still set
  // AND the heartbeat is stale. A normal refresh always has a very recent
  // heartbeat because we write one every few seconds while alive.
  const flagWasSet = localStorage.getItem(CRASH_FLAG_KEY) === 'true';
  const lastBeat = parseInt(localStorage.getItem(HEARTBEAT_KEY) || '0', 10);
  // If heartbeat has never been written (e.g. first run after this change), we
  // can't tell — be conservative and don't show the dialog.
  const heartbeatStale = lastBeat > 0 && (Date.now() - lastBeat) > CRASH_STALENESS_MS;
  const wasCrashed = flagWasSet && heartbeatStale;

  if (wasCrashed) {
    console.warn('⚠️ App crashed last time! Recovery mode activated.');
  }

  // Set running flag + start heartbeat
  localStorage.setItem(CRASH_FLAG_KEY, 'true');
  startHeartbeat();

  // Start auto-backup
  startAutoBackup();

  // Listen for app close/unload (best effort — heartbeat is the reliable signal)
  window.addEventListener('beforeunload', handleAppClose);
  window.addEventListener('pagehide', handleAppClose);

  // Listen for errors
  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleError);

  return wasCrashed;
}

/**
 * Handle app close properly
 */
function handleAppClose() {
  // Clear running flag - app closed normally
  localStorage.setItem(CRASH_FLAG_KEY, 'false');
  stopAutoBackup();
}

/**
 * Handle errors
 */
async function handleError(event) {
  console.error('❌ Error detected:', event);
  // Create emergency backup on error
  createBackup('emergency').catch(console.error);
  
  // Also create a database checkpoint
  try {
    const { getDatabase } = await import('./localDatabase.js');
    const db = await getDatabase();
    await db.createCheckpoint();
  } catch (err) {
    console.error('Checkpoint creation failed:', err);
  }
}

/**
 * Start auto-backup timer
 */
export function startAutoBackup() {
  if (autoBackupTimer) return;
  
  console.log('⏰ Starting auto-backup (every 5 minutes)');
  
  // Create initial backup
  createBackup('auto').catch(console.error);
  
  // Schedule periodic backups
  autoBackupTimer = setInterval(() => {
    createBackup('auto').catch(console.error);
  }, AUTO_BACKUP_INTERVAL);
}

/**
 * Stop auto-backup timer
 */
export function stopAutoBackup() {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
}

/**
 * Create a backup of all data
 */
export async function createBackup(type = 'manual') {
  try {
    const localDb = await getDatabase();
    
    // Get all data from all stores
    const backup = {
      version: 1,
      type: type,
      timestamp: Date.now(),
      date: new Date().toISOString(),
      data: {
        items: await localDb.getAll('items'),
        customers: await localDb.getAll('customers'),
        invoices: await localDb.getAll('invoices'),
        purchases: await localDb.getAll('purchases'),
        users: await localDb.getAll('users'),
        settings: await localDb.getAll('settings'),
      }
    };
    
    const backupKey = `${BACKUP_PREFIX}${type}_${Date.now()}`;
    
    // Store backup in localStorage (for quick recovery)
    try {
      localStorage.setItem(backupKey, JSON.stringify(backup));
      localStorage.setItem(LAST_BACKUP_KEY, backupKey);
    } catch (e) {
      // localStorage might be full - clean old backups
      await cleanOldBackups();
      localStorage.setItem(backupKey, JSON.stringify(backup));
      localStorage.setItem(LAST_BACKUP_KEY, backupKey);
    }
    
    // Clean old auto-backups
    if (type === 'auto') {
      await cleanOldBackups();
    }
    
    console.log(`✅ Backup created: ${type} (${new Date().toLocaleTimeString()})`);
    
    return backup;
  } catch (error) {
    console.error('❌ Backup failed:', error);
    throw error;
  }
}

/**
 * Clean old auto-backups, keep only recent ones
 */
async function cleanOldBackups() {
  const backupKeys = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(BACKUP_PREFIX + 'auto_')) {
      backupKeys.push(key);
    }
  }
  
  // Sort by timestamp (newest first)
  backupKeys.sort((a, b) => {
    const timeA = parseInt(a.split('_').pop()) || 0;
    const timeB = parseInt(b.split('_').pop()) || 0;
    return timeB - timeA;
  });
  
  // Remove old backups
  if (backupKeys.length > MAX_AUTO_BACKUPS) {
    const toRemove = backupKeys.slice(MAX_AUTO_BACKUPS);
    toRemove.forEach(key => localStorage.removeItem(key));
    console.log(`🗑️ Cleaned ${toRemove.length} old backups`);
  }
}

/**
 * Get list of available backups
 */
export function getBackupList() {
  const backups = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(BACKUP_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        backups.push({
          key: key,
          type: data.type,
          timestamp: data.timestamp,
          date: data.date,
          itemCount: data.data?.items?.length || 0,
          customerCount: data.data?.customers?.length || 0,
          invoiceCount: data.data?.invoices?.length || 0,
        });
      } catch (e) {
        // Invalid backup, skip
      }
    }
  }
  
  // Sort by timestamp (newest first)
  backups.sort((a, b) => b.timestamp - a.timestamp);
  
  return backups;
}

/**
 * Restore data from a backup
 */
export async function restoreFromBackup(backupKey) {
  try {
    const backupData = localStorage.getItem(backupKey);
    if (!backupData) {
      throw new Error('Backup not found');
    }
    
    const backup = JSON.parse(backupData);
    const localDb = await getDatabase();
    
    console.log('🔄 Restoring from backup:', backup.date);
    
    // Clear existing data and restore
    if (backup.data.items?.length > 0) {
      await localDb.clear('items');
      await localDb.putAll('items', backup.data.items);
    }
    
    if (backup.data.customers?.length > 0) {
      await localDb.clear('customers');
      await localDb.putAll('customers', backup.data.customers);
    }
    
    if (backup.data.invoices?.length > 0) {
      await localDb.clear('invoices');
      await localDb.putAll('invoices', backup.data.invoices);
    }
    
    if (backup.data.purchases?.length > 0) {
      await localDb.clear('purchases');
      await localDb.putAll('purchases', backup.data.purchases);
    }
    
    if (backup.data.settings?.length > 0) {
      await localDb.clear('settings');
      await localDb.putAll('settings', backup.data.settings);
    }
    
    // Don't restore users to avoid login issues
    
    console.log('✅ Restore complete!');
    
    return {
      success: true,
      restoredFrom: backup.date,
      items: backup.data.items?.length || 0,
      customers: backup.data.customers?.length || 0,
      invoices: backup.data.invoices?.length || 0,
    };
  } catch (error) {
    console.error('❌ Restore failed:', error);
    throw error;
  }
}

/**
 * Export all data to a JSON file (download)
 */
export async function exportToFile() {
  try {
    const backup = await createBackup('export');
    
    // Create download
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `AgriStore_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('✅ Data exported to file');
    
    return true;
  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  }
}

/**
 * Import data from a JSON file
 */
export async function importFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const backup = JSON.parse(event.target.result);
        
        // Validate backup structure
        if (!backup.data || !backup.version) {
          throw new Error('Invalid backup file format');
        }
        
        // Create a backup of current data first
        await createBackup('before_import');
        
        const localDb = await getDatabase();
        
        // Import data
        if (backup.data.items?.length > 0) {
          await localDb.clear('items');
          await localDb.putAll('items', backup.data.items);
        }
        
        if (backup.data.customers?.length > 0) {
          await localDb.clear('customers');
          await localDb.putAll('customers', backup.data.customers);
        }
        
        if (backup.data.invoices?.length > 0) {
          await localDb.clear('invoices');
          await localDb.putAll('invoices', backup.data.invoices);
        }
        
        if (backup.data.purchases?.length > 0) {
          await localDb.clear('purchases');
          await localDb.putAll('putAll', backup.data.purchases);
        }
        
        if (backup.data.settings?.length > 0) {
          await localDb.clear('settings');
          await localDb.putAll('settings', backup.data.settings);
        }
        
        console.log('✅ Data imported from file');
        
        resolve({
          success: true,
          importedFrom: backup.date,
          items: backup.data.items?.length || 0,
          customers: backup.data.customers?.length || 0,
          invoices: backup.data.invoices?.length || 0,
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Get last backup info
 */
export function getLastBackupInfo() {
  const lastBackupKey = localStorage.getItem(LAST_BACKUP_KEY);
  if (!lastBackupKey) return null;
  
  try {
    const backup = JSON.parse(localStorage.getItem(lastBackupKey));
    return {
      date: backup.date,
      type: backup.type,
      timestamp: backup.timestamp,
    };
  } catch {
    return null;
  }
}

/**
 * Check if app crashed last time
 */
export function didAppCrash() {
  return localStorage.getItem(CRASH_FLAG_KEY) === 'true';
}

/**
 * Clear crash flag (call after user acknowledges)
 */
export function clearCrashFlag() {
  localStorage.setItem(CRASH_FLAG_KEY, 'false');
}

/**
 * Get backup status for dashboard/reminders
 * Returns info about when last file export was done
 */
export function getBackupStatus() {
  const lastExport = localStorage.getItem(LAST_FILE_EXPORT_KEY);
  const lastDismissed = localStorage.getItem(BACKUP_REMINDER_DISMISSED_KEY);
  
  if (!lastExport) {
    return {
      lastExportDate: null,
      daysSinceExport: Infinity,
      status: 'never', // Never exported
      needsReminder: true,
      message: '⚠️ No backup file created yet! Export your data to stay safe.',
    };
  }
  
  const lastExportTime = parseInt(lastExport);
  const daysSince = Math.floor((Date.now() - lastExportTime) / (24 * 60 * 60 * 1000));
  
  // Check if reminder was dismissed today
  const dismissedToday = lastDismissed && 
    (Date.now() - parseInt(lastDismissed)) < (24 * 60 * 60 * 1000);
  
  let status = 'good';
  let needsReminder = false;
  let message = `✅ Last backup: ${daysSince === 0 ? 'Today' : daysSince === 1 ? 'Yesterday' : `${daysSince} days ago`}`;
  
  if (daysSince >= DAYS_UNTIL_CRITICAL) {
    status = 'critical';
    needsReminder = !dismissedToday;
    message = `🚨 CRITICAL: No backup for ${daysSince} days! Your data is at risk!`;
  } else if (daysSince >= DAYS_UNTIL_WARNING) {
    status = 'warning';
    needsReminder = !dismissedToday;
    message = `⚠️ Warning: Last backup was ${daysSince} days ago. Consider exporting now.`;
  }
  
  return {
    lastExportDate: new Date(lastExportTime).toLocaleDateString(),
    lastExportTime: lastExportTime,
    daysSinceExport: daysSince,
    status,
    needsReminder,
    message,
  };
}

/**
 * Record that a file export was done
 */
export function recordFileExport() {
  localStorage.setItem(LAST_FILE_EXPORT_KEY, Date.now().toString());
  localStorage.removeItem(BACKUP_REMINDER_DISMISSED_KEY);
}

/**
 * Dismiss backup reminder for today
 */
export function dismissBackupReminder() {
  localStorage.setItem(BACKUP_REMINDER_DISMISSED_KEY, Date.now().toString());
}

/**
 * Check if should show exit reminder (when closing app)
 */
export function shouldShowExitReminder() {
  const status = getBackupStatus();
  return status.daysSinceExport >= DAYS_UNTIL_WARNING;
}

export default {
  initCrashRecovery,
  createBackup,
  getBackupList,
  restoreFromBackup,
  exportToFile,
  importFromFile,
  getLastBackupInfo,
  didAppCrash,
  clearCrashFlag,
  startAutoBackup,
  stopAutoBackup,
  getBackupStatus,
  recordFileExport,
  dismissBackupReminder,
  shouldShowExitReminder,
};
