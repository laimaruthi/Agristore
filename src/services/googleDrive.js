// ── Google Drive Service ─────────────────────────────────────────────────────
// Handles all Google Drive backup operations with rate limiting

// ── Configuration ─────────────────────────────────────────────────────────────
// No vendor fallback — each customer supplies their own Google OAuth credentials via Store Settings
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || "";
const GOOGLE_DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.file";

// ── Rate Limiting Configuration ───────────────────────────────────────────────
export const GDRIVE_RATE_LIMIT = {
  MIN_BACKUP_INTERVAL: 60000,        // Minimum 60 seconds between backups
  MAX_BACKUPS_PER_HOUR: 30,          // Maximum 30 backups per hour
  MAX_BACKUPS_PER_DAY: 200,          // Maximum 200 backups per day
  AUTO_BACKUP_DELAY: 30000,          // Wait 30 seconds after last change
  EXPONENTIAL_BACKOFF_BASE: 2000,    // Start with 2 second delay on errors
  MAX_RETRY_DELAY: 300000,           // Max 5 minutes between retries
  COOLDOWN_ON_ERROR: 60000,          // 1 minute cooldown after any error
};

// ── Storage Keys ──────────────────────────────────────────────────────────────
const GDRIVE_RATE_LIMIT_KEY = "agristore_gdrive_rate_limit";
const GDRIVE_ERROR_COUNT_KEY = "agristore_gdrive_error_count";
const GDRIVE_TOKEN_KEY = "agristore_gdrive_token";

// ── Module State ──────────────────────────────────────────────────────────────
let gapiInited = false;
let gisInited = false;
let tokenClient = null;

// ── Rate Limit State Management ───────────────────────────────────────────────
export function getGDriveRateLimitState() {
  try {
    const stored = localStorage.getItem(GDRIVE_RATE_LIMIT_KEY);
    if (!stored) return { lastBackup: 0, hourlyCount: 0, hourlyResetTime: 0, dailyCount: 0, dailyResetTime: 0 };
    return JSON.parse(stored);
  } catch {
    return { lastBackup: 0, hourlyCount: 0, hourlyResetTime: 0, dailyCount: 0, dailyResetTime: 0 };
  }
}

export function saveGDriveRateLimitState(state) {
  localStorage.setItem(GDRIVE_RATE_LIMIT_KEY, JSON.stringify(state));
}

export function canPerformGDriveBackup() {
  const now = Date.now();
  const state = getGDriveRateLimitState();
  
  // Reset hourly counter if hour has passed
  if (now - state.hourlyResetTime > 3600000) {
    state.hourlyCount = 0;
    state.hourlyResetTime = now;
  }
  
  // Reset daily counter if day has passed
  if (now - state.dailyResetTime > 86400000) {
    state.dailyCount = 0;
    state.dailyResetTime = now;
  }
  
  // Check minimum interval
  if (now - state.lastBackup < GDRIVE_RATE_LIMIT.MIN_BACKUP_INTERVAL) {
    const waitTime = Math.ceil((GDRIVE_RATE_LIMIT.MIN_BACKUP_INTERVAL - (now - state.lastBackup)) / 1000);
    return { allowed: false, reason: `Rate limit: wait ${waitTime}s`, waitTime };
  }
  
  // Check hourly limit
  if (state.hourlyCount >= GDRIVE_RATE_LIMIT.MAX_BACKUPS_PER_HOUR) {
    const waitTime = Math.ceil((state.hourlyResetTime + 3600000 - now) / 1000);
    return { allowed: false, reason: `Hourly limit reached (${GDRIVE_RATE_LIMIT.MAX_BACKUPS_PER_HOUR}/hour). Wait ${Math.ceil(waitTime/60)} min`, waitTime };
  }
  
  // Check daily limit
  if (state.dailyCount >= GDRIVE_RATE_LIMIT.MAX_BACKUPS_PER_DAY) {
    return { allowed: false, reason: `Daily limit reached (${GDRIVE_RATE_LIMIT.MAX_BACKUPS_PER_DAY}/day). Try tomorrow.`, waitTime: 86400 };
  }
  
  return { allowed: true };
}

export function recordGDriveBackup() {
  const now = Date.now();
  const state = getGDriveRateLimitState();
  
  if (now - state.hourlyResetTime > 3600000) {
    state.hourlyCount = 0;
    state.hourlyResetTime = now;
  }
  if (now - state.dailyResetTime > 86400000) {
    state.dailyCount = 0;
    state.dailyResetTime = now;
  }
  
  state.lastBackup = now;
  state.hourlyCount++;
  state.dailyCount++;
  
  saveGDriveRateLimitState(state);
  localStorage.removeItem(GDRIVE_ERROR_COUNT_KEY);
  
  console.log(`📊 GDrive backup recorded: ${state.hourlyCount}/hr, ${state.dailyCount}/day`);
}

export function getBackoffDelay() {
  try {
    const errorCount = parseInt(localStorage.getItem(GDRIVE_ERROR_COUNT_KEY) || "0", 10);
    if (errorCount === 0) return 0;
    
    const delay = Math.min(
      GDRIVE_RATE_LIMIT.EXPONENTIAL_BACKOFF_BASE * Math.pow(2, errorCount - 1),
      GDRIVE_RATE_LIMIT.MAX_RETRY_DELAY
    );
    return delay;
  } catch {
    return 0;
  }
}

export function recordGDriveError() {
  try {
    const errorCount = parseInt(localStorage.getItem(GDRIVE_ERROR_COUNT_KEY) || "0", 10);
    localStorage.setItem(GDRIVE_ERROR_COUNT_KEY, String(errorCount + 1));
    console.warn(`⚠️ GDrive error #${errorCount + 1}, next retry delay: ${getBackoffDelay() / 1000}s`);
  } catch {}
}

export function getGDriveBackupStats() {
  const state = getGDriveRateLimitState();
  const now = Date.now();
  
  const hourlyCount = (now - state.hourlyResetTime > 3600000) ? 0 : state.hourlyCount;
  const dailyCount = (now - state.dailyResetTime > 86400000) ? 0 : state.dailyCount;
  
  return {
    hourlyCount,
    dailyCount,
    hourlyLimit: GDRIVE_RATE_LIMIT.MAX_BACKUPS_PER_HOUR,
    dailyLimit: GDRIVE_RATE_LIMIT.MAX_BACKUPS_PER_DAY,
    lastBackup: state.lastBackup ? new Date(state.lastBackup) : null,
    errorCount: parseInt(localStorage.getItem(GDRIVE_ERROR_COUNT_KEY) || "0", 10),
  };
}

// ── Script Loading ────────────────────────────────────────────────────────────
export function loadGoogleScripts() {
  return new Promise((resolve) => {
    if (window.gapi && window.google && gapiInited && gisInited) { resolve(); return; }
    
    let gapiLoaded = gapiInited;
    let gisLoaded = gisInited;
    const checkBoth = () => { if (gapiLoaded && gisLoaded) resolve(); };

    // Load GAPI
    if (!window.gapi) {
      const gapiScript = document.createElement("script");
      gapiScript.src = "https://apis.google.com/js/api.js";
      gapiScript.onload = () => {
        window.gapi.load("client", async () => {
          await window.gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            discoveryDocs: GOOGLE_DISCOVERY_DOCS,
          });
          gapiInited = true;
          gapiLoaded = true;
          checkBoth();
        });
      };
      document.body.appendChild(gapiScript);
    } else if (!gapiInited) {
      window.gapi.load("client", async () => {
        await window.gapi.client.init({
          apiKey: GOOGLE_API_KEY,
          discoveryDocs: GOOGLE_DISCOVERY_DOCS,
        });
        gapiInited = true;
        gapiLoaded = true;
        checkBoth();
      });
    } else {
      gapiLoaded = true;
      checkBoth();
    }

    // Load GIS (Google Identity Services)
    if (!window.google?.accounts?.oauth2) {
      const gisScript = document.createElement("script");
      gisScript.src = "https://accounts.google.com/gsi/client";
      gisScript.onload = () => {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: GOOGLE_SCOPES,
          callback: () => {},
        });
        gisInited = true;
        gisLoaded = true;
        checkBoth();
      };
      document.body.appendChild(gisScript);
    } else {
      if (!tokenClient) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: GOOGLE_SCOPES,
          callback: () => {},
        });
      }
      gisInited = true;
      gisLoaded = true;
      checkBoth();
    }
  });
}

// ── Token Management ──────────────────────────────────────────────────────────
export async function getGoogleDriveToken(forceConsent = false) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) { reject(new Error("Google API not loaded")); return; }
    tokenClient.callback = (response) => {
      if (response.error) {
        localStorage.removeItem(GDRIVE_TOKEN_KEY);
        reject(response);
      } else {
        const tokenData = {
          access_token: response.access_token,
          expires_at: Date.now() + (response.expires_in * 1000),
        };
        localStorage.setItem(GDRIVE_TOKEN_KEY, JSON.stringify(tokenData));
        window.gapi.client.setToken({ access_token: response.access_token });
        resolve(response.access_token);
      }
    };
    if (forceConsent || window.gapi.client.getToken() === null) {
      tokenClient.requestAccessToken({ prompt: "consent" });
    } else {
      tokenClient.requestAccessToken({ prompt: "" });
    }
  });
}

export async function silentTokenRefresh() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) { reject(new Error("Google API not loaded")); return; }
    
    tokenClient.callback = (response) => {
      if (response.error) {
        console.warn("Silent token refresh failed:", response.error);
        localStorage.removeItem(GDRIVE_TOKEN_KEY);
        reject(response);
      } else {
        const tokenData = {
          access_token: response.access_token,
          expires_at: Date.now() + (response.expires_in * 1000),
        };
        localStorage.setItem(GDRIVE_TOKEN_KEY, JSON.stringify(tokenData));
        window.gapi.client.setToken({ access_token: response.access_token });
        console.log("✅ Token silently refreshed");
        resolve(response.access_token);
      }
    };
    
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

export function getStoredGDriveToken() {
  try {
    const stored = localStorage.getItem(GDRIVE_TOKEN_KEY);
    if (!stored) return null;
    const tokenData = JSON.parse(stored);
    if (tokenData.expires_at && tokenData.expires_at > Date.now() + 300000) {
      return tokenData.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getValidGDriveToken() {
  await loadGoogleScripts();
  
  const storedToken = getStoredGDriveToken();
  if (storedToken) {
    window.gapi.client.setToken({ access_token: storedToken });
    return storedToken;
  }
  
  try {
    const newToken = await silentTokenRefresh();
    return newToken;
  } catch (err) {
    console.warn("Silent refresh failed, user needs to re-authenticate");
    throw new Error("TOKEN_EXPIRED");
  }
}

export async function restoreGDriveConnection() {
  try {
    await loadGoogleScripts();
    
    const storedToken = getStoredGDriveToken();
    if (storedToken) {
      window.gapi.client.setToken({ access_token: storedToken });
      try {
        await window.gapi.client.drive.about.get({ fields: "user" });
        return true;
      } catch (verifyErr) {
        console.warn("Stored token invalid, attempting refresh...");
      }
    }
    
    try {
      await silentTokenRefresh();
      await window.gapi.client.drive.about.get({ fields: "user" });
      return true;
    } catch (refreshErr) {
      console.warn("Silent refresh failed:", refreshErr);
      localStorage.removeItem(GDRIVE_TOKEN_KEY);
      if (window.gapi?.client) {
        window.gapi.client.setToken(null);
      }
      return false;
    }
  } catch (err) {
    console.warn("Failed to restore Google Drive connection:", err);
    localStorage.removeItem(GDRIVE_TOKEN_KEY);
    if (window.gapi?.client) {
      window.gapi.client.setToken(null);
    }
    return false;
  }
}

export function clearGDriveConnection() {
  localStorage.removeItem(GDRIVE_TOKEN_KEY);
  if (window.gapi?.client) {
    const token = window.gapi.client.getToken();
    if (token) {
      try {
        window.google.accounts.oauth2.revoke(token.access_token);
      } catch {}
      window.gapi.client.setToken(null);
    }
  }
}

// ── Upload Functions ──────────────────────────────────────────────────────────
export async function uploadToGoogleDrive(filename, jsonData, retryCount = 0) {
  let token = window.gapi.client.getToken();
  if (!token) throw new Error("Not authenticated with Google");

  const boundary = "-------314159265358979323846";
  const metadata = {
    name: filename,
    mimeType: "application/json",
  };

  let searchResponse;
  try {
    searchResponse = await window.gapi.client.drive.files.list({
      q: `name='${filename}' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name)",
    });
  } catch (searchErr) {
    if (retryCount === 0 && (searchErr.status === 401 || searchErr.result?.error?.code === 401)) {
      console.log("🔄 Token expired during search, refreshing...");
      try {
        await silentTokenRefresh();
        return uploadToGoogleDrive(filename, jsonData, 1);
      } catch {
        throw new Error("TOKEN_EXPIRED");
      }
    }
    throw searchErr;
  }

  const existingFile = searchResponse.result.files?.[0];

  const multipartRequestBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(jsonData, null, 2)}\r\n` +
    `--${boundary}--`;

  token = window.gapi.client.getToken();
  
  const uploadUrl = existingFile 
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  
  const response = await fetch(uploadUrl, {
    method: existingFile ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });
  
  if (response.status === 401 && retryCount === 0) {
    console.log("🔄 Token expired during upload, refreshing...");
    try {
      await silentTokenRefresh();
      return uploadToGoogleDrive(filename, jsonData, 1);
    } catch {
      throw new Error("TOKEN_EXPIRED");
    }
  }
  
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Upload failed: ${response.status}`);
  }
  
  return response.json();
}

export async function uploadToGoogleDriveWithHistory(jsonData) {
  const token = window.gapi.client.getToken();
  if (!token) throw new Error("Not authenticated with Google");

  const today = new Date().toISOString().split("T")[0];
  const masterFilename = "agristore_backup.json";
  const dailyFilename = `agristore_backup_${today}.json`;
  
  try {
    console.log("📤 Uploading master backup...");
    await uploadToGoogleDrive(masterFilename, jsonData);
    
    console.log("📤 Uploading daily backup:", dailyFilename);
    await uploadToGoogleDrive(dailyFilename, jsonData);
    
    await cleanupOldBackups(7);
    
    console.log("✅ Both master and daily backups uploaded successfully");
    return { success: true, masterFilename, dailyFilename };
  } catch (err) {
    console.error("Backup failed:", err);
    throw err;
  }
}

export async function cleanupOldBackups(keepDays = 7) {
  try {
    const response = await window.gapi.client.drive.files.list({
      q: "name contains 'agristore_backup_' and name contains '.json' and trashed=false",
      fields: "files(id, name, createdTime)",
      spaces: "drive",
    });
    
    const files = response.result.files || [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);
    
    let deletedCount = 0;
    for (const file of files) {
      const match = file.name.match(/agristore_backup_(\d{4}-\d{2}-\d{2})\.json/);
      if (match) {
        const fileDate = new Date(match[1]);
        if (fileDate < cutoffDate) {
          await window.gapi.client.drive.files.delete({ fileId: file.id });
          console.log("🗑 Deleted old backup:", file.name);
          deletedCount++;
        }
      }
    }
    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} old backup(s)`);
    }
  } catch (err) {
    console.warn("Cleanup old backups failed (non-critical):", err);
  }
}

// ── Backup Validation ─────────────────────────────────────────────────────────
export function isBackupDataValid(data, prevRecordCount) {
  const totalRecords = 
    (data.customers?.length || 0) + 
    (data.items?.length || 0) + 
    (data.invoices?.length || 0) + 
    (data.users?.length || 0);
  
  const hasAnyMainData = 
    (data.customers?.length > 0) || 
    (data.items?.length > 0) || 
    (data.invoices?.length > 0);
  
  if (prevRecordCount > 5 && !hasAnyMainData) {
    console.warn("🚫 Backup BLOCKED: ALL collections empty but had", prevRecordCount, "records before");
    return { valid: false, reason: "All collections empty - data may not have loaded", totalRecords };
  }
  
  if (prevRecordCount > 10 && totalRecords === 0) {
    console.warn("🚫 Backup blocked: Data appears corrupted (was", prevRecordCount, "records, now 0)");
    return { valid: false, reason: "Data appears corrupted - all records empty", totalRecords };
  }
  
  if (prevRecordCount > 20 && totalRecords < prevRecordCount * 0.1) {
    console.warn("🚫 Backup blocked: Data dropped by >90%");
    return { valid: false, reason: `Data dropped by >90% (${prevRecordCount} → ${totalRecords})`, totalRecords };
  }
  
  const checkCollection = (name, arr) => {
    const len = arr?.length || 0;
    const prevKey = `agristore_backup_${name}_count`;
    const prev = parseInt(localStorage.getItem(prevKey) || "0", 10);
    if (prev > 5 && len === 0) {
      console.warn(`🚫 Backup BLOCKED: ${name} was ${prev} items, now 0`);
      return false;
    }
    return true;
  };
  
  if (!checkCollection("customers", data.customers)) {
    return { valid: false, reason: "Customers collection suspiciously empty", totalRecords };
  }
  if (!checkCollection("items", data.items)) {
    return { valid: false, reason: "Items collection suspiciously empty", totalRecords };
  }
  if (!checkCollection("invoices", data.invoices)) {
    return { valid: false, reason: "Invoices collection suspiciously empty", totalRecords };
  }
  
  return { valid: true, totalRecords };
}

export function saveBackupCounts(data) {
  localStorage.setItem("agristore_backup_customers_count", String(data.customers?.length || 0));
  localStorage.setItem("agristore_backup_items_count", String(data.items?.length || 0));
  localStorage.setItem("agristore_backup_invoices_count", String(data.invoices?.length || 0));
}

export default {
  // Rate Limiting
  GDRIVE_RATE_LIMIT,
  getGDriveRateLimitState,
  saveGDriveRateLimitState,
  canPerformGDriveBackup,
  recordGDriveBackup,
  getBackoffDelay,
  recordGDriveError,
  getGDriveBackupStats,
  
  // Scripts & Authentication
  loadGoogleScripts,
  getGoogleDriveToken,
  silentTokenRefresh,
  getStoredGDriveToken,
  getValidGDriveToken,
  restoreGDriveConnection,
  clearGDriveConnection,
  
  // Upload
  uploadToGoogleDrive,
  uploadToGoogleDriveWithHistory,
  cleanupOldBackups,
  
  // Validation
  isBackupDataValid,
  saveBackupCounts,
};
