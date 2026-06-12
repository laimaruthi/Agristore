const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const license = require('./license.cjs');
const autoBackup = require('./autoBackup.cjs');
const { autoUpdater } = require('electron-updater');

// Try to load SQLite - may fail on some systems
let sqliteDB = null;
let useSQLite = false;
try {
  sqliteDB = require('./database.cjs');
  useSQLite = true;
} catch (err) {
  console.warn('⚠️ SQLite not available, will use IndexedDB:', err.message);
}

let mainWindow;
let isLicensed = false;

function createWindow() {
  // Check license first
  const licenseStatus = license.checkLicense();
  isLicensed = licenseStatus.valid;
  console.log('📋 License status:', licenseStatus.status);

  // Initialize SQLite database (if available)
  if (useSQLite && sqliteDB) {
    try {
      sqliteDB.initDatabase();
      console.log('✅ SQLite database ready');
      // Wire up auto-backup once DB is ready
      try {
        autoBackup.init(sqliteDB);
      } catch (e) {
        console.warn('⚠️ Auto-backup init failed:', e.message);
      }
    } catch (err) {
      console.error('❌ SQLite initialization failed, falling back to IndexedDB:', err.message);
      useSQLite = false;
    }
  } else {
    console.log('📦 Using IndexedDB (SQLite not available)');
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'AgriStore',
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const indexPath = path.join(__dirname, '..', 'dist', 'index.html');

  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    console.log('🚀 Loading dev server:', devUrl);
    mainWindow.loadURL(devUrl).catch(err => {
      console.error('Dev URL load error:', err);
      dialog.showErrorBox('Error', 'Failed to load dev URL: ' + err.message);
    });
  } else {
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('Load error:', err);
      dialog.showErrorBox('Error', 'Failed to load application: ' + err.message);
    });
  }

  // Open DevTools only when running unpackaged (during development)
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ========================================
// License IPC Handlers
// ========================================

ipcMain.handle('license-check', async () => {
  return license.checkLicense();
});

ipcMain.handle('license-activate', async (event, licenseKey, storeName) => {
  const result = license.activateLicense(licenseKey, storeName);
  if (result.success) {
    isLicensed = true;
  }
  return result;
});

ipcMain.handle('license-get-machine-id', async () => {
  return license.getDisplayMachineId();
});

ipcMain.handle('license-deactivate', async () => {
  const result = license.deactivateLicense();
  if (result.success) {
    isLicensed = false;
  }
  return result;
});

// For developer: Generate license key
ipcMain.handle('license-generate', async (event, machineId, storeName) => {
  return license.generateKeyForCustomer(machineId, storeName);
});

ipcMain.handle('select-backup-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('save-backup-file', async (event, data) => {
  try {
    const filePath = path.join(data.folderPath, data.fileName);
    fs.writeFileSync(filePath, data.content, 'utf8');
    return { success: true, filePath: filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-folder-access', async (event, folderPath) => {
  try {
    fs.accessSync(folderPath, fs.constants.W_OK);
    return { accessible: true };
  } catch (error) {
    return { accessible: false, error: error.message };
  }
});

ipcMain.handle('get-app-info', () => ({
  isElectron: true,
  version: app.getVersion(),
  platform: process.platform,
  useSQLite: useSQLite
}));

// ========================================
// SQLite Database IPC Handlers
// ========================================

ipcMain.handle('db-get-all', async (event, tableName) => {
  if (!useSQLite || !sqliteDB) return { success: false, error: 'SQLite not available' };
  try {
    return { success: true, data: sqliteDB.getAll(tableName) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-get', async (event, tableName, id) => {
  if (!useSQLite || !sqliteDB) return { success: false, error: 'SQLite not available' };
  try {
    return { success: true, data: sqliteDB.get(tableName, id) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-put', async (event, tableName, data) => {
  if (!useSQLite || !sqliteDB) return { success: false, error: 'SQLite not available' };
  try {
    const result = sqliteDB.put(tableName, data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-delete', async (event, tableName, id) => {
  if (!useSQLite || !sqliteDB) return { success: false, error: 'SQLite not available' };
  try {
    sqliteDB.delete(tableName, id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-put-all', async (event, tableName, dataArray) => {
  if (!useSQLite || !sqliteDB) return { success: false, error: 'SQLite not available' };
  try {
    sqliteDB.putAll(tableName, dataArray);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-clear', async (event, tableName) => {
  if (!useSQLite || !sqliteDB) return { success: false, error: 'SQLite not available' };
  try {
    sqliteDB.clear(tableName);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-export-all', async () => {
  if (!useSQLite || !sqliteDB) return { success: false, error: 'SQLite not available' };
  try {
    return { success: true, data: sqliteDB.exportAllData() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-import-all', async (event, data) => {
  if (!useSQLite || !sqliteDB) return { success: false, error: 'SQLite not available' };
  try {
    const result = sqliteDB.importAllData(data);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-check-health', async () => {
  if (!useSQLite || !sqliteDB) return { success: false, error: 'SQLite not available' };
  try {
    return { success: true, data: sqliteDB.checkHealth() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-vacuum', async () => {
  if (!useSQLite || !sqliteDB) return { success: false, error: 'SQLite not available' };
  try {
    return sqliteDB.vacuumDatabase();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-create-backup', async (event, backupPath) => {
  if (!useSQLite || !sqliteDB) return { success: false, error: 'SQLite not available' };
  try {
    return sqliteDB.createBackup(backupPath);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Reload the renderer 1.5s after a successful restore. The toast stays visible
// for that window; then we force-refresh so the React state hooks re-read from
// the (now-restored) SQLite file instead of holding the pre-restore data in memory.
function scheduleReloadAfterRestore() {
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  }, 1500);
}

ipcMain.handle('db-restore-backup', async (event, backupPath) => {
  if (!useSQLite || !sqliteDB) return { success: false, error: 'SQLite not available' };
  try {
    const result = sqliteDB.restoreFromBackup(backupPath);
    if (result && result.success) scheduleReloadAfterRestore();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db-get-path', async () => {
  if (!useSQLite || !sqliteDB) return null;
  return sqliteDB.getDatabasePath();
});

ipcMain.handle('select-backup-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup File',
    filters: [
      { name: 'Database Files', extensions: ['db', 'sqlite', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('save-backup-dialog', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Database Backup',
    defaultPath: `agristore-backup-${new Date().toISOString().split('T')[0]}.db`,
    filters: [
      { name: 'Database Files', extensions: ['db'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.canceled ? null : result.filePath;
});

// ========================================
// Auto-Update (GitHub Releases)
// ========================================
function sendUpdaterEvent(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setupAutoUpdater() {
  // Download new versions silently in the background, but NEVER install without
  // the user's action. The update applies only when they click "Restart &
  // install" (which calls quitAndInstall); dismissing it leaves them on the
  // current version — nothing installs on quit behind their back.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    console.log('🔄 Checking for update...');
    sendUpdaterEvent('updater:checking');
  });
  autoUpdater.on('update-available', (info) => {
    console.log('⬇️  Update available:', info.version);
    sendUpdaterEvent('updater:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
      releaseName: info.releaseName
    });
  });
  autoUpdater.on('update-not-available', (info) => {
    console.log('✅ App is up to date');
    sendUpdaterEvent('updater:not-available', { version: info?.version });
  });
  autoUpdater.on('error', (err) => {
    console.error('❌ Update error:', err.message);
    sendUpdaterEvent('updater:error', { message: err.message });
  });
  autoUpdater.on('download-progress', (p) => {
    console.log(`📥 Downloading update: ${Math.round(p.percent)}%`);
    sendUpdaterEvent('updater:progress', {
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log('✅ Update downloaded:', info.version);
    sendUpdaterEvent('updater:downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
      releaseName: info.releaseName
    });
  });

  // Check 3 seconds after startup, then every 4 hours
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 3000);
  setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 4 * 60 * 60 * 1000);
}

// Manual update IPC — used by in-app UI ("Check for updates" button)
ipcMain.handle('updater:check', async () => {
  try {
    if (!app.isPackaged) {
      return { success: false, error: 'Updates only run in packaged builds', dev: true };
    }
    const r = await autoUpdater.checkForUpdates();
    return { success: true, version: r?.updateInfo?.version };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('updater:install', async () => {
  try {
    // Take a fresh, clearly-labeled backup right before installing the update.
    // If it succeeds, mark the quit-backup as done so before-quit doesn't make
    // a redundant copy; if it fails, leave the flag so before-quit still tries.
    let backupPath = null;
    if (useSQLite && sqliteDB) {
      try {
        const r = autoBackup.performBackup('pre-update');
        if (r && r.success) { backupPath = r.path; didQuitBackup = true; }
        else { console.warn('pre-update backup did not succeed:', r && r.error); }
      } catch (e) {
        console.warn('pre-update backup failed:', e.message);
      }
    }
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return { success: true, backupPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('updater:get-version', () => app.getVersion());

app.whenReady().then(() => {
  createWindow();
  // Only run auto-update in packaged (production) builds
  if (app.isPackaged) {
    setupAutoUpdater();
  }
});

// ── Auto-backup IPC ─────────────────────────────────────────────────
ipcMain.handle('auto-backup-list', async () => {
  try {
    return { success: true, backups: autoBackup.listBackups(), folder: autoBackup.getBackupDir() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('auto-backup-now', async () => {
  return autoBackup.performBackup('manual');
});

ipcMain.handle('auto-backup-open-folder', async () => {
  try {
    await shell.openPath(autoBackup.getBackupDir());
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('auto-backup-restore', async (_evt, backupPath) => {
  if (!backupPath) return { success: false, error: 'No backup path provided' };
  if (!useSQLite || !sqliteDB) return { success: false, error: 'SQLite not available' };
  try {
    const result = sqliteDB.restoreFromBackup(backupPath);
    if (result && result.success) scheduleReloadAfterRestore();
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Run a quick backup right before the app quits (best-effort, sync-friendly)
let didQuitBackup = false;
app.on('before-quit', () => {
  if (didQuitBackup) return;
  didQuitBackup = true;
  if (useSQLite && sqliteDB) {
    try { autoBackup.backupOnQuit(); } catch (e) { console.warn('quit backup failed:', e.message); }
  }
});

app.on('window-all-closed', () => {
  // Close database before quitting (auto-backup already ran in before-quit)
  if (useSQLite && sqliteDB && typeof sqliteDB.closeDatabase === 'function') {
    try { sqliteDB.closeDatabase(); } catch (_) { /* ignore */ }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
