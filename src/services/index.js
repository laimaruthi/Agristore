// ── Services Index ────────────────────────────────────────────────────────────
// Export all services from a single entry point

// Firebase Service
export {
  isFirebaseConfigured,
  firebaseApp,
  db,
  auth,
  getPendingChangesCount,
  incrementPendingChanges,
  resetPendingChanges,
  sanitizeForFirestore,
  useNetworkStatus,
  useFirestore,
  useOfflineMode,
  compressImage,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from './firebase';

// Google Drive Service
export {
  GDRIVE_RATE_LIMIT,
  getGDriveRateLimitState,
  saveGDriveRateLimitState,
  canPerformGDriveBackup,
  recordGDriveBackup,
  getBackoffDelay,
  recordGDriveError,
  getGDriveBackupStats,
  loadGoogleScripts,
  getGoogleDriveToken,
  silentTokenRefresh,
  getStoredGDriveToken,
  getValidGDriveToken,
  restoreGDriveConnection,
  clearGDriveConnection,
  uploadToGoogleDrive,
  uploadToGoogleDriveWithHistory,
  cleanupOldBackups,
  isBackupDataValid,
  saveBackupCounts,
} from './googleDrive';

// Local Backup Service
export {
  openLocalBackupDB,
  saveLocalBackup,
  getLocalBackups,
  deleteLocalBackup,
  getDownloadHistory,
  saveDownloadHistory,
  clearDownloadHistory,
  isFileSystemAccessSupported,
  saveFolderHandle,
  getSavedFolderHandle,
  clearFolderHandle,
  saveToSelectedFolder,
  triggerFileDownload,
  AUTO_DOWNLOAD_INTERVAL_MS,
} from './localBackup';

// Crash Recovery & Data Protection
export {
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
} from './crashRecovery';

// Local Database Service
export {
  getDatabase,
  generateId,
  hashPassword,
  verifyPassword,
  isElectron,
} from './localDatabase';

// Local Auth Service
export {
  getCurrentUser,
  loginLocal,
  registerLocal,
  logoutLocal,
  changePassword,
  updateProfile,
  getAllUsers,
  deleteUser,
  isFirstRun,
  createDefaultAdmin,
} from './localAuth';

// Data Hooks
export { useLocalData } from './dataHooks';
