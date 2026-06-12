// ── Local Backup Service ─────────────────────────────────────────────────────
// Handles local IndexedDB backups and auto-downloads

// ── Configuration ─────────────────────────────────────────────────────────────
const LOCAL_BACKUP_DB_NAME = "agristore_local_backups";
const LOCAL_BACKUP_STORE = "backups";
const MAX_LOCAL_BACKUPS = 10;
const AUTO_DOWNLOAD_INTERVAL = 60 * 60 * 1000; // 60 minutes
const DOWNLOAD_HISTORY_KEY = "agristore_download_history";
const MAX_DOWNLOAD_HISTORY = 20;
const DOWNLOAD_FOLDER_KEY = "agristore_download_folder_handle";
const FOLDER_ORGANIZE_KEY = "agristore_folder_organize";

// ── IndexedDB Operations ──────────────────────────────────────────────────────
export async function openLocalBackupDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_BACKUP_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(LOCAL_BACKUP_STORE)) {
        db.createObjectStore(LOCAL_BACKUP_STORE, { keyPath: "id" });
      }
    };
  });
}

export async function saveLocalBackup(data) {
  try {
    const db = await openLocalBackupDB();
    const tx = db.transaction(LOCAL_BACKUP_STORE, "readwrite");
    const store = tx.objectStore(LOCAL_BACKUP_STORE);
    
    const now = new Date();
    const backup = {
      id: now.toISOString(),
      timestamp: now.getTime(),
      data: data,
      recordCount: (data.customers?.length || 0) + (data.items?.length || 0) + (data.invoices?.length || 0),
    };
    
    store.add(backup);
    
    // Clean up old backups
    const allRequest = store.getAll();
    allRequest.onsuccess = () => {
      const all = allRequest.result;
      if (all.length > MAX_LOCAL_BACKUPS) {
        all.sort((a, b) => b.timestamp - a.timestamp);
        const toDelete = all.slice(MAX_LOCAL_BACKUPS);
        toDelete.forEach((b) => store.delete(b.id));
      }
    };
    
    await tx.complete;
    console.log("💾 Local backup saved:", now.toLocaleString());
    localStorage.setItem("agristore_last_local_backup", now.toISOString());
    return true;
  } catch (err) {
    console.error("Failed to save local backup:", err);
    return false;
  }
}

export async function getLocalBackups() {
  try {
    const db = await openLocalBackupDB();
    const tx = db.transaction(LOCAL_BACKUP_STORE, "readonly");
    const store = tx.objectStore(LOCAL_BACKUP_STORE);
    
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result;
        all.sort((a, b) => b.timestamp - a.timestamp);
        resolve(all);
      };
      request.onerror = () => resolve([]);
    });
  } catch (err) {
    console.error("Failed to get local backups:", err);
    return [];
  }
}

export async function deleteLocalBackup(id) {
  try {
    const db = await openLocalBackupDB();
    const tx = db.transaction(LOCAL_BACKUP_STORE, "readwrite");
    const store = tx.objectStore(LOCAL_BACKUP_STORE);
    store.delete(id);
    await tx.complete;
    return true;
  } catch (err) {
    console.error("Failed to delete local backup:", err);
    return false;
  }
}

// ── Download History ──────────────────────────────────────────────────────────
export function getDownloadHistory() {
  try {
    const stored = localStorage.getItem(DOWNLOAD_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveDownloadHistory(entry) {
  try {
    const history = getDownloadHistory();
    history.unshift(entry);
    const trimmed = history.slice(0, MAX_DOWNLOAD_HISTORY);
    localStorage.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch (err) {
    console.error("Failed to save download history:", err);
    return [];
  }
}

export function clearDownloadHistory() {
  localStorage.removeItem(DOWNLOAD_HISTORY_KEY);
}

// ── File System Access API ────────────────────────────────────────────────────
export function isFileSystemAccessSupported() {
  return "showDirectoryPicker" in window;
}

export async function saveFolderHandle(handle) {
  try {
    const db = await openLocalBackupDB();
    const tx = db.transaction(LOCAL_BACKUP_STORE, "readwrite");
    const store = tx.objectStore(LOCAL_BACKUP_STORE);
    store.put({ id: "__folder_handle__", handle, timestamp: Date.now() });
    localStorage.setItem(DOWNLOAD_FOLDER_KEY, "selected");
    return true;
  } catch (err) {
    console.error("Failed to save folder handle:", err);
    return false;
  }
}

export async function getSavedFolderHandle() {
  try {
    const db = await openLocalBackupDB();
    const tx = db.transaction(LOCAL_BACKUP_STORE, "readonly");
    const store = tx.objectStore(LOCAL_BACKUP_STORE);
    return new Promise((resolve) => {
      const request = store.get("__folder_handle__");
      request.onsuccess = () => resolve(request.result?.handle || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function clearFolderHandle() {
  try {
    const db = await openLocalBackupDB();
    const tx = db.transaction(LOCAL_BACKUP_STORE, "readwrite");
    const store = tx.objectStore(LOCAL_BACKUP_STORE);
    store.delete("__folder_handle__");
    localStorage.removeItem(DOWNLOAD_FOLDER_KEY);
    return true;
  } catch {
    return false;
  }
}

// ── Save to Selected Folder ───────────────────────────────────────────────────
export async function saveToSelectedFolder(data, storeName, useDateFolder = false) {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-");
  const safeName = (storeName || "agristore").replace(/[^a-zA-Z0-9_]/g, "_");
  
  const fullBackup = {
    ...data,
    _meta: {
      version: "1.0",
      exportedAt: now.toISOString(),
      source: storeName || "Agri Store",
      type: "auto-download",
      recordCount: (data.customers?.length || 0) + (data.items?.length || 0) + (data.invoices?.length || 0),
    },
  };
  
  const jsonContent = JSON.stringify(fullBackup, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json" });
  
  try {
    const folderHandle = await getSavedFolderHandle();
    
    if (folderHandle && isFileSystemAccessSupported()) {
      const permission = await folderHandle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        const requestResult = await folderHandle.requestPermission({ mode: "readwrite" });
        if (requestResult !== "granted") {
          throw new Error("Permission denied");
        }
      }
      
      let targetFolder = folderHandle;
      let folderPath = folderHandle.name;
      
      if (useDateFolder) {
        const dateFolderName = `backup_${dateStr}_${timeStr.split("-").slice(0, 2).join("-")}`;
        targetFolder = await folderHandle.getDirectoryHandle(dateFolderName, { create: true });
        folderPath = `${folderHandle.name}/${dateFolderName}`;
      }
      
      const filename = `${safeName}_${dateStr}_${timeStr}.json`;
      const fileHandle = await targetFolder.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(jsonContent);
      await writable.close();
      
      const historyEntry = {
        id: now.toISOString(),
        filename,
        folderPath,
        timestamp: now.getTime(),
        recordCount: fullBackup._meta.recordCount,
        size: blob.size,
        savedToFolder: true,
      };
      saveDownloadHistory(historyEntry);
      localStorage.setItem("agristore_last_auto_download", now.toISOString());
      
      console.log("📁 Saved to folder:", folderPath, filename);
      return { success: true, entry: historyEntry };
    } else {
      return { success: false, fallback: true };
    }
  } catch (err) {
    console.error("Failed to save to folder:", err);
    return { success: false, error: err.message };
  }
}

// ── Trigger File Download ─────────────────────────────────────────────────────
export function triggerFileDownload(data, storeName) {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-");
  const safeName = (storeName || "agristore").replace(/[^a-zA-Z0-9_]/g, "_");
  const filename = `${safeName}_backup_${dateStr}_${timeStr}.json`;
  
  const fullBackup = {
    ...data,
    _meta: {
      version: "1.0",
      exportedAt: now.toISOString(),
      source: storeName || "Agri Store",
      type: "auto-download",
      recordCount: (data.customers?.length || 0) + (data.items?.length || 0) + (data.invoices?.length || 0),
    },
  };
  
  const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  const historyEntry = {
    id: now.toISOString(),
    filename,
    timestamp: now.getTime(),
    recordCount: fullBackup._meta.recordCount,
    size: blob.size,
    savedToFolder: false,
  };
  saveDownloadHistory(historyEntry);
  localStorage.setItem("agristore_last_auto_download", now.toISOString());
  
  console.log("📥 Auto-download triggered:", filename);
  return historyEntry;
}

// ── Constants Export ──────────────────────────────────────────────────────────
export const AUTO_DOWNLOAD_INTERVAL_MS = AUTO_DOWNLOAD_INTERVAL;

export default {
  // IndexedDB
  openLocalBackupDB,
  saveLocalBackup,
  getLocalBackups,
  deleteLocalBackup,
  
  // Download History
  getDownloadHistory,
  saveDownloadHistory,
  clearDownloadHistory,
  
  // File System Access
  isFileSystemAccessSupported,
  saveFolderHandle,
  getSavedFolderHandle,
  clearFolderHandle,
  
  // Download Operations
  saveToSelectedFolder,
  triggerFileDownload,
  
  // Constants
  AUTO_DOWNLOAD_INTERVAL_MS,
};
