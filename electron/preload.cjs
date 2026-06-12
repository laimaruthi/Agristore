const { contextBridge, ipcRenderer } = require('electron');

// SQLite IPC handlers are wired in main.cjs and gracefully return
// { success: false, error: 'SQLite not available' } when the native
// module fails to load. The renderer probes a live IPC call on init
// (see localDatabase.js → SQLiteStore.init) and falls back to IndexedDB
// if SQLite is genuinely unavailable. We therefore expose the db API
// unconditionally so the renderer can make that determination.
const USE_SQLITE = true;

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  useSQLite: USE_SQLITE,
  platform: process.platform,
  
  // File system operations
  selectBackupFolder: () => ipcRenderer.invoke('select-backup-folder'),
  saveBackupFile: (folderPath, fileName, content) => 
    ipcRenderer.invoke('save-backup-file', { folderPath, fileName, content }),
  checkFolderAccess: (folderPath) => ipcRenderer.invoke('check-folder-access', folderPath),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  
  // License operations
  license: {
    check: () => ipcRenderer.invoke('license-check'),
    activate: (licenseKey, storeName) => ipcRenderer.invoke('license-activate', licenseKey, storeName),
    getMachineId: () => ipcRenderer.invoke('license-get-machine-id'),
    deactivate: () => ipcRenderer.invoke('license-deactivate'),
    generate: (machineId, storeName) => ipcRenderer.invoke('license-generate', machineId, storeName)
  },
  
  // SQLite Database operations (only works on Windows builds)
  db: USE_SQLITE ? {
    getAll: (tableName) => ipcRenderer.invoke('db-get-all', tableName),
    get: (tableName, id) => ipcRenderer.invoke('db-get', tableName, id),
    put: (tableName, data) => ipcRenderer.invoke('db-put', tableName, data),
    delete: (tableName, id) => ipcRenderer.invoke('db-delete', tableName, id),
    putAll: (tableName, dataArray) => ipcRenderer.invoke('db-put-all', tableName, dataArray),
    clear: (tableName) => ipcRenderer.invoke('db-clear', tableName),
    exportAll: () => ipcRenderer.invoke('db-export-all'),
    importAll: (data) => ipcRenderer.invoke('db-import-all', data),
    checkHealth: () => ipcRenderer.invoke('db-check-health'),
    vacuum: () => ipcRenderer.invoke('db-vacuum'),
    createBackup: (path) => ipcRenderer.invoke('db-create-backup', path),
    restoreBackup: (path) => ipcRenderer.invoke('db-restore-backup', path),
    getPath: () => ipcRenderer.invoke('db-get-path')
  } : null,

  // SQLite backup IPC — always exposed so the UI card renders everywhere.
  // On non-Windows builds the main-process handler returns a friendly error.
  sqliteBackup: {
    create: (path) => ipcRenderer.invoke('db-create-backup', path),
    restore: (path) => ipcRenderer.invoke('db-restore-backup', path),
    vacuum: () => ipcRenderer.invoke('db-vacuum'),
    checkHealth: () => ipcRenderer.invoke('db-check-health')
  },
  
  // File dialogs
  selectBackupFile: () => ipcRenderer.invoke('select-backup-file'),
  saveBackupDialog: () => ipcRenderer.invoke('save-backup-dialog'),

  // Auto-backup (local automatic backups)
  autoBackup: {
    list: () => ipcRenderer.invoke('auto-backup-list'),
    runNow: () => ipcRenderer.invoke('auto-backup-now'),
    openFolder: () => ipcRenderer.invoke('auto-backup-open-folder'),
    restore: (path) => ipcRenderer.invoke('auto-backup-restore', path)
  },

  // Auto-updater (GitHub Releases via electron-updater)
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    getVersion: () => ipcRenderer.invoke('updater:get-version'),
    on: (event, handler) => {
      const channel = `updater:${event}`; // checking | available | not-available | progress | downloaded | error
      const listener = (_evt, payload) => handler(payload);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
  }
});
