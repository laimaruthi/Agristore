import React, { useState, useMemo, useRef, useEffect, useCallback, createContext, useContext, Component } from "react";
import * as XLSX from "xlsx";

// ── ✅ Import Local Data Hooks (No Firebase) ──────────────────────────────────
import { useLocalData } from "./services/dataHooks";
import { logoutLocal, getCurrentUser } from "./services/localAuth";
import { initCrashRecovery, didAppCrash, clearCrashFlag, exportToFile, getBackupList, restoreFromBackup } from "./services/crashRecovery";

// ── ✅ Import Reusable Components & Hooks ─────────────────────────────────────
import { 
  Pagination, Spinner, LoadingOverlay, SkeletonTable, SkeletonStatCard, 
  LoadingState, EmptyState, SkipLink, UpdateNotification 
} from "./components";
import { 
  Modal, Btn, Input, Badge, useToast, ToastProvider,
  CompanyCombobox, PurchaseItemCombobox, CustomerCombobox, ItemCombobox, RecordPaymentModal
} from "./components/UIComponents";
import { CategoryField, ManageCategoriesModal } from "./components/FormComponents";
import { usePagination, useDebouncedValue, useLoadingState } from "./hooks";
import riceIcon from "./assets/sheaf-of-rice.png";

// ── ✅ Import Page Components (Extracted Modules) ─────────────────────────────
import { Dashboard } from "./pages/Dashboard";
import { CustomersPage } from "./pages/CustomersPage";
import { ItemsPage } from "./pages/ItemsPage";
import InvoicesPage from "./pages/InvoicesPage";
import PurchasesPage from "./pages/PurchasesPage";
import UsersPage from "./pages/UsersPage";
import LoginPage from "./pages/LoginPage";
import Sidebar from "./pages/Sidebar";
import StoreSettingsPage from "./pages/StoreSettingsPage";
import ReportsPage from "./pages/ReportsPage";
import OtherExpensesPage from "./pages/OtherExpensesPage";

// ── ✅ Error Boundary Component ───────────────────────────────────────────────
// Catches JavaScript errors anywhere in child component tree
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log error to console (could send to error tracking service)
    console.error("🔴 App Error:", error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}>
          <div className="max-w-lg w-full p-8 rounded-2xl border border-red-800/30 bg-red-900/10">
            <div className="text-center mb-6">
              <span className="text-5xl">⚠️</span>
              <h1 className="text-2xl font-bold text-red-400 mt-4">Something went wrong</h1>
              <p className="text-red-400/70 text-sm mt-2">The app encountered an unexpected error</p>
            </div>
            
            <div className="bg-red-900/20 rounded-xl p-4 mb-6 overflow-auto max-h-48">
              <p className="text-xs font-mono text-red-400/80 whitespace-pre-wrap">
                {this.state.error?.toString()}
              </p>
            </div>
            
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 rounded-xl font-bold text-white shadow-lg"
                style={{ background: "linear-gradient(135deg, #059669, #047857)" }}
              >
                🔄 Reload App
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.reload();
                }}
                className="px-6 py-3 rounded-xl font-bold text-red-400 border border-red-800/30 hover:bg-red-900/30"
              >
                🗑 Clear Cache & Reload
              </button>
            </div>
            
            <p className="text-xs text-red-400/50 text-center mt-4">
              If the problem persists, try clearing your browser cache or contact support.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── ✅ Input Sanitization (XSS Prevention) ────────────────────────────────────
// Sanitizes user input to prevent XSS attacks
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// Clean object for display (sanitize all string fields)
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      cleaned[key] = sanitizeInput(value);
    } else if (typeof value === 'object') {
      cleaned[key] = sanitizeObject(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

// ── ✅ Environment Variables (Security) ───────────────────────────────────────
// Use environment variables for sensitive credentials
// Create a .env file with VITE_GOOGLE_CLIENT_ID, VITE_FIREBASE_API_KEY, etc.
// Credentials come from the .env file (VITE_* vars) only — never hardcoded,
// so they are not committed to the public repo. See .env.example.
const ENV = {
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || "",
  GOOGLE_API_KEY: import.meta.env.VITE_GOOGLE_API_KEY || "",
  FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY || "",
  FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  FIREBASE_DATABASE_URL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "",
  FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

// ── ✅ Electron Detection ─────────────────────────────────────────────────────
// Google OAuth doesn't work with Electron's file:// protocol
// Disable Google Drive backup in Electron desktop app
const isElectron = !!(window.electronAPI || window.process?.versions?.electron || navigator.userAgent.includes('Electron'));

// ── ✅ Google Drive API Config ────────────────────────────────────────────────
// Note: Google Drive backup is disabled in Electron (OAuth doesn't work with file://)
const GOOGLE_CLIENT_ID = ENV.GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = ENV.GOOGLE_API_KEY;
const GOOGLE_DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.file";

// ── ✅ Rate Limiting & Backup Protection ──────────────────────────────────────
// These settings prevent Google from flagging the app for suspicious activity
const GDRIVE_RATE_LIMIT = {
  MIN_BACKUP_INTERVAL: 60000,        // Minimum 60 seconds between backups (was 5 seconds!)
  MAX_BACKUPS_PER_HOUR: 30,          // Maximum 30 backups per hour
  MAX_BACKUPS_PER_DAY: 200,          // Maximum 200 backups per day (Google's soft limit is ~1000)
  AUTO_BACKUP_DELAY: 30000,          // Wait 30 seconds after last change before auto-backup
  EXPONENTIAL_BACKOFF_BASE: 2000,    // Start with 2 second delay on errors
  MAX_RETRY_DELAY: 300000,           // Max 5 minutes between retries
  COOLDOWN_ON_ERROR: 60000,          // 1 minute cooldown after any error
};

const GDRIVE_RATE_LIMIT_KEY = "agristore_gdrive_rate_limit";
const GDRIVE_ERROR_COUNT_KEY = "agristore_gdrive_error_count";

// Get rate limit state from localStorage
function getGDriveRateLimitState() {
  try {
    const stored = localStorage.getItem(GDRIVE_RATE_LIMIT_KEY);
    if (!stored) return { lastBackup: 0, hourlyCount: 0, hourlyResetTime: 0, dailyCount: 0, dailyResetTime: 0 };
    return JSON.parse(stored);
  } catch {
    return { lastBackup: 0, hourlyCount: 0, hourlyResetTime: 0, dailyCount: 0, dailyResetTime: 0 };
  }
}

// Save rate limit state
function saveGDriveRateLimitState(state) {
  localStorage.setItem(GDRIVE_RATE_LIMIT_KEY, JSON.stringify(state));
}

// Check if backup is allowed (rate limiting)
function canPerformGDriveBackup() {
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

// Record successful backup
function recordGDriveBackup() {
  const now = Date.now();
  const state = getGDriveRateLimitState();
  
  // Reset counters if needed
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
  
  // Clear error count on success
  localStorage.removeItem(GDRIVE_ERROR_COUNT_KEY);
  
  console.log(`📊 GDrive backup recorded: ${state.hourlyCount}/hr, ${state.dailyCount}/day`);
}

// Get exponential backoff delay based on consecutive errors
function getBackoffDelay() {
  try {
    const errorCount = parseInt(localStorage.getItem(GDRIVE_ERROR_COUNT_KEY) || "0", 10);
    if (errorCount === 0) return 0;
    
    // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, max 300s
    const delay = Math.min(
      GDRIVE_RATE_LIMIT.EXPONENTIAL_BACKOFF_BASE * Math.pow(2, errorCount - 1),
      GDRIVE_RATE_LIMIT.MAX_RETRY_DELAY
    );
    return delay;
  } catch {
    return 0;
  }
}

// Record error and increase backoff
function recordGDriveError() {
  try {
    const errorCount = parseInt(localStorage.getItem(GDRIVE_ERROR_COUNT_KEY) || "0", 10);
    localStorage.setItem(GDRIVE_ERROR_COUNT_KEY, String(errorCount + 1));
    console.warn(`⚠️ GDrive error #${errorCount + 1}, next retry delay: ${getBackoffDelay() / 1000}s`);
  } catch {}
}

// Get backup stats for display
function getGDriveBackupStats() {
  const state = getGDriveRateLimitState();
  const now = Date.now();
  
  // Reset if periods have passed
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

// ── Google Drive Helper Functions ────────────────────────────────────────────
// Note: Google Drive is disabled in Electron (OAuth doesn't work with file://)
let gapiInited = false;
let gisInited = false;
let tokenClient = null;

function loadGoogleScripts() {
  return new Promise((resolve, reject) => {
    // Skip Google Drive in Electron - OAuth doesn't work with file:// protocol
    if (isElectron) {
      reject(new Error("Google Drive is not available in desktop app"));
      return;
    }
    
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

// Store token in localStorage for persistence across sessions
const GDRIVE_TOKEN_KEY = "agristore_gdrive_token";

async function getGoogleDriveToken(forceConsent = false) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) { reject(new Error("Google API not loaded")); return; }
    tokenClient.callback = (response) => {
      if (response.error) {
        // Clear stored token on error
        localStorage.removeItem(GDRIVE_TOKEN_KEY);
        reject(response);
      } else {
        // Store token with expiry info in localStorage (persists across sessions)
        const tokenData = {
          access_token: response.access_token,
          expires_at: Date.now() + (response.expires_in * 1000),
        };
        localStorage.setItem(GDRIVE_TOKEN_KEY, JSON.stringify(tokenData));
        // Also set in gapi client
        window.gapi.client.setToken({ access_token: response.access_token });
        resolve(response.access_token);
      }
    };
    // Force consent on first connect, silent refresh otherwise
    if (forceConsent || window.gapi.client.getToken() === null) {
      tokenClient.requestAccessToken({ prompt: "consent" });
    } else {
      tokenClient.requestAccessToken({ prompt: "" });
    }
  });
}

// Silent token refresh (no user interaction)
async function silentTokenRefresh() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) { reject(new Error("Google API not loaded")); return; }
    
    // Set up one-time callback for this refresh
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
    
    // Request token without prompt (silent refresh)
    // This works if user has previously granted consent
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

// Check if stored token is still valid, with auto-refresh capability
function getStoredGDriveToken() {
  try {
    const stored = localStorage.getItem(GDRIVE_TOKEN_KEY);
    if (!stored) return null;
    const tokenData = JSON.parse(stored);
    // Check if token is expired (with 5 minute buffer)
    if (tokenData.expires_at && tokenData.expires_at > Date.now() + 300000) {
      return tokenData.access_token;
    }
    // Token expired or about to expire
    return null;
  } catch {
    return null;
  }
}

// Get valid token - refreshes if expired
async function getValidGDriveToken() {
  await loadGoogleScripts();
  
  // Check if we have a valid stored token
  const storedToken = getStoredGDriveToken();
  if (storedToken) {
    window.gapi.client.setToken({ access_token: storedToken });
    return storedToken;
  }
  
  // Token expired, try silent refresh
  try {
    const newToken = await silentTokenRefresh();
    return newToken;
  } catch (err) {
    console.warn("Silent refresh failed, user needs to re-authenticate");
    throw new Error("TOKEN_EXPIRED");
  }
}

// Restore Google Drive connection from stored token (with auto-refresh)
async function restoreGDriveConnection() {
  // Skip in Electron - Google Drive not available
  if (isElectron) {
    return false;
  }
  
  try {
    await loadGoogleScripts();

    // Only restore if we have a still-valid stored token.
    // Do NOT trigger a silent refresh here — with multiple Google accounts
    // the browser shows the account chooser, which is disruptive on every refresh.
    // If the token is missing/expired, stay disconnected until the user clicks "Connect".
    const storedToken = getStoredGDriveToken();
    if (!storedToken) return false;

    window.gapi.client.setToken({ access_token: storedToken });
    try {
      await window.gapi.client.drive.about.get({ fields: "user" });
      return true;
    } catch (verifyErr) {
      console.warn("Stored Google Drive token invalid — user will need to reconnect manually.");
      localStorage.removeItem(GDRIVE_TOKEN_KEY);
      window.gapi.client.setToken(null);
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

// Clear Google Drive connection
function clearGDriveConnection() {
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

async function uploadToGoogleDrive(filename, jsonData, retryCount = 0) {
  let token = window.gapi.client.getToken();
  if (!token) throw new Error("Not authenticated with Google");

  const boundary = "-------314159265358979323846";
  const metadata = {
    name: filename,
    mimeType: "application/json",
  };

  // Check if file already exists (to update instead of creating duplicate)
  let searchResponse;
  try {
    searchResponse = await window.gapi.client.drive.files.list({
      q: `name='${filename}' and trashed=false`,
      spaces: "drive",
      fields: "files(id, name)",
    });
  } catch (searchErr) {
    // If search fails due to auth, try to refresh token
    if (retryCount === 0 && (searchErr.status === 401 || searchErr.result?.error?.code === 401)) {
      console.log("🔄 Token expired during search, refreshing...");
      try {
        await silentTokenRefresh();
        return uploadToGoogleDrive(filename, jsonData, 1); // Retry once
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

  // Re-get token in case it was refreshed
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
  
  // Handle 401 errors with auto-refresh
  if (response.status === 401 && retryCount === 0) {
    console.log("🔄 Token expired during upload, refreshing...");
    try {
      await silentTokenRefresh();
      return uploadToGoogleDrive(filename, jsonData, 1); // Retry once
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

// ✅ Upload with backup rotation (keeps master + daily copies)
async function uploadToGoogleDriveWithHistory(jsonData) {
  const token = window.gapi.client.getToken();
  if (!token) throw new Error("Not authenticated with Google");

  // Generate dated filename for daily backup
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const masterFilename = "agristore_backup.json";
  const dailyFilename = `agristore_backup_${today}.json`;
  
  try {
    // 1️⃣ Upload MASTER copy (always overwritten)
    console.log("📤 Uploading master backup...");
    await uploadToGoogleDrive(masterFilename, jsonData);
    
    // 2️⃣ Upload DAILY copy (one per day, overwrites same day's backup)
    console.log("📤 Uploading daily backup:", dailyFilename);
    await uploadToGoogleDrive(dailyFilename, jsonData);
    
    // 3️⃣ Clean up old daily backups (keep only last 7 days)
    await cleanupOldBackups(7);
    
    console.log("✅ Both master and daily backups uploaded successfully");
    return { success: true, masterFilename, dailyFilename };
  } catch (err) {
    console.error("Backup failed:", err);
    throw err;
  }
}

// Delete daily backups older than X days
async function cleanupOldBackups(keepDays = 7) {
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
      // Extract date from filename: agristore_backup_2026-04-01.json
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

// ✅ Enhanced backup validation - NEVER backup empty or corrupted data
function isBackupDataValid(data, prevRecordCount) {
  const totalRecords = 
    (data.customers?.length || 0) + 
    (data.items?.length || 0) + 
    (data.invoices?.length || 0) + 
    (data.users?.length || 0);
  
  // RULE 0: NEVER backup if ALL main collections are completely empty
  const hasAnyMainData = 
    (data.customers?.length > 0) || 
    (data.items?.length > 0) || 
    (data.invoices?.length > 0);
  
  if (prevRecordCount > 5 && !hasAnyMainData) {
    console.warn("🚫 Backup BLOCKED: ALL collections empty but had", prevRecordCount, "records before");
    return { valid: false, reason: "All collections empty - data may not have loaded", totalRecords };
  }
  
  // RULE 1: If we had data before and now it's all empty → BLOCK (likely crash)
  if (prevRecordCount > 10 && totalRecords === 0) {
    console.warn("🚫 Backup blocked: Data appears corrupted (was", prevRecordCount, "records, now 0)");
    return { valid: false, reason: "Data appears corrupted - all records empty", totalRecords };
  }
  
  // RULE 2: If total records dropped by more than 90% → BLOCK (likely crash)
  if (prevRecordCount > 20 && totalRecords < prevRecordCount * 0.1) {
    console.warn("🚫 Backup blocked: Data dropped by >90%");
    return { valid: false, reason: `Data dropped by >90% (${prevRecordCount} → ${totalRecords})`, totalRecords };
  }
  
  // RULE 3: Check individual collections
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
  
  // RULE 4: Valid data
  return { valid: true, totalRecords };
}

// ✅ Save individual collection counts after successful backup
function saveBackupCounts(data) {
  localStorage.setItem("agristore_backup_customers_count", String(data.customers?.length || 0));
  localStorage.setItem("agristore_backup_items_count", String(data.items?.length || 0));
  localStorage.setItem("agristore_backup_invoices_count", String(data.invoices?.length || 0));
}

// ✅ Auto Local Backup - saves to browser's IndexedDB for offline recovery
const LOCAL_BACKUP_DB_NAME = "agristore_local_backups";
const LOCAL_BACKUP_STORE = "backups";
const MAX_LOCAL_BACKUPS = 10; // Keep last 10 backups

async function openLocalBackupDB() {
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

async function saveLocalBackup(data) {
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
    
    // Clean up old backups (keep only last MAX_LOCAL_BACKUPS)
    const allRequest = store.getAll();
    allRequest.onsuccess = () => {
      const all = allRequest.result;
      if (all.length > MAX_LOCAL_BACKUPS) {
        // Sort by timestamp descending
        all.sort((a, b) => b.timestamp - a.timestamp);
        // Delete oldest
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

async function getLocalBackups() {
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

async function deleteLocalBackup(id) {
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

// ✅ Auto-Download to Computer - triggers file download every 60 minutes
const AUTO_DOWNLOAD_INTERVAL = 60 * 60 * 1000; // 60 minutes in milliseconds
const DOWNLOAD_HISTORY_KEY = "agristore_download_history";
const MAX_DOWNLOAD_HISTORY = 20;
const DOWNLOAD_FOLDER_KEY = "agristore_download_folder_handle";
const FOLDER_ORGANIZE_KEY = "agristore_folder_organize"; // "flat" or "dated"

function getDownloadHistory() {
  try {
    const stored = localStorage.getItem(DOWNLOAD_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveDownloadHistory(entry) {
  try {
    const history = getDownloadHistory();
    history.unshift(entry); // Add to beginning
    // Keep only last MAX_DOWNLOAD_HISTORY entries
    const trimmed = history.slice(0, MAX_DOWNLOAD_HISTORY);
    localStorage.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch (err) {
    console.error("Failed to save download history:", err);
    return [];
  }
}

function clearDownloadHistory() {
  localStorage.removeItem(DOWNLOAD_HISTORY_KEY);
}

// ✅ Check if File System Access API is supported
function isFileSystemAccessSupported() {
  return "showDirectoryPicker" in window;
}

// ✅ Save folder handle to IndexedDB (can't use localStorage for handles)
async function saveFolderHandle(handle) {
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

// ✅ Get saved folder handle from IndexedDB
async function getSavedFolderHandle() {
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

// ✅ Clear saved folder handle
async function clearFolderHandle() {
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

// ✅ Save file to selected folder with optional date subfolder
async function saveToSelectedFolder(data, storeName, useDateFolder = false) {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-"); // HH-MM-SS
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
      // Verify we still have permission
      const permission = await folderHandle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        const requestResult = await folderHandle.requestPermission({ mode: "readwrite" });
        if (requestResult !== "granted") {
          throw new Error("Permission denied");
        }
      }
      
      let targetFolder = folderHandle;
      let folderPath = folderHandle.name;
      
      // Create date subfolder if enabled
      if (useDateFolder) {
        const dateFolderName = `backup_${dateStr}_${timeStr.split("-").slice(0, 2).join("-")}`; // backup_2026-04-03_14-30
        targetFolder = await folderHandle.getDirectoryHandle(dateFolderName, { create: true });
        folderPath = `${folderHandle.name}/${dateFolderName}`;
      }
      
      // Create file with timestamp
      const filename = `${safeName}_${dateStr}_${timeStr}.json`;
      const fileHandle = await targetFolder.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(jsonContent);
      await writable.close();
      
      // Save to download history
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
      // Fallback to regular download
      return { success: false, fallback: true };
    }
  } catch (err) {
    console.error("Failed to save to folder:", err);
    return { success: false, error: err.message };
  }
}

// ✅ Regular file download (fallback)
function triggerFileDownload(data, storeName) {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-"); // HH-MM-SS
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
  
  // Save to download history
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

// ── ✅ LOCAL ONLY MODE - No Firebase ──────────────────────────────────────────
// All data stored locally in IndexedDB - no cloud services required
const isFirebaseConfigured = false; // Disabled - using local storage only
const firebaseApp = null;
const db = null;
const auth = null;

console.log("💾 Running in LOCAL ONLY mode - all data stored on this computer");

// ── Offline Mode State Management ─────────────────────────────────────────────
const OFFLINE_QUEUE_KEY = "agristore_offline_queue";
const OFFLINE_CHANGES_KEY = "agristore_offline_changes_count";

// Track pending offline changes
function getPendingChangesCount() {
  try {
    return parseInt(localStorage.getItem(OFFLINE_CHANGES_KEY) || "0", 10);
  } catch {
    return 0;
  }
}

function incrementPendingChanges() {
  const count = getPendingChangesCount() + 1;
  localStorage.setItem(OFFLINE_CHANGES_KEY, String(count));
  return count;
}

function resetPendingChanges() {
  localStorage.setItem(OFFLINE_CHANGES_KEY, "0");
}

// ── Firestore hook (real-time sync across all devices) ────────────────────────
// Each key maps to a Firestore document: collection="agristore", docId=key
// Data is stored as { value: [...] } so any JSON-serialisable value works.
// Firestore is the single source of truth for all data (users, customers, invoices, items, etc.)
// localStorage is NOT used for data — only for background image (bgImage_store).

// ✅ Data Schema Validation
const DATA_SCHEMAS = {
  customer: { required: ['name'], maxLength: { name: 200, phone: 20, address: 500, gstNo: 20 } },
  item: { required: ['name'], maxLength: { name: 200, category: 100, company: 200, hsn: 20 } },
  invoice: { required: ['customerId', 'items', 'total'], maxLength: { id: 50 } },
  purchase: { required: ['companyId', 'items', 'total'], maxLength: { id: 50 } },
  user: { required: ['email', 'role'], maxLength: { email: 100, name: 100 } },
};

// Validate a single record against schema
function validateRecord(record, type) {
  const schema = DATA_SCHEMAS[type];
  if (!schema) return { valid: true };
  
  // Check required fields
  for (const field of schema.required || []) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      return { valid: false, reason: `Missing required field: ${field}` };
    }
  }
  
  // Check max lengths
  for (const [field, maxLen] of Object.entries(schema.maxLength || {})) {
    if (record[field] && typeof record[field] === 'string' && record[field].length > maxLen) {
      return { valid: false, reason: `Field ${field} exceeds max length (${maxLen})` };
    }
  }
  
  return { valid: true };
}

// Sanitize data before writing to Firestore:
// - Strip ALL base64 image data (avoids account blocking for base64 rule violation)
// - Remove undefined values (Firestore rejects them)
// - Convert NaN to 0 (Firestore rejects NaN)
// - Sanitize strings for XSS prevention
function sanitizeForFirestore(val) {
  if (val === undefined || val === null) return null;
  if (Array.isArray(val)) return val.map(sanitizeForFirestore);
  if (typeof val === "object" && val !== null) {
    const clean = {};
    for (const [k, v] of Object.entries(val)) {
      if (v === undefined) continue;
      // Strip ALL base64 images — never send to Firestore
      if ((k === "image" || k === "bgImage") && typeof v === "string" && v.startsWith("data:")) {
        clean[k] = "";
        continue;
      }
      clean[k] = sanitizeForFirestore(v);
    }
    return clean;
  }
  if (typeof val === "number" && isNaN(val)) return 0;
  // ✅ Sanitize strings - prevent script injection
  if (typeof val === "string") {
    // Remove potential script tags and event handlers
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim()
      .slice(0, 10000); // Max 10KB per string field
  }
  return val;
}

// Compress image to a small JPEG thumbnail that fits safely in Firestore (<100KB)
function compressImage(file, maxWidth = 200, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ── Network connectivity hook ────────────────────────────────────────────────
function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  return isOnline;
}

// ── useFirestore replaced with useLocalData (100% Local Storage) ─────────────
// This is a wrapper that maintains the same API for backward compatibility
function useFirestore(key, defaultValue, enabled = true) {
  // Use the local data hook - all data stored in IndexedDB
  const [value, setValue, synced] = useLocalData(key, defaultValue, enabled);
  return [value, setValue, synced];
}

// ── Offline Banner — shows status but allows app to work ─────────────────────
function OfflineBanner({ pendingChanges = 0 }) {
  return (
    <div style={{ 
      position: "fixed", 
      bottom: 20, 
      left: "50%", 
      transform: "translateX(-50%)", 
      zIndex: 99999, 
      background: "linear-gradient(135deg, #1e3a5f, #0f172a)", 
      padding: "12px 24px", 
      borderRadius: 12, 
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      border: "1px solid rgba(59, 130, 246, 0.3)",
      display: "flex",
      alignItems: "center",
      gap: 12
    }}>
      <div style={{ 
        width: 10, 
        height: 10, 
        borderRadius: "50%", 
        background: "#f59e0b", 
        animation: "pulse 1.5s infinite",
        boxShadow: "0 0 8px #f59e0b"
      }} />
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#fbbf24", margin: 0 }}>
          📴 Offline Mode
        </p>
        <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
          {pendingChanges > 0 
            ? `${pendingChanges} changes pending sync` 
            : "Changes will sync when online"}
        </p>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}

// ✅ Syncing indicator (shows when coming back online)
function SyncingIndicator() {
  return (
    <div style={{ 
      position: "fixed", 
      bottom: 20, 
      left: "50%", 
      transform: "translateX(-50%)", 
      zIndex: 99999, 
      background: "linear-gradient(135deg, #065f46, #047857)", 
      padding: "12px 24px", 
      borderRadius: 12, 
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      border: "1px solid rgba(16, 185, 129, 0.3)",
      display: "flex",
      alignItems: "center",
      gap: 12
    }}>
      <div style={{ 
        width: 16, 
        height: 16, 
        border: "2px solid #10b981",
        borderTopColor: "transparent",
        borderRadius: "50%", 
        animation: "spin 1s linear infinite"
      }} />
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#34d399", margin: 0 }}>
          🔄 Syncing...
        </p>
        <p style={{ fontSize: 11, color: "#6ee7b7", margin: 0 }}>
          Uploading offline changes to server
        </p>
      </div>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ✅ Hook to track online/offline status with sync state
function useOfflineMode() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(getPendingChangesCount());
  const wasOffline = useRef(false);
  
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // If we were offline and had pending changes, show syncing state
      if (wasOffline.current && pendingChanges > 0) {
        setIsSyncing(true);
        // Firestore auto-syncs, so we just wait a bit then clear
        setTimeout(() => {
          setIsSyncing(false);
          resetPendingChanges();
          setPendingChanges(0);
          console.log("✅ All offline changes synced to Firestore!");
        }, 2000);
      }
      wasOffline.current = false;
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      wasOffline.current = true;
    };
    
    // Refresh pending count periodically
    const refreshPending = () => {
      if (!navigator.onLine) {
        setPendingChanges(getPendingChangesCount());
      }
    };
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const interval = setInterval(refreshPending, 2000);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [pendingChanges]);
  
  return { isOnline, isSyncing, pendingChanges };
}

const BLANK_ITEM = () => ({ name: "", category: "Seeds", price: "", discount: "0", stock: "", minStock: "", cgst: "0", sgst: "0", image: "", expiryDate: "" });

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtCurrency = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().split("T")[0];
const newId = (arr) => arr.length ? Math.max(...arr.map((x) => x.id)) + 1 : 1;

// ✅ UUID-based Invoice ID (prevents collision with concurrent users)
const generateUUID = () => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 7);
  return `${timestamp}-${randomPart}`;
};

// ✅ New Invoice ID: Sequential number (INV-001, INV-002, etc.)
const newInvId = (inv) => { 
  const nums = inv.map((i) => {
    const match = i.id.match(/INV-(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  });
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  return `INV-${String(nextNum).padStart(3, "0")}`; 
};

// ✅ New Purchase ID: Uses sequential number + timestamp hash for uniqueness
const newPurId = (arr) => { 
  const nums = arr.map((i) => {
    const match = i.id.match(/PUR-(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  });
  const nextNum = (nums.length ? Math.max(...nums) : 0) + 1;
  const hash = Date.now().toString(36).slice(-4);
  return `PUR-${String(nextNum).padStart(3, "0")}-${hash}`; 
};

// ── Expiry helpers ────────────────────────────────────────────────────────────
const daysUntilExpiry = (dateStr) => {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date(today());
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};
const expiryStatus = (dateStr) => {
  const d = daysUntilExpiry(dateStr);
  if (d === null) return null;
  if (d < 0) return { label: "Expired", color: "red", bg: "bg-red-900/20", text: "text-red-400", days: d };
  if (d <= 30) return { label: `${d}d left`, color: "red", bg: "bg-red-900/20", text: "text-red-400", days: d };
  if (d <= 60) return { label: `${d}d left`, color: "yellow", bg: "bg-amber-900/20", text: "text-amber-400", days: d };
  return { label: `${d}d left`, color: "green", bg: "bg-emerald-900/20", text: "text-emerald-400", days: d };
};
const fmtDate = (dateStr) => { if (!dateStr) return "—"; const [y, m, d] = dateStr.split("-"); return `${d}/${m}/${y}`; };
const nowTimestamp = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0"); };
const fmtDateTime = (s) => { if (!s) return "—"; if (!s.includes(" ")) return fmtDate(s); const [datePart, timePart] = s.split(" "); const [y, m, d] = datePart.split("-"); const [hh, mm] = timePart.split(":"); const h = parseInt(hh, 10); const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12; return `${d}/${m}/${y} ${h12}:${mm} ${ampm}`; };

// ── ✅ Debounce Utility (prevents excessive function calls) ──────────────────
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ── ✅ Action Rate Limiter (prevents spam clicking) ───────────────────────────
const actionTimestamps = {};
const ACTION_COOLDOWN = 1000; // 1 second cooldown between same actions

function canPerformAction(actionKey) {
  const now = Date.now();
  const lastAction = actionTimestamps[actionKey] || 0;
  if (now - lastAction < ACTION_COOLDOWN) {
    return false;
  }
  actionTimestamps[actionKey] = now;
  return true;
}

// ── CSV Export helper ────────────────────────────────────────────────────────
const exportCSV = (filename, headers, rows) => {
  const escape = (v) => { const s = String(v ?? ""); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ── Overdue balance helpers ───────────────────────────────────────────────────
// Days since the invoice was created (positive = days passed)
const daysSinceInvoice = (dateStr) => {
  if (!dateStr) return 0;
  const diff = new Date(today()) - new Date(dateStr);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};
// An invoice is "overdue" if it has an unpaid balance AND was created 30+ days ago
const isOverdue = (inv) => {
  const balance = inv.total - (inv.paidAmount || 0);
  return balance > 0 && daysSinceInvoice(inv.date) >= 30;
};

// ── Theme Definitions ────────────────────────────────────────────────────────
const THEMES = {
  // 🌿 Forest Green (Default)
  dark_green: { name: "🌿 Forest Green", bg: "#1a2e1a", cardBg: "rgba(20,40,20,.85)", cardBorder: "rgba(34,197,94,.2)", inputBg: "rgba(30,60,30,.6)", inputBorder: "rgba(34,197,94,.3)", textPrimary: "#d1fae5", textSecondary: "#6ee7b7", textMuted: "rgba(167,243,208,.5)", accentFrom: "#34d399", accentTo: "#6ee7b7", sidebarFrom: "#0f2410", sidebarTo: "#14291a", headerBg: "rgba(15,36,16,.9)", mainBg: "rgba(15,36,16,.5)", navActiveBg: "rgba(16,185,129,.2)", navActiveColor: "#34d399", focusRing: "rgba(16,185,129,.25)", dropBg: "#14291a", sectionGradFrom: "rgba(16,185,129,.15)", sectionGradTo: "rgba(6,78,59,.2)", btnFrom: "#059669", btnTo: "#065f46", isDark: true },
  
  // 🌊 Ocean Blue
  dark_blue: { name: "🌊 Ocean Blue", bg: "#0f172a", cardBg: "rgba(15,23,42,.88)", cardBorder: "rgba(59,130,246,.2)", inputBg: "rgba(30,41,59,.7)", inputBorder: "rgba(59,130,246,.3)", textPrimary: "#e0f2fe", textSecondary: "#7dd3fc", textMuted: "rgba(186,230,253,.5)", accentFrom: "#38bdf8", accentTo: "#7dd3fc", sidebarFrom: "#020617", sidebarTo: "#0f172a", headerBg: "rgba(2,6,23,.9)", mainBg: "rgba(15,23,42,.5)", navActiveBg: "rgba(56,189,248,.15)", navActiveColor: "#38bdf8", focusRing: "rgba(56,189,248,.25)", dropBg: "#0f172a", sectionGradFrom: "rgba(59,130,246,.15)", sectionGradTo: "rgba(30,58,138,.2)", btnFrom: "#2563eb", btnTo: "#1e40af", isDark: true },
  
  // 💜 Royal Purple
  dark_purple: { name: "💜 Royal Purple", bg: "#1e1030", cardBg: "rgba(30,16,48,.88)", cardBorder: "rgba(168,85,247,.2)", inputBg: "rgba(46,27,74,.7)", inputBorder: "rgba(168,85,247,.3)", textPrimary: "#f3e8ff", textSecondary: "#c084fc", textMuted: "rgba(216,180,254,.5)", accentFrom: "#a855f7", accentTo: "#c084fc", sidebarFrom: "#0f0720", sidebarTo: "#1e1030", headerBg: "rgba(15,7,32,.9)", mainBg: "rgba(30,16,48,.5)", navActiveBg: "rgba(168,85,247,.15)", navActiveColor: "#c084fc", focusRing: "rgba(168,85,247,.25)", dropBg: "#1e1030", sectionGradFrom: "rgba(168,85,247,.15)", sectionGradTo: "rgba(88,28,135,.2)", btnFrom: "#9333ea", btnTo: "#7e22ce", isDark: true },
  
  // 🌑 Charcoal
  dark_slate: { name: "🌑 Charcoal", bg: "#1e2936", cardBg: "rgba(30,41,54,.9)", cardBorder: "rgba(148,163,184,.15)", inputBg: "rgba(51,65,85,.7)", inputBorder: "rgba(148,163,184,.25)", textPrimary: "#e2e8f0", textSecondary: "#94a3b8", textMuted: "rgba(148,163,184,.5)", accentFrom: "#64748b", accentTo: "#94a3b8", sidebarFrom: "#0f1419", sidebarTo: "#1e2936", headerBg: "rgba(15,20,25,.92)", mainBg: "rgba(30,41,54,.5)", navActiveBg: "rgba(100,116,139,.2)", navActiveColor: "#94a3b8", focusRing: "rgba(100,116,139,.3)", dropBg: "#1e2936", sectionGradFrom: "rgba(100,116,139,.12)", sectionGradTo: "rgba(51,65,85,.2)", btnFrom: "#475569", btnTo: "#334155", isDark: true },
  
  // 💼 Corporate Dark
  corporate_dark: { name: "💼 Corporate Dark", bg: "#111827", cardBg: "rgba(17,24,39,.92)", cardBorder: "rgba(75,85,99,.25)", inputBg: "rgba(31,41,55,.8)", inputBorder: "rgba(75,85,99,.4)", textPrimary: "#f3f4f6", textSecondary: "#d1d5db", textMuted: "rgba(156,163,175,.6)", accentFrom: "#6b7280", accentTo: "#9ca3af", sidebarFrom: "#030712", sidebarTo: "#111827", headerBg: "rgba(3,7,18,.95)", mainBg: "rgba(17,24,39,.6)", navActiveBg: "rgba(107,114,128,.2)", navActiveColor: "#d1d5db", focusRing: "rgba(107,114,128,.3)", dropBg: "#1f2937", sectionGradFrom: "rgba(75,85,99,.15)", sectionGradTo: "rgba(31,41,55,.25)", btnFrom: "#4b5563", btnTo: "#374151", isDark: true },
  
  // 🌃 Midnight Pro
  midnight_pro: { name: "🌃 Midnight Pro", bg: "#0a0a1a", cardBg: "rgba(10,10,26,.95)", cardBorder: "rgba(99,102,241,.2)", inputBg: "rgba(20,20,40,.8)", inputBorder: "rgba(99,102,241,.3)", textPrimary: "#e0e7ff", textSecondary: "#a5b4fc", textMuted: "rgba(165,180,252,.5)", accentFrom: "#6366f1", accentTo: "#818cf8", sidebarFrom: "#050510", sidebarTo: "#0a0a1a", headerBg: "rgba(5,5,16,.95)", mainBg: "rgba(10,10,26,.6)", navActiveBg: "rgba(99,102,241,.15)", navActiveColor: "#a5b4fc", focusRing: "rgba(99,102,241,.25)", dropBg: "#0f0f24", sectionGradFrom: "rgba(99,102,241,.12)", sectionGradTo: "rgba(67,56,202,.2)", btnFrom: "#4f46e5", btnTo: "#4338ca", isDark: true },
  
  // 👔 Executive Gold
  executive_gold: { name: "👔 Executive Gold", bg: "#1a1814", cardBg: "rgba(26,24,20,.92)", cardBorder: "rgba(217,170,100,.2)", inputBg: "rgba(40,36,28,.8)", inputBorder: "rgba(217,170,100,.3)", textPrimary: "#fef3c7", textSecondary: "#fcd34d", textMuted: "rgba(252,211,77,.5)", accentFrom: "#f59e0b", accentTo: "#fbbf24", sidebarFrom: "#0f0d0a", sidebarTo: "#1a1814", headerBg: "rgba(15,13,10,.95)", mainBg: "rgba(26,24,20,.6)", navActiveBg: "rgba(245,158,11,.15)", navActiveColor: "#fcd34d", focusRing: "rgba(245,158,11,.25)", dropBg: "#1f1c16", sectionGradFrom: "rgba(245,158,11,.12)", sectionGradTo: "rgba(180,83,9,.2)", btnFrom: "#d97706", btnTo: "#b45309", isDark: true },
  
  // 🖤 Noir Elegant
  noir_elegant: { name: "🖤 Noir Elegant", bg: "#0d0d0d", cardBg: "rgba(13,13,13,.95)", cardBorder: "rgba(64,64,64,.3)", inputBg: "rgba(26,26,26,.9)", inputBorder: "rgba(82,82,82,.4)", textPrimary: "#fafafa", textSecondary: "#a3a3a3", textMuted: "rgba(163,163,163,.5)", accentFrom: "#525252", accentTo: "#737373", sidebarFrom: "#000000", sidebarTo: "#0d0d0d", headerBg: "rgba(0,0,0,.98)", mainBg: "rgba(13,13,13,.7)", navActiveBg: "rgba(255,255,255,.08)", navActiveColor: "#fafafa", focusRing: "rgba(255,255,255,.15)", dropBg: "#171717", sectionGradFrom: "rgba(64,64,64,.15)", sectionGradTo: "rgba(38,38,38,.25)", btnFrom: "#404040", btnTo: "#262626", isDark: true },
  
  // 🏢 Teal Business
  teal_business: { name: "🏢 Teal Business", bg: "#0f1f1f", cardBg: "rgba(15,31,31,.92)", cardBorder: "rgba(20,184,166,.2)", inputBg: "rgba(25,50,50,.8)", inputBorder: "rgba(20,184,166,.3)", textPrimary: "#ccfbf1", textSecondary: "#5eead4", textMuted: "rgba(94,234,212,.5)", accentFrom: "#14b8a6", accentTo: "#2dd4bf", sidebarFrom: "#051212", sidebarTo: "#0f1f1f", headerBg: "rgba(5,18,18,.95)", mainBg: "rgba(15,31,31,.6)", navActiveBg: "rgba(20,184,166,.15)", navActiveColor: "#2dd4bf", focusRing: "rgba(20,184,166,.25)", dropBg: "#132626", sectionGradFrom: "rgba(20,184,166,.12)", sectionGradTo: "rgba(13,148,136,.2)", btnFrom: "#0d9488", btnTo: "#0f766e", isDark: true },
  
  // 🌹 Rose Modern
  rose_modern: { name: "🌹 Rose Modern", bg: "#1f0f14", cardBg: "rgba(31,15,20,.92)", cardBorder: "rgba(244,63,94,.2)", inputBg: "rgba(50,25,32,.8)", inputBorder: "rgba(244,63,94,.3)", textPrimary: "#ffe4e6", textSecondary: "#fda4af", textMuted: "rgba(253,164,175,.5)", accentFrom: "#f43f5e", accentTo: "#fb7185", sidebarFrom: "#0f0508", sidebarTo: "#1f0f14", headerBg: "rgba(15,5,8,.95)", mainBg: "rgba(31,15,20,.6)", navActiveBg: "rgba(244,63,94,.15)", navActiveColor: "#fb7185", focusRing: "rgba(244,63,94,.25)", dropBg: "#2a131a", sectionGradFrom: "rgba(244,63,94,.12)", sectionGradTo: "rgba(190,18,60,.2)", btnFrom: "#e11d48", btnTo: "#be123c", isDark: true },
  
  // 📜 Sepia Warm
  sepia: { name: "📜 Sepia Warm", bg: "#faf6f1", cardBg: "rgba(255,253,250,.95)", cardBorder: "rgba(180,140,100,.2)", inputBg: "#fffdf9", inputBorder: "rgba(180,140,100,.3)", textPrimary: "#44403c", textSecondary: "#78716c", textMuted: "#a8a29e", accentFrom: "#a16207", accentTo: "#ca8a04", sidebarFrom: "#fefcf8", sidebarTo: "#faf6f1", headerBg: "rgba(255,253,250,.95)", mainBg: "rgba(250,246,241,.6)", navActiveBg: "rgba(161,98,7,.1)", navActiveColor: "#a16207", focusRing: "rgba(161,98,7,.2)", dropBg: "#fffdf9", sectionGradFrom: "rgba(161,98,7,.08)", sectionGradTo: "rgba(253,230,138,.15)", btnFrom: "#a16207", btnTo: "#854d0e", isDark: false },
  
  // ☀️ Light Fresh
  light: { name: "☀️ Light Fresh", bg: "#f0faf4", cardBg: "rgba(255,255,255,.92)", cardBorder: "rgba(209,250,229,.6)", inputBg: "#ffffff", inputBorder: "#d1d5db", textPrimary: "#1f2937", textSecondary: "#374151", textMuted: "#9ca3af", accentFrom: "#059669", accentTo: "#10b981", sidebarFrom: "#ffffff", sidebarTo: "#f0fdf4", headerBg: "rgba(255,255,255,.92)", mainBg: "rgba(240,253,244,.5)", navActiveBg: "rgba(16,185,129,.1)", navActiveColor: "#059669", focusRing: "rgba(16,185,129,.3)", dropBg: "#ffffff", sectionGradFrom: "rgba(16,185,129,.08)", sectionGradTo: "rgba(209,250,229,.3)", btnFrom: "#059669", btnTo: "#047857", isDark: false },
  
  // 🏔️ Arctic Blue
  arctic_blue: { name: "🏔️ Arctic Blue", bg: "#f0f9ff", cardBg: "rgba(255,255,255,.95)", cardBorder: "rgba(186,230,253,.6)", inputBg: "#ffffff", inputBorder: "#bae6fd", textPrimary: "#0c4a6e", textSecondary: "#0369a1", textMuted: "#64748b", accentFrom: "#0284c7", accentTo: "#38bdf8", sidebarFrom: "#ffffff", sidebarTo: "#f0f9ff", headerBg: "rgba(255,255,255,.95)", mainBg: "rgba(240,249,255,.6)", navActiveBg: "rgba(2,132,199,.1)", navActiveColor: "#0284c7", focusRing: "rgba(2,132,199,.25)", dropBg: "#ffffff", sectionGradFrom: "rgba(2,132,199,.08)", sectionGradTo: "rgba(186,230,253,.25)", btnFrom: "#0284c7", btnTo: "#0369a1", isDark: false },
  
  // 💎 Crystal Violet
  crystal_violet: { name: "💎 Crystal Violet", bg: "#faf5ff", cardBg: "rgba(255,255,255,.95)", cardBorder: "rgba(233,213,255,.6)", inputBg: "#ffffff", inputBorder: "#e9d5ff", textPrimary: "#581c87", textSecondary: "#7c3aed", textMuted: "#8b5cf6", accentFrom: "#8b5cf6", accentTo: "#a78bfa", sidebarFrom: "#ffffff", sidebarTo: "#faf5ff", headerBg: "rgba(255,255,255,.95)", mainBg: "rgba(250,245,255,.6)", navActiveBg: "rgba(139,92,246,.1)", navActiveColor: "#7c3aed", focusRing: "rgba(139,92,246,.25)", dropBg: "#ffffff", sectionGradFrom: "rgba(139,92,246,.08)", sectionGradTo: "rgba(233,213,255,.25)", btnFrom: "#8b5cf6", btnTo: "#7c3aed", isDark: false },
};

const buildCSS = (t, bgImage) => `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  * { font-family: 'Inter', sans-serif; box-sizing: border-box; }
  /* ── CSS variables exposed so any component can theme via text-[var(--t-...)]/bg-[var(--t-...)] ── */
  :root {
    --t-bg: ${t.bg};
    --t-card-bg: ${t.cardBg};
    --t-card-border: ${t.cardBorder};
    --t-input-bg: ${t.inputBg};
    --t-input-border: ${t.inputBorder};
    --t-text-primary: ${t.textPrimary};
    --t-text-secondary: ${t.textSecondary};
    --t-text-muted: ${t.textMuted};
    --t-accent-from: ${t.accentFrom};
    --t-accent-to: ${t.accentTo};
    --t-btn-from: ${t.btnFrom};
    --t-btn-to: ${t.btnTo};
    --t-header-bg: ${t.headerBg};
    --t-main-bg: ${t.mainBg};
    --t-section-grad-from: ${t.sectionGradFrom};
    --t-section-grad-to: ${t.sectionGradTo};
    --t-nav-active-bg: ${t.navActiveBg};
    --t-nav-active-color: ${t.navActiveColor};
    --t-drop-bg: ${t.dropBg};
    --t-focus-ring: ${t.focusRing};
    --t-sidebar-from: ${t.sidebarFrom};
    --t-sidebar-to: ${t.sidebarTo};
  }
  .app-bg {
    background-color: ${t.bg};
    ${bgImage ? `background-image: url('${bgImage}'); background-size: cover; background-position: center; background-repeat: no-repeat; background-attachment: fixed;` : ""}
  }
  input, select, textarea { color:${t.textPrimary}; background:${t.inputBg}; border-color:${t.inputBorder}; }
  input::placeholder, textarea::placeholder { color:${t.textMuted}; }
  input:focus, select:focus, textarea:focus { border-color:${t.accentFrom}; outline:none; box-shadow:0 0 0 2px ${t.focusRing}; }
  select option { background:${t.dropBg}; color:${t.textPrimary}; }
  .card { background:${t.cardBg}; backdrop-filter:blur(12px); border:1px solid ${t.cardBorder}; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,.1),0 1px 8px ${t.isDark ? "rgba(0,0,0,.15)" : "rgba(0,0,0,.05)"}; color:${t.textPrimary}; }
  .card table { color:${t.textPrimary}; }
  .card th { color:${t.textSecondary} !important; }
  .section-header { background:linear-gradient(135deg,${t.sectionGradFrom} 0%,${t.sectionGradTo} 100%); border-bottom:1px solid ${t.cardBorder}; padding:14px 20px; border-radius:14px 14px 0 0; }
  .thead-sticky { position:sticky; top:0; z-index:10; background:${t.isDark ? t.cardBg : "#ffffff"}; backdrop-filter:blur(12px); border-bottom:1px solid ${t.cardBorder}; }
  .thead-sticky th { color:${t.textMuted} !important; }
  .sidebar-bg { background:linear-gradient(180deg,${t.sidebarFrom} 0%,${t.sidebarTo} 100%); border-right:1px solid ${t.cardBorder}; }
  .nav-active { background:${t.navActiveBg}; color:${t.navActiveColor}; font-weight:600; }
  .nav-inactive { color:${t.textMuted}; }
  .nav-inactive:hover { background:${t.navActiveBg}; color:${t.textSecondary}; }
  .page-title { background:linear-gradient(135deg,${t.accentFrom} 0%,${t.accentTo} 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
  .combobox-drop { position:absolute; top:100%; left:0; right:0; background:${t.dropBg}; border:1px solid ${t.inputBorder}; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.2); z-index:100; max-height:220px; overflow-y:auto; margin-top:4px; color:${t.textPrimary}; }
  .combobox-item:hover { background:${t.navActiveBg}; }
  .t-primary { color:${t.textPrimary}; }
  .t-secondary { color:${t.textSecondary}; }
  .t-muted { color:${t.textMuted}; }
  .t-card-bg { background:${t.cardBg}; }
  .t-input-bg { background:${t.inputBg}; }
  .t-border { border-color:${t.cardBorder}; }
  .t-header { background:${t.headerBg}; border-color:${t.cardBorder}; }
  .t-main { background:${t.mainBg}; }
  .t-btn-grad { background:linear-gradient(135deg,${t.btnFrom},${t.btnTo}); }
  .modal-bg { background:${t.isDark ? t.dropBg : "#ffffff"}; border-color:${t.cardBorder}; }
  .modal-header { border-bottom:1px solid ${t.cardBorder}; background:linear-gradient(135deg,${t.sectionGradFrom},${t.sectionGradTo}); }
  .badge-green { background:${t.isDark ? "rgba(16,185,129,.15)" : "rgba(16,185,129,.12)"}; color:${t.isDark ? "#6ee7b7" : "#047857"}; }
  .badge-red { background:${t.isDark ? "rgba(239,68,68,.15)" : "rgba(239,68,68,.1)"}; color:${t.isDark ? "#fca5a5" : "#dc2626"}; }
  .badge-yellow { background:${t.isDark ? "rgba(245,158,11,.15)" : "rgba(245,158,11,.1)"}; color:${t.isDark ? "#fcd34d" : "#b45309"}; }
  .badge-blue { background:${t.isDark ? "rgba(59,130,246,.15)" : "rgba(59,130,246,.1)"}; color:${t.isDark ? "#93c5fd" : "#2563eb"}; }
  .badge-indigo { background:${t.isDark ? "rgba(99,102,241,.15)" : "rgba(99,102,241,.1)"}; color:${t.isDark ? "#a5b4fc" : "#4f46e5"}; }
  .badge-purple { background:${t.isDark ? "rgba(139,92,246,.3)" : "rgba(139,92,246,.15)"}; color:${t.isDark ? "#c4b5fd" : "#7c3aed"}; font-weight:600; }
  .badge-gray { background:${t.isDark ? "rgba(16,185,129,.15)" : "rgba(16,185,129,.08)"}; color:${t.isDark ? "#6ee7b7" : "#059669"}; }
  /* ── Theme-aware Alert / Status colors ── */
  .alert-success { background:${t.isDark ? "rgba(16,185,129,.10)" : "rgba(16,185,129,.08)"}; border-color:${t.isDark ? "rgba(16,185,129,.30)" : "rgba(16,185,129,.25)"}; color:${t.isDark ? "#a7f3d0" : "#047857"}; }
  .alert-error   { background:${t.isDark ? "rgba(239,68,68,.10)"  : "rgba(239,68,68,.08)"};  border-color:${t.isDark ? "rgba(239,68,68,.30)"  : "rgba(239,68,68,.25)"};  color:${t.isDark ? "#fecaca" : "#b91c1c"}; }
  .alert-warning { background:${t.isDark ? "rgba(245,158,11,.10)" : "rgba(245,158,11,.08)"}; border-color:${t.isDark ? "rgba(245,158,11,.30)" : "rgba(245,158,11,.25)"}; color:${t.isDark ? "#fde68a" : "#92400e"}; }
  .alert-info    { background:${t.isDark ? "rgba(59,130,246,.10)" : "rgba(59,130,246,.08)"}; border-color:${t.isDark ? "rgba(59,130,246,.30)" : "rgba(59,130,246,.25)"}; color:${t.isDark ? "#bfdbfe" : "#1e40af"}; }
  /* ── Theme text utilities (use instead of hardcoded text-emerald-*) ── */
  .t-text-success { color:${t.isDark ? "#6ee7b7" : "#047857"}; }
  .t-text-error   { color:${t.isDark ? "#fca5a5" : "#dc2626"}; }
  .t-text-warning { color:${t.isDark ? "#fcd34d" : "#b45309"}; }
  .t-text-info    { color:${t.isDark ? "#93c5fd" : "#2563eb"}; }
  /* ── Skeleton shimmer for Suspense fallback ── */
  @keyframes t-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
  .t-skeleton { background:linear-gradient(90deg, ${t.cardBg} 0%, ${t.isDark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.04)"} 50%, ${t.cardBg} 100%); background-size:800px 100%; animation:t-shimmer 1.4s linear infinite; border-radius:8px; }
  /* ── Theme-wide palette remaps ── Every theme (dark or light) remaps the
     hardcoded emerald/slate/purple Tailwind classes used across pages to the
     active theme's colors. For Forest Green (the original design), the
     mapped colors still land on emerald, so nothing visually changes. For
     Ocean Blue, Royal Purple, Light Fresh, etc., the entire UI recolors. ── */
  .text-emerald-100, .text-emerald-200 { color:${t.textPrimary} !important; }
  .text-emerald-300, .text-emerald-300\\/70 { color:${t.textSecondary} !important; }
  .text-emerald-400, .text-emerald-400\\/60, .text-emerald-400\\/70 { color:${t.textSecondary} !important; }
  .text-emerald-500\\/50, .text-emerald-500\\/60, .text-emerald-600\\/40 { color:${t.textMuted} !important; }
  .text-emerald-500 { color:${t.accentFrom} !important; }
  .text-emerald-600 { color:${t.accentFrom} !important; }
  .font-semibold.text-emerald-100, .font-bold.text-emerald-100 { color:${t.textPrimary} !important; }
  .text-red-400 { color:#dc2626 !important; }
  .text-amber-400 { color:#d97706 !important; }
  .text-purple-400 { color:#7c3aed !important; }
  .text-purple-300 { color:#8b5cf6 !important; }
  .text-blue-400 { color:#2563eb !important; }
  .text-indigo-300 { color:#4f46e5 !important; }
  .bg-purple-600 { background:#7c3aed !important; }
  .bg-purple-900\\/30 { background:rgba(139,92,246,.15) !important; }
  .bg-emerald-900\\/20, .bg-emerald-900\\/30, .bg-emerald-900\\/40, .bg-emerald-900\\/80 { background:${t.sectionGradFrom} !important; }
  .bg-emerald-800\\/20 { background:${t.sectionGradTo} !important; }
  .bg-red-900\\/20, .bg-red-900\\/30 { background:rgba(239,68,68,.06) !important; }
  .bg-amber-900\\/20, .bg-amber-900\\/30 { background:rgba(245,158,11,.06) !important; }
  .bg-purple-900\\/20, .bg-purple-900\\/30 { background:rgba(139,92,246,.06) !important; }
  .bg-blue-900\\/20 { background:rgba(59,130,246,.06) !important; }
  .bg-indigo-900\\/40 { background:rgba(99,102,241,.08) !important; }
  .border-emerald-700\\/30, .border-emerald-700\\/20, .border-emerald-800\\/30 { border-color:${t.cardBorder} !important; }
  .border-red-800\\/30, .border-red-800\\/40 { border-color:rgba(239,68,68,.2) !important; }
  .border-amber-800\\/30, .border-amber-800\\/40 { border-color:rgba(245,158,11,.2) !important; }
  .border-purple-800\\/30 { border-color:rgba(139,92,246,.2) !important; }
  .border-blue-800\\/30 { border-color:rgba(59,130,246,.2) !important; }
  .hover\\:bg-emerald-800\\/30:hover, .hover\\:bg-emerald-800\\/20:hover, .hover\\:bg-emerald-900\\/30:hover, .hover\\:bg-emerald-900\\/40:hover, .hover\\:bg-emerald-900\\/50:hover { background:${t.navActiveBg} !important; }
  .hover\\:bg-purple-900\\/30:hover { background:rgba(139,92,246,.08) !important; }
  .hover\\:text-emerald-300:hover { color:${t.accentFrom} !important; }
  .hover\\:text-red-400:hover { color:#dc2626 !important; }
  .divide-emerald-800\\/30 > :not(:last-child) { border-color:${t.cardBorder} !important; }
  .bg-emerald-500 { background:${t.btnFrom} !important; }
  .bg-emerald-600 { background:${t.btnFrom} !important; }
  .bg-emerald-600\\/20 { background:${t.sectionGradFrom} !important; }
  .border-emerald-600\\/30, .border-emerald-600\\/40 { border-color:${t.cardBorder} !important; }
  .bg-red-600 { background:#dc2626 !important; }
  .bg-emerald-900\\/30 { background:${t.sectionGradFrom} !important; }
  .bg-emerald-900\\/20 { background:${t.sectionGradFrom} !important; }
  .bg-emerald-900\\/50 { background:${t.sectionGradFrom} !important; }
  .sidebar-bg { background:linear-gradient(180deg,${t.sidebarFrom} 0%,${t.sidebarTo} 100%) !important; border-right-color:${t.cardBorder} !important; }
  .sidebar-bg .text-emerald-200 { color:${t.textPrimary} !important; }
  .sidebar-bg .text-emerald-500 { color:${t.accentFrom} !important; }
  .sidebar-bg .text-emerald-300 { color:${t.textSecondary} !important; }
  .sidebar-bg .text-emerald-400\\/60 { color:${t.textMuted} !important; }
  .sidebar-bg .text-emerald-500\\/60 { color:${t.textMuted} !important; }
  .sidebar-bg .nav-active { background:${t.navActiveBg} !important; color:${t.navActiveColor} !important; }
  .modal-bg { background:${t.dropBg} !important; border-color:${t.cardBorder} !important; }
  .modal-header { background:linear-gradient(135deg,${t.sectionGradFrom},${t.sectionGradTo}) !important; border-bottom-color:${t.cardBorder} !important; }
  .modal-bg .text-emerald-200 { color:${t.textPrimary} !important; }
  .modal-bg .text-emerald-500\\/50 { color:${t.textMuted} !important; }
  .bg-indigo-900\\/40 { background:rgba(99,102,241,.1) !important; }
  .bg-emerald-900\\/40 { background:${t.sectionGradFrom} !important; }
  .bg-red-900\\/40 { background:rgba(239,68,68,.08) !important; }
  .bg-amber-900\\/40 { background:rgba(245,158,11,.08) !important; }
  .bg-blue-900\\/40 { background:rgba(59,130,246,.08) !important; }
  .text-emerald-300 { color:${t.accentFrom} !important; }
  .text-emerald-200 { color:${t.textPrimary} !important; }
  .text-indigo-300 { color:#4f46e5 !important; }
  .text-emerald-300\\/70 { color:${t.textSecondary} !important; }
  .section-header .text-emerald-300 { color:${t.accentFrom} !important; }
  @media (max-width: 768px) {
    .sidebar-desktop { display:none !important; }
    .sidebar-desktop.mobile-open { display:flex !important; }
    .ml-56 { margin-left:0 !important; }
    .mobile-menu-btn { display:flex !important; }
    .card table { display:block; overflow-x:auto; -webkit-overflow-scrolling:touch; }
    .grid-cols-6 { grid-template-columns: repeat(2, 1fr) !important; }
    .grid-cols-4 { grid-template-columns: repeat(2, 1fr) !important; }
    .grid-cols-2 { grid-template-columns: 1fr !important; }
    .header-badges { display:none !important; }
  }
  @media (min-width: 769px) {
    .mobile-menu-btn { display:none !important; }
    .mobile-sidebar-overlay { display:none !important; }
  }
  @media print {
    body * { visibility:hidden; }
    #invoice-print,#invoice-print * { visibility:visible; color:#000 !important; background:#fff !important; }
    #invoice-print { position:absolute; left:0; top:0; width:100%; }
    .no-print { display:none !important; }
  }
`;

// ── Local Backup Section Component ────────────────────────────────────────────
function LocalBackupSection({ 
  customers, items, invoices, users, activity, categories, companies, purchases, purchaseItems, purchaseCategories, storeInfo,
  setCustomers, setItems, setInvoices, setUsers, setActivity, setCategories, setCompanies, setPurchases, setPurchaseItems, setPurchaseCategories, setStoreInfo
}) {
  const [localBackups, setLocalBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [downloadHistory, setDownloadHistory] = useState([]);
  const [showDownloadHistory, setShowDownloadHistory] = useState(false);
  const [autoDownloadEnabled, setAutoDownloadEnabled] = useState(() => localStorage.getItem("agristore_auto_download") === "true");
  const [autoDownloadIntervalMin, setAutoDownloadIntervalMin] = useState(() => {
    const v = parseInt(localStorage.getItem("agristore_auto_download_interval_min"), 10);
    return [15, 30, 60].includes(v) ? v : 60;
  });
  const [folderSelected, setFolderSelected] = useState(() => localStorage.getItem(DOWNLOAD_FOLDER_KEY) === "selected");
  const [folderName, setFolderName] = useState("");
  const [useDateFolder, setUseDateFolder] = useState(() => localStorage.getItem(FOLDER_ORGANIZE_KEY) === "dated");
  const [showFolderSettings, setShowFolderSettings] = useState(false);
  const autoDownloadRef = useRef(null);
  const showToast = useToast();
  
  const lastLocalBackup = localStorage.getItem("agristore_last_local_backup");
  const lastAutoDownload = localStorage.getItem("agristore_last_auto_download");
  const supportsFileSystem = isFileSystemAccessSupported();
  
  const loadBackups = async () => {
    setLoading(true);
    const backups = await getLocalBackups();
    setLocalBackups(backups);
    setDownloadHistory(getDownloadHistory());
    
    // Load folder name if selected
    if (folderSelected && supportsFileSystem) {
      const handle = await getSavedFolderHandle();
      if (handle) {
        setFolderName(handle.name);
      } else {
        setFolderSelected(false);
      }
    }
    setLoading(false);
  };
  
  useEffect(() => {
    loadBackups();
  }, []);

  // ✅ Auto-Download Timer (every 60 minutes)
  useEffect(() => {
    if (!autoDownloadEnabled) {
      if (autoDownloadRef.current) {
        clearInterval(autoDownloadRef.current);
        autoDownloadRef.current = null;
      }
      return;
    }

    const doAutoDownload = async () => {
      const data = {
        customers, items, invoices, users, activity, categories, companies, purchases, purchaseItems, purchaseCategories, storeInfo
      };
      
      // Check if there's any data to backup
      const hasData = customers.length > 0 || items.length > 0 || invoices.length > 0;
      if (!hasData) {
        console.log("⏳ Auto-download skipped - no data");
        return;
      }
      
      // Try to save to selected folder first
      if (folderSelected && supportsFileSystem) {
        const result = await saveToSelectedFolder(data, storeInfo?.name || "agristore", useDateFolder);
        if (result.success) {
          setDownloadHistory(getDownloadHistory());
          showToast(`📁 Auto-backup saved: ${result.entry.filename}`, "success");
          return;
        }
      }
      
      // Fallback to regular download
      const entry = triggerFileDownload(data, storeInfo?.name || "agristore");
      setDownloadHistory(getDownloadHistory());
      showToast(`📥 Auto-backup downloaded: ${entry.filename}`, "success");
    };

    // Clear existing interval
    if (autoDownloadRef.current) {
      clearInterval(autoDownloadRef.current);
    }

    // Set new interval (configurable)
    const intervalMs = autoDownloadIntervalMin * 60 * 1000;
    autoDownloadRef.current = setInterval(doAutoDownload, intervalMs);

    // Check if we should download immediately (if last download was > interval ago)
    const lastDownload = localStorage.getItem("agristore_last_auto_download");
    if (lastDownload) {
      const timeSince = Date.now() - new Date(lastDownload).getTime();
      if (timeSince >= intervalMs) {
        // Delay first download by 10 seconds to let app fully load
        setTimeout(doAutoDownload, 10000);
      }
    }

    return () => {
      if (autoDownloadRef.current) {
        clearInterval(autoDownloadRef.current);
      }
    };
  }, [autoDownloadEnabled, autoDownloadIntervalMin, folderSelected, useDateFolder, customers, items, invoices, users, activity, categories, companies, purchases, purchaseItems, purchaseCategories, storeInfo]);

  // ✅ Select folder for saving backups
  const selectFolder = async () => {
    if (!supportsFileSystem) {
      showToast("Your browser doesn't support folder selection. Use Chrome or Edge.", "error");
      return;
    }
    
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      await saveFolderHandle(handle);
      setFolderSelected(true);
      setFolderName(handle.name);
      showToast(`📁 Folder selected: ${handle.name}`, "success");
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Failed to select folder:", err);
        showToast("Failed to select folder", "error");
      }
    }
  };

  // ✅ Clear folder selection
  const clearFolder = async () => {
    await clearFolderHandle();
    setFolderSelected(false);
    setFolderName("");
    showToast("Folder selection cleared", "info");
  };

  // ✅ Toggle date folder organization
  const toggleDateFolder = () => {
    const newVal = !useDateFolder;
    setUseDateFolder(newVal);
    localStorage.setItem(FOLDER_ORGANIZE_KEY, newVal ? "dated" : "flat");
    showToast(newVal ? "Files will be saved in date folders" : "Files will be saved directly in folder", "info");
  };

  const toggleAutoDownload = () => {
    const newVal = !autoDownloadEnabled;
    setAutoDownloadEnabled(newVal);
    localStorage.setItem("agristore_auto_download", newVal ? "true" : "false");
    if (newVal) {
      showToast(`Auto-download enabled (every ${autoDownloadIntervalMin} minutes)`, "success");
    } else {
      showToast("Auto-download disabled", "info");
    }
  };

  const changeAutoDownloadInterval = (mins) => {
    const v = parseInt(mins, 10);
    if (![15, 30, 60].includes(v)) return;
    setAutoDownloadIntervalMin(v);
    localStorage.setItem("agristore_auto_download_interval_min", String(v));
    if (autoDownloadEnabled) showToast(`Backup interval set to ${v} minutes`, "success");
  };

  const manualDownload = async () => {
    const data = {
      customers, items, invoices, users, activity, categories, companies, purchases, purchaseItems, purchaseCategories, storeInfo
    };
    
    // Try to save to selected folder first
    if (folderSelected && supportsFileSystem) {
      const result = await saveToSelectedFolder(data, storeInfo?.name || "agristore", useDateFolder);
      if (result.success) {
        setDownloadHistory(getDownloadHistory());
        showToast(`📁 Saved: ${result.entry.filename}`, "success");
        return;
      }
    }
    
    // Fallback to regular download
    const entry = triggerFileDownload(data, storeInfo?.name || "agristore");
    setDownloadHistory(getDownloadHistory());
    showToast(`📥 Downloaded: ${entry.filename}`, "success");
  };
  
  const restoreFromLocal = async (backup) => {
    if (!confirm(`Restore from local backup?\n\nDate: ${new Date(backup.timestamp).toLocaleString()}\nRecords: ${backup.recordCount}\n\nThis will REPLACE all your current data!`)) return;
    
    setRestoring(true);
    try {
      const data = backup.data;
      // CRITICAL: await every setter. Each writes asynchronously to local storage;
      // if the user refreshes before writes finish, restored data is lost.
      if (data.customers) await setCustomers(data.customers);
      if (data.items) await setItems(data.items);
      if (data.invoices) await setInvoices(data.invoices);
      if (data.users) await setUsers(data.users);
      if (data.activity) await setActivity(data.activity);
      if (data.companies) await setCompanies(data.companies);
      if (data.purchases) await setPurchases(data.purchases);
      if (data.purchaseItems) await setPurchaseItems(data.purchaseItems);
      if (data.storeInfo) await setStoreInfo(data.storeInfo);
      if (data.otherExpenses) await setOtherExpenses(data.otherExpenses);
      if (data.categoryGst) await setCategoryGst(data.categoryGst);

      // Merge categories from backup + extract from items to ensure all are visible in Manage Categories
      const backupCategories = data.categories || [];
      const itemCategories = (data.items || []).map(i => i.category).filter(Boolean);
      const purchaseItemCategories = (data.purchaseItems || []).map(i => i.category).filter(Boolean);
      const allCats = [...new Set([...backupCategories, ...itemCategories, ...purchaseItemCategories])].filter(Boolean);
      await setCategories(allCats);

      // Also merge purchase categories
      const backupPurCats = data.purchaseCategories || [];
      const purItemCats = (data.purchaseItems || []).map(i => i.category).filter(Boolean);
      const allPurCats = [...new Set([...backupPurCats, ...purItemCats])].filter(Boolean);
      await setPurchaseCategories(allPurCats);
      
      showToast("Data restored from local backup!", "success");
    } catch (err) {
      console.error("Failed to restore:", err);
      showToast("Failed to restore backup", "error");
    }
    setRestoring(false);
  };
  
  const deleteBackup = async (id) => {
    if (!confirm("Delete this local backup?")) return;
    await deleteLocalBackup(id);
    loadBackups();
    showToast("Backup deleted", "success");
  };
  
  const manualLocalBackup = async () => {
    const data = {
      customers, items, invoices, users, activity, categories, categoryGst, companies, purchases, purchaseItems, purchaseCategories, otherExpenses, storeInfo
    };
    const success = await saveLocalBackup(data);
    if (success) {
      showToast("Local backup saved!", "success");
      loadBackups();
    } else {
      showToast("Failed to save local backup", "error");
    }
  };

  const clearHistory = () => {
    if (!confirm("Clear all download history?")) return;
    clearDownloadHistory();
    setDownloadHistory([]);
    showToast("Download history cleared", "success");
  };
  
  return (
    <div className="card p-5">
      {/* Header */}
      <div className="mb-4">
        <h2 className="font-bold text-emerald-200 flex items-center gap-2">
          <span>�</span> Backup Settings
        </h2>
        <p className="text-xs text-emerald-500/50 mt-1">
          Manage your data backups and downloads.
        </p>
      </div>

      {/* Auto-Download to Computer */}
      <div className="p-4 rounded-xl bg-blue-900/20 border border-blue-700/30 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-xl">📥</span>
            <div>
              <p className="text-sm font-semibold text-blue-200">Auto-Download to Computer</p>
              <p className="text-xs text-blue-400/60">
                Download backup file every {autoDownloadIntervalMin} minutes
                {lastAutoDownload && (
                  <span className="ml-1">• Last: {new Date(lastAutoDownload).toLocaleString()}</span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={toggleAutoDownload}
            className={`relative inline-flex items-center shrink-0 w-11 h-6 rounded-full transition-colors ${
              autoDownloadEnabled ? "bg-blue-500" : "bg-blue-900/40"
            }`}
          >
            <span className={`inline-block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
              autoDownloadEnabled ? "translate-x-[22px]" : "translate-x-[2px]"
            }`}></span>
          </button>
        </div>

        {/* Interval picker */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-blue-900/30 mb-2">
          <span className="text-xs text-blue-300 flex items-center gap-2">
            <span>⏱️</span> Backup interval
          </span>
          <div className="flex gap-1">
            {[15, 30, 60].map((m) => (
              <button
                key={m}
                onClick={() => changeAutoDownloadInterval(m)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  autoDownloadIntervalMin === m
                    ? "bg-blue-500 text-white"
                    : "bg-blue-900/40 text-blue-300 hover:bg-blue-900/60"
                }`}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>

        {/* Folder Settings Toggle */}
        <button
          onClick={() => setShowFolderSettings(!showFolderSettings)}
          className="w-full flex items-center justify-between p-2 rounded-lg bg-blue-900/30 hover:bg-blue-900/40 transition-colors text-xs"
        >
          <span className="flex items-center gap-2 text-blue-300">
            <span>📁</span>
            <span>Save Location Settings</span>
            {folderSelected && <span className="text-emerald-400">✓ Custom folder set</span>}
          </span>
          <span className="text-blue-400">{showFolderSettings ? "▼" : "▶"}</span>
        </button>

        {/* Folder Selection Panel */}
        {showFolderSettings && (
          <div className="mt-3 p-3 rounded-lg bg-blue-950/30 border border-blue-800/30 space-y-3">
            {/* Browser Support Warning */}
            {!supportsFileSystem && (
              <div className="p-2 rounded-lg bg-amber-900/20 border border-amber-700/30 text-xs text-amber-400">
                ⚠️ Your browser doesn't support folder selection. Use <strong>Chrome</strong> or <strong>Edge</strong> for this feature.
              </div>
            )}

            {/* Current Folder Status */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-blue-300">
                <span className="font-semibold">Save Location:</span>
                {folderSelected ? (
                  <span className="ml-2 px-2 py-1 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-700/30">
                    � {folderName}
                  </span>
                ) : (
                  <span className="ml-2 text-blue-400/60">Default Downloads folder</span>
                )}
              </div>
            </div>

            {/* Folder Selection Buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={selectFolder}
                disabled={!supportsFileSystem}
                className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  supportsFileSystem 
                    ? "bg-indigo-900/40 text-indigo-300 border border-indigo-700/30 hover:bg-indigo-900/60"
                    : "bg-gray-800/30 text-gray-500 border border-gray-700/30 cursor-not-allowed"
                }`}
              >
                📂 {folderSelected ? "Change Folder" : "Select Folder"}
              </button>
              {folderSelected && (
                <button
                  onClick={clearFolder}
                  className="px-3 py-2 text-xs font-semibold rounded-lg bg-red-900/30 text-red-400 border border-red-700/30 hover:bg-red-900/50 transition-colors"
                >
                  ✕ Clear Selection
                </button>
              )}
            </div>

            {/* Date Folder Organization */}
            {folderSelected && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-purple-900/20 border border-purple-800/30">
                <div className="text-xs text-purple-300">
                  <span className="font-semibold">📅 Organize by Date Folder</span>
                  <p className="text-purple-400/60 mt-0.5">
                    Create subfolder: <code className="bg-purple-900/40 px-1 rounded">backup_2026-04-03_14-30/</code>
                  </p>
                </div>
                <button
                  onClick={toggleDateFolder}
                  className={`relative inline-flex items-center shrink-0 w-11 h-6 rounded-full transition-colors ${
                    useDateFolder ? "bg-purple-500" : "bg-purple-900/40"
                  }`}
                >
                  <span className={`inline-block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    useDateFolder ? "translate-x-[22px]" : "translate-x-[2px]"
                  }`}></span>
                </button>
              </div>
            )}

            {/* Preview */}
            <div className="p-2 rounded-lg bg-gray-900/30 border border-gray-700/30 text-xs">
              <span className="text-gray-400">Preview path:</span>
              <code className="block mt-1 text-emerald-400 break-all">
                {folderSelected ? (
                  useDateFolder 
                    ? `${folderName}/backup_2026-04-03_14-30/${storeInfo?.name?.replace(/\s+/g, '_') || 'agristore'}_2026-04-03_14-30-45.json`
                    : `${folderName}/${storeInfo?.name?.replace(/\s+/g, '_') || 'agristore'}_2026-04-03_14-30-45.json`
                ) : (
                  `Downloads/${storeInfo?.name?.replace(/\s+/g, '_') || 'agristore'}_backup_2026-04-03_14-30-45.json`
                )}
              </code>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={manualLocalBackup}
          className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-900/30 text-emerald-400 border border-emerald-700/30 hover:bg-emerald-900/50 transition-colors"
        >
          💾 Save Backup Now
        </button>
        <button
          onClick={manualDownload}
          className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-900/30 text-blue-400 border border-blue-700/30 hover:bg-blue-900/50 transition-colors"
        >
          {folderSelected ? "📁 Save to Folder" : "📥 Download Now"}
        </button>
        <button
          onClick={loadBackups}
          disabled={loading}
          className="px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-900/20 text-emerald-400 border border-emerald-700/30 hover:bg-emerald-900/40 transition-colors"
        >
          {loading ? "Loading..." : "🔄 Refresh"}
        </button>
      </div>

      {/* Download History */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setShowDownloadHistory(!showDownloadHistory)}
            className="text-sm font-bold text-blue-300 hover:text-blue-200 flex items-center gap-1"
          >
            📥 Download History ({downloadHistory.length})
            <span className="text-xs">{showDownloadHistory ? "▼" : "▶"}</span>
          </button>
          {showDownloadHistory && downloadHistory.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Clear All
            </button>
          )}
        </div>
        
        {showDownloadHistory && (
          downloadHistory.length === 0 ? (
            <div className="text-center py-4 text-blue-400/50 bg-blue-900/10 rounded-xl border border-blue-800/20">
              <p className="text-xs">No downloads yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {downloadHistory.slice(0, 10).map((entry, idx) => (
                <div 
                  key={entry.id}
                  className={`flex items-center justify-between p-3 rounded-xl border ${
                    entry.savedToFolder 
                      ? "bg-indigo-900/20 border-indigo-800/30" 
                      : "bg-blue-900/20 border-blue-800/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{entry.savedToFolder ? "📁" : (idx === 0 ? "📄" : "📃")}</span>
                    <div>
                      <p className={`text-sm font-medium truncate max-w-[200px] ${entry.savedToFolder ? "text-indigo-300" : "text-blue-300"}`} title={entry.filename}>
                        {entry.filename}
                      </p>
                      <p className={`text-xs ${entry.savedToFolder ? "text-indigo-400/50" : "text-blue-400/50"}`}>
                        {new Date(entry.timestamp).toLocaleString()} • {entry.recordCount} records • {(entry.size / 1024).toFixed(1)} KB
                        {entry.folderPath && <span className="ml-1">• 📁 {entry.folderPath}</span>}
                      </p>
                    </div>
                  </div>
                  <div className={`text-xs ${entry.savedToFolder ? "text-indigo-400/40" : "text-blue-400/40"}`}>
                    {entry.savedToFolder ? "Saved ✓" : "Downloaded ✓"}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Info */}
      <div className="mt-4 p-3 rounded-xl bg-emerald-900/10 border border-emerald-800/20">
        <p className="text-xs text-emerald-400/80">
          <strong>� Tip:</strong> Data is automatically saved locally. Use download to create backup files on your computer.
        </p>
      </div>
    </div>
  );
}


// ── App ───────────────────────────────────────────────────────────────────────
// Lazy load License Activation Page
const LicenseActivationPage = React.lazy(() => import('./pages/LicenseActivationPage'));

export default function App() {
  // ✅ LICENSE STATE - Check license before anything else
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [licenseChecked, setLicenseChecked] = useState(false);
  
  // ✅ Firebase Auth state — survives page refresh via onAuthStateChanged
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured); // true immediately if no Firebase
  const [page, setPage] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [itemsStockFilter, setItemsStockFilter] = useState("all"); // For navigating from dashboard with filter
  
  // ✅ CRASH RECOVERY: Track if app crashed last time
  const [showCrashRecovery, setShowCrashRecovery] = useState(false);
  const [backupList, setBackupList] = useState([]);
  const [backupStatus, setBackupStatus] = useState(null);
  
  // ✅ OFFLINE MODE: Use enhanced hook with sync state
  const { isOnline, isSyncing, pendingChanges } = useOfflineMode();

  // ✅ ALL DATA HOOKS - Must be called before any returns (React Rules of Hooks)
  const [users, setUsers, usersSynced] = useFirestore("agristore_users", [], true);
  const [customers, setCustomers] = useFirestore("agristore_customers", [], true);
  const [items, setItems] = useFirestore("agristore_items", [], true);
  const [invoices, setInvoices] = useFirestore("agristore_invoices", [], true);
  const [activity, setActivity] = useFirestore("agristore_activity", [], true);
  const [storeInfo, setStoreInfo] = useFirestore("agristore_store", {}, true);
  const [categories, setCategories] = useFirestore("agristore_categories", [], true);
  const [categoryGst, setCategoryGst] = useFirestore("agristore_category_gst", {}, true);
  const [companies, setCompanies] = useFirestore("agristore_companies", [], true);
  const [purchases, setPurchases] = useFirestore("agristore_purchases", [], true);
  const [purchaseItems, setPurchaseItems] = useFirestore("agristore_purchase_items", [], true);
  const [purchaseCategories, setPurchaseCategories] = useFirestore("agristore_purchase_categories", [], true);
  const [otherExpenses, setOtherExpenses] = useFirestore("agristore_other_expenses", [], true);
  const [invoiceState, setInvoiceState] = useState({ view: "list", custId: "", invItems: [], selected: null });
  const [purchaseState, setPurchaseState] = useState({ view: "create", compId: "", purItems: [], selected: null });
  // Background image stored separately in localStorage (never in Firestore)
  const [bgImageLocal, setBgImageLocal] = useState(() => localStorage.getItem("bgImage_store") || "");
  
  // ✅ CHECK LICENSE on app start (Electron only)
  useEffect(() => {
    const checkLicense = async () => {
      // Only check license in Electron desktop app
      if (window.electronAPI?.license?.check) {
        try {
          const status = await window.electronAPI.license.check();
          setLicenseStatus(status);
        } catch (err) {
          console.error('License check error:', err);
          // On error, assume licensed (don't block app for check errors)
          setLicenseStatus({ valid: true, status: 'check_error' });
        }
      } else {
        // Browser mode - no license needed
        setLicenseStatus({ valid: true, status: 'browser_mode' });
      }
      setLicenseChecked(true);
    };
    checkLicense();
  }, []);
  
  // ✅ Initialize crash recovery system on app start
  useEffect(() => {
    const init = async () => {
      try {
        const wasCrashed = await initCrashRecovery();
        if (wasCrashed) {
          const backups = getBackupList();
          if (backups.length > 0) {
            setBackupList(backups);
            setShowCrashRecovery(true);
          }
        }
        // Check backup status for dashboard warning
        const { getBackupStatus } = await import('./services/crashRecovery.js');
        setBackupStatus(getBackupStatus());
      } catch (err) {
        console.error('Crash recovery init error:', err);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      // No Firebase — restore the real user object from the local session
      // (saveSession stores { user, expiresAt }, so we must unwrap it; otherwise
      // role is undefined on refresh and the user loses admin access).
      try {
        const user = getCurrentUser();
        if (user) setCurrentUser(user);
      } catch { }
      setAuthReady(true);
      return;
    }
    // Firebase configured — listen for auth state changes (handles page refresh automatically)
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Only set _pending if no user is set yet (don't overwrite a valid role from handleLogin)
        setCurrentUser((prev) => {
          if (prev && prev.email === firebaseUser.email && prev.role && prev.role !== "_pending") return prev;
          return { id: firebaseUser.uid, name: firebaseUser.displayName || firebaseUser.email, email: firebaseUser.email, role: "_pending" };
        });
      } else {
        setCurrentUser(null);
      }
      setAuthReady(true);
    });
    return unsub;
  }, []); // eslint-disable-line
  
  // Handle license activation - reload app to reinitialize everything
  const handleLicenseActivated = (licenseInfo) => {
    console.log('✅ License activated, reloading app...');
    // Reload the entire app to properly initialize with valid license
    window.location.reload();
  };

  const handleLogin = (user) => {
    setCurrentUser(user);
  };
  const handleLogout = async () => {
    // Local logout - clear session
    logoutLocal();
    setCurrentUser(null);
  };

  // Always resolve/verify role from local users list — the single source of truth
  useEffect(() => {
    if (!currentUser || !currentUser.email || !usersSynced || !users || !users.length) return;
    const profile = users.find((u) => u?.email && currentUser?.email && u.email.toLowerCase() === currentUser.email.toLowerCase());
    if (!profile) {
      // User not in users list — default to salesperson
      if (currentUser.role === "_pending") {
        setCurrentUser((prev) => ({ ...prev, role: "salesperson" }));
      }
      return;
    }
    // Always sync role from users list (handles role changes by admin too)
    if (currentUser.role !== profile.role || currentUser.name !== profile.name) {
      setCurrentUser((prev) => ({ ...prev, role: profile.role, name: profile.name }));
    }
  }, [currentUser?.email, currentUser?.role, users, usersSynced]);

  const onAddCategory = (cat) => setCategories((p) => p.includes(cat) ? p : [...p, cat]);
  // ✅ Remove category — also clears it from items (resets to "Other")
  const onRemoveCategory = (cat) => {
    setCategories((p) => p.filter((c) => c !== cat));
    setItems((p) => p.map((i) => i.category === cat ? { ...i, category: "Other" } : i));
  };

  // ✅ Activity log limit - prevents memory issues over time
  const MAX_ACTIVITY_LOG_SIZE = 1000;
  
  const addActivity = (text, type) => {
    const now = new Date();
    const time = `${now.toISOString().split("T")[0]} ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    setActivity((p) => [{ id: newId(p), text, time, type }, ...p].slice(0, MAX_ACTIVITY_LOG_SIZE));
  };

  const lowStockCount = useMemo(() => items.filter((i) => (i.minStock || 0) > 0 && i.stock <= (i.minStock || 0)).length, [items]);
  const expiringCount = useMemo(() => items.filter((i) => { const d = daysUntilExpiry(i.expiryDate); return d !== null && d >= 0 && d <= 60; }).length, [items]);
  const overdueCount = useMemo(() => invoices.filter(isOverdue).length, [invoices]);

  // ✅ Global Auto-Backup to Google Drive (works on ALL pages)
  const globalBackupData = useMemo(() => ({
    customers,
    items,
    invoices,
    users,
    activity,
    storeInfo,
    categories,
    categoryGst,
    companies,
    purchases,
    purchaseItems,
    purchaseCategories,
    otherExpenses,
  }), [customers, items, invoices, users, activity, storeInfo, categories, categoryGst, companies, purchases, purchaseItems, purchaseCategories, otherExpenses]);

  const [globalGdriveConnected, setGlobalGdriveConnected] = useState(false);
  const [globalBackupStatus, setGlobalBackupStatus] = useState("idle");
  const globalBackupTimeoutRef = useRef(null);
  const globalAutoBackupEnabled = localStorage.getItem("agristore_gdrive_auto") === "true";

  // Check Google Drive connection on app load
  useEffect(() => {
    if (!currentUser) return;
    const checkConnection = async () => {
      try {
        const restored = await restoreGDriveConnection();
        setGlobalGdriveConnected(restored);
      } catch {
        setGlobalGdriveConnected(false);
      }
    };
    checkConnection();
  }, [currentUser]);

  // Global auto-backup when data changes (works on ANY page)
  useEffect(() => {
    // ✅ Always save local backup regardless of Google Drive connection
    const hasAnyData = customers.length > 0 || items.length > 0 || invoices.length > 0;
    
    if (hasAnyData && currentUser) {
      // Save to local IndexedDB backup
      const localBackupData = {
        customers,
        items,
        invoices,
        users,
        activity,
        storeInfo,
        categories,
        categoryGst,
        companies,
        purchases,
        purchaseItems,
        purchaseCategories,
        otherExpenses,
      };
      
      // Debounce local backup (30 seconds)
      const localBackupKey = "agristore_local_backup_pending";
      if (!sessionStorage.getItem(localBackupKey)) {
        sessionStorage.setItem(localBackupKey, "1");
        setTimeout(async () => {
          await saveLocalBackup(localBackupData);
          saveBackupCounts(localBackupData);
          sessionStorage.removeItem(localBackupKey);
        }, 30000); // Save every 30 seconds
      }
    }
    
    // Google Drive backup (only if connected)
    if (!globalAutoBackupEnabled || !globalGdriveConnected || !currentUser) return;
    
    if (globalBackupTimeoutRef.current) clearTimeout(globalBackupTimeoutRef.current);
    globalBackupTimeoutRef.current = setTimeout(async () => {
      try {
        // ✅ CHECK RATE LIMITS FIRST (prevents Google flagging)
        const rateCheck = canPerformGDriveBackup();
        if (!rateCheck.allowed) {
          console.log(`⏳ Auto-backup delayed: ${rateCheck.reason}`);
          // Don't show error status for rate limiting - it's expected behavior
          return;
        }
        
        // ✅ Check for exponential backoff (after errors)
        const backoffDelay = getBackoffDelay();
        if (backoffDelay > 0) {
          console.log(`⏳ Backoff delay active: waiting ${backoffDelay / 1000}s before retry`);
          return;
        }
        
        // ✅ Validate data before backup (prevent empty data overwrite)
        const prevCount = parseInt(localStorage.getItem("agristore_backup_record_count") || "0", 10);
        const validation = isBackupDataValid(globalBackupData, prevCount);
        
        if (!validation.valid) {
          console.warn("⚠️ Auto-backup skipped:", validation.reason);
          setGlobalBackupStatus("error");
          setTimeout(() => setGlobalBackupStatus("idle"), 5000);
          return;
        }
        
        setGlobalBackupStatus("syncing");
        const fullBackup = {
          ...globalBackupData,
          _meta: {
            version: "1.0",
            exportedAt: new Date().toISOString(),
            source: "Agri Store",
            recordCount: validation.totalRecords,
          },
        };
        
        // ✅ Upload BOTH master and daily copy to Google Drive
        await uploadToGoogleDriveWithHistory(fullBackup);
        
        // ✅ Record successful backup for rate limiting
        recordGDriveBackup();
        
        // ✅ Also save to local backup
        await saveLocalBackup(fullBackup);
        saveBackupCounts(globalBackupData);
        
        const now = new Date();
        localStorage.setItem("agristore_last_backup", now.toISOString());
        localStorage.setItem("agristore_backup_record_count", String(validation.totalRecords));
        setGlobalBackupStatus("success");
        
        // ✅ Log with rate limit stats
        const stats = getGDriveBackupStats();
        console.log(`✅ Auto-backup completed: ${now.toLocaleString()} | Records: ${validation.totalRecords} | Today: ${stats.dailyCount}/${stats.dailyLimit}`);
        setTimeout(() => setGlobalBackupStatus("idle"), 3000);
      } catch (err) {
        console.error("Auto-backup failed:", err);
        setGlobalBackupStatus("error");
        
        // ✅ Record error for exponential backoff
        recordGDriveError();
        
        // If token expired and couldn't be refreshed, mark as disconnected
        if (err.message === "TOKEN_EXPIRED" || err.message?.includes("401") || err.status === 401) {
          localStorage.removeItem(GDRIVE_TOKEN_KEY);
          setGlobalGdriveConnected(false);
        }
        setTimeout(() => setGlobalBackupStatus("idle"), 5000);
      }
    }, GDRIVE_RATE_LIMIT.AUTO_BACKUP_DELAY); // ✅ Wait 30 seconds after last change (was 5 seconds!)

    return () => {
      if (globalBackupTimeoutRef.current) clearTimeout(globalBackupTimeoutRef.current);
    };
  }, [globalBackupData, globalAutoBackupEnabled, globalGdriveConnected, currentUser, customers, items, invoices]);

  // ✅ Loading timeout state
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  
  // ✅ Add timeout for loading - don't get stuck forever
  useEffect(() => {
    if (!authReady || (currentUser && currentUser.role === "_pending")) {
      const timeout = setTimeout(() => {
        console.warn("⚠️ Loading timeout reached (15 seconds)");
        setLoadingTimeout(true);
        if (currentUser && currentUser.role === "_pending") {
          console.warn("⚠️ Forcing role to salesperson due to timeout");
          setCurrentUser((prev) => ({ ...prev, role: "salesperson" }));
        }
      }, 15000);
      return () => clearTimeout(timeout);
    }
  }, [authReady, currentUser?.role]);

  // ✅ Minimum loading-screen duration so the "Connecting to your store..."
  // screen reliably shows on every refresh, even when the local session is
  // restored synchronously.
  const [minLoadingElapsed, setMinLoadingElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinLoadingElapsed(true), 900);
    return () => clearTimeout(t);
  }, []);

  // ✅ Show spinner while checking license or auth state
  const isLicenseLoading = !licenseChecked;
  const isAuthLoading = !authReady || (currentUser && currentUser.role === "_pending" && !loadingTimeout);
  const isLoading = isLicenseLoading || isAuthLoading || !minLoadingElapsed;
  
  // ✅ LICENSE CHECK - Show activation page if not licensed
  if (licenseChecked && licenseStatus && !licenseStatus.valid) {
    return (
      <React.Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center t-main p-6">
            <div className="w-full max-w-md card p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="t-skeleton w-12 h-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="t-skeleton h-4 w-3/4" />
                  <div className="t-skeleton h-3 w-1/2" />
                </div>
              </div>
              <div className="t-skeleton h-10 w-full" />
              <div className="t-skeleton h-10 w-full" />
              <div className="t-skeleton h-10 w-2/3 mx-auto" />
              <p className="text-center text-xs t-muted pt-2">Loading activation…</p>
            </div>
          </div>
        }
      >
        <LicenseActivationPage onActivated={handleLicenseActivated} />
      </React.Suspense>
    );
  }
  
  if (isLoading) return (
    <>
      <style>{buildCSS(THEMES[storeInfo?.theme] || THEMES.dark_green, bgImageLocal)}</style>
      {!isOnline && <OfflineBanner pendingChanges={pendingChanges} />}
      {isSyncing && <SyncingIndicator />}
      <div className="min-h-screen flex items-center justify-center app-bg">
        <div className="text-center px-6">
          {/* Logo - Large with pulse animation */}
          <div className="relative mb-6">
            {storeInfo?.logo ? (
              <img 
                src={storeInfo.logo} 
                alt="Store Logo" 
                className="w-32 h-32 sm:w-40 sm:h-40 mx-auto rounded-2xl object-cover shadow-2xl ring-4 ring-emerald-500/30 animate-pulse"
              />
            ) : (
              <div className="w-32 h-32 sm:w-40 sm:h-40 mx-auto rounded-2xl flex items-center justify-center animate-pulse p-5">
                <img src={riceIcon} alt="AgriStore" className="w-full h-full object-contain" />
              </div>
            )}
          </div>
          
          {/* Store Name - Big and Bold */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-emerald-400 mb-2 animate-fade-in">
            {storeInfo?.name || "Agri Store"}
          </h1>
          
          
          {/* Loading Animation - Dots */}
          <div className="flex items-center justify-center gap-1.5 mb-4">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-bounce" style={{animationDelay: "0ms"}}></div>
            <div className="w-3 h-3 rounded-full bg-emerald-400 animate-bounce" style={{animationDelay: "150ms"}}></div>
            <div className="w-3 h-3 rounded-full bg-emerald-300 animate-bounce" style={{animationDelay: "300ms"}}></div>
          </div>
          
          {/* Status Text */}
          <p className="text-emerald-500/60 text-xs sm:text-sm font-medium">
            {isLicenseLoading ? "Checking license..." : "Connecting to your store..."}
          </p>
          
          {/* Progress Bar Animation */}
          <div className="mt-4 w-48 h-1.5 mx-auto bg-emerald-900/30 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 rounded-full animate-loading-progress"></div>
          </div>
          
          {loadingTimeout && (
            <div className="mt-6 p-4 rounded-xl bg-amber-900/30 border border-amber-700/40 max-w-sm mx-auto">
              <p className="text-amber-400 text-sm font-semibold mb-2">⚠️ Taking longer than expected</p>
              <p className="text-amber-400/60 text-xs mb-3">Check your internet connection or try refreshing</p>
              <button 
                onClick={() => window.location.reload()} 
                className="px-5 py-2 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-500 transition-all transform hover:scale-105 shadow-lg"
              >
                🔄 Refresh Page
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Loading Animation Keyframes */}
      <style>{`
        @keyframes loading-progress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
        .animate-loading-progress {
          animation: loading-progress 1.5s ease-in-out infinite;
        }
        @keyframes fade-in {
          0% { opacity: 0; transform: translateY(-10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
      `}</style>
    </>
  );
  if (!currentUser) return <><style>{buildCSS(THEMES[storeInfo?.theme] || THEMES.dark_green, bgImageLocal)}</style>{!isOnline && <OfflineBanner pendingChanges={0} />}<LoginPage onLogin={handleLogin} users={users} storeName={storeInfo?.name} /></>;

  // Backup handlers for Dashboard
  const handleExportBackup = async () => {
    try {
      const { exportToFile, recordFileExport, getBackupStatus } = await import('./services/crashRecovery.js');
      await exportToFile();
      recordFileExport();
      setBackupStatus(getBackupStatus());
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleDismissBackupReminder = async () => {
    const { dismissBackupReminder, getBackupStatus } = await import('./services/crashRecovery.js');
    dismissBackupReminder();
    setBackupStatus(getBackupStatus());
  };

  const props = { items, setItems, customers, setCustomers, invoices, setInvoices, users, setUsers, activity, setActivity, user: currentUser, addActivity, storeInfo, setStoreInfo, categories, setCategories, categoryGst, setCategoryGst, onAddCategory, onRemoveCategory, invoiceState, setInvoiceState, companies, setCompanies, purchases, setPurchases, purchaseState, setPurchaseState, setPage, setBgImageLocal, purchaseItems, setPurchaseItems, purchaseCategories, setPurchaseCategories, itemsStockFilter, setItemsStockFilter, otherExpenses, setOtherExpenses };

  // Dashboard props with backup status
  const dashboardProps = {
    ...props,
    backupStatus,
    onExportBackup: handleExportBackup,
    onDismissBackupReminder: handleDismissBackupReminder,
  };

  // Additional props for StoreSettingsPage
  const settingsProps = {
    ...props,
    THEMES,
    LocalBackupSection
  };

  const renderPage = () => {
    switch (page) {
      case "customers": return <CustomersPage {...props} />;
      case "items": return <ItemsPage {...props} />;
      case "invoices": return <InvoicesPage {...props} />;
      case "purchases": return <PurchasesPage {...props} />;
      case "users": return <UsersPage {...props} />;
      case "otherExpenses": return <OtherExpensesPage otherExpenses={otherExpenses} setOtherExpenses={setOtherExpenses} addActivity={addActivity} user={currentUser} />;
      case "reports": return <ReportsPage invoices={invoices} purchases={purchases} customers={customers} items={items} otherExpenses={otherExpenses} />;
      case "settings": return <StoreSettingsPage {...settingsProps} />;
      default: return <Dashboard {...dashboardProps} />;
    }
  };

  // Quick connect to Google Drive from header
  const quickConnectGDrive = async () => {
    try {
      await loadGoogleScripts();
      await getGoogleDriveToken();
      setGlobalGdriveConnected(true);
    } catch (err) {
      console.error("Quick connect failed:", err);
    }
  };

  return (
    <ErrorBoundary>
    <ToastProvider>
      <style>{buildCSS(THEMES[storeInfo?.theme] || THEMES.dark_green, bgImageLocal)}</style>
      
      {/* ✅ CRASH RECOVERY MODAL */}
      {showCrashRecovery && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4">
          <div className="bg-slate-900 rounded-2xl border border-amber-600/50 p-6 max-w-lg w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <div>
                <h2 className="text-xl font-bold text-amber-400">App Crashed Last Time</h2>
                <p className="text-slate-400 text-sm">Don't worry! Your data has automatic backups.</p>
              </div>
            </div>
            
            <div className="bg-slate-800/50 rounded-lg p-4 mb-4 max-h-60 overflow-y-auto">
              <p className="text-sm text-slate-300 mb-3">Available backups:</p>
              {backupList.slice(0, 5).map((backup, i) => (
                <div key={backup.key} className="flex items-center justify-between py-2 border-b border-slate-700 last:border-0">
                  <div>
                    <span className="text-sm text-white">{new Date(backup.timestamp).toLocaleString()}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
                      backup.type === 'auto' ? 'bg-blue-900/50 text-blue-400' : 
                      backup.type === 'emergency' ? 'bg-red-900/50 text-red-400' : 
                      'bg-green-900/50 text-green-400'
                    }`}>{backup.type}</span>
                    <p className="text-xs text-slate-500">{backup.itemCount} items, {backup.customerCount} customers, {backup.invoiceCount} invoices</p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await restoreFromBackup(backup.key);
                        clearCrashFlag();
                        setShowCrashRecovery(false);
                        window.location.reload();
                      } catch (err) {
                        alert('Restore failed: ' + err.message);
                      }
                    }}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  clearCrashFlag();
                  setShowCrashRecovery(false);
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg"
              >
                Continue Without Restore
              </button>
              <button
                onClick={() => {
                  exportToFile();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg"
              >
                📥 Export Backup
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* ✅ Skip Link for keyboard accessibility */}
      <SkipLink targetId="main-content" />
      {!isOnline && <OfflineBanner pendingChanges={pendingChanges} />}
      {isSyncing && <SyncingIndicator />}
      <div className="flex min-h-screen app-bg">
        <Sidebar page={page} setPage={setPage} user={currentUser} onLogout={handleLogout} storeInfo={storeInfo} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
        <div className="ml-56 flex-1 flex flex-col min-h-screen">
          <header className="t-header border-b px-3 md:px-6 py-7 flex items-center justify-between no-print shadow-sm sticky top-0 z-30" style={{ backdropFilter:"blur(14px)" }} role="banner">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setMobileOpen(true)} className="mobile-menu-btn items-center justify-center w-9 h-9 rounded-lg t-secondary text-xl flex-shrink-0 hover:opacity-80" aria-label="Open mobile menu" aria-expanded={mobileOpen}>☰</button>
              {/* Store branding (icon + name + subtitle) */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center p-1 flex-shrink-0 border t-border">
                  <img src={riceIcon} alt="" className="w-full h-full object-contain" />
                </div>
                <div className="min-w-0 hidden sm:block">
                  <div className="font-bold t-primary text-xl md:text-2xl leading-tight truncate" title={storeInfo?.name || "Agri Store"}>
                    {storeInfo?.name || "Agri Store"}
                  </div>
                  <div className="text-xs t-secondary font-medium leading-tight">Inventory Management</div>
                </div>
              </div>
            
              {/* Offline indicator in header */}
              {!isOnline && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-purple-900/30 border border-purple-700/40 flex-shrink-0" role="status" aria-live="polite">
                  <span className="text-xs" aria-hidden="true">📴</span>
                  <span className="text-xs font-semibold text-purple-400">Offline</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 md:gap-3 flex-wrap">
              {lowStockCount > 0 && <button onClick={() => setPage("items")} className="flex items-center gap-1 bg-red-900/30 text-red-400 text-xs font-bold px-2 md:px-3 py-1.5 rounded-full border border-red-800/40">⚠️ <span className="hidden md:inline">{lowStockCount} Low Stock</span><span className="md:hidden">{lowStockCount}</span></button>}
              {expiringCount > 0 && <button onClick={() => setPage("items")} className="flex items-center gap-1 bg-amber-900/30 text-amber-400 text-xs font-bold px-2 md:px-3 py-1.5 rounded-full border border-amber-800/40">🕐 <span className="hidden md:inline">{expiringCount} Expiring</span><span className="md:hidden">{expiringCount}</span></button>}
              {overdueCount > 0 && <button onClick={() => setPage("invoices")} className="flex items-center gap-1 bg-purple-900/30 text-purple-400 text-xs font-bold px-2 md:px-3 py-1.5 rounded-full border border-purple-800/40">💰 <span className="hidden md:inline">{overdueCount} Overdue</span><span className="md:hidden">{overdueCount}</span></button>}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold t-btn-grad">{currentUser?.name?.[0] || currentUser?.email?.[0]?.toUpperCase() || "U"}</div>
                <div className="text-sm font-semibold t-primary">{currentUser?.name || currentUser?.email || "User"}</div>
              </div>
            </div>
          </header>
          <main id="main-content" className="flex-1 p-3 md:p-6 t-main" role="main" tabIndex="-1">{renderPage()}</main>
        </div>
      </div>
      <UpdateNotification />
    </ToastProvider>
    </ErrorBoundary>
  );
}
