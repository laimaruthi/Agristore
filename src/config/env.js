// ── Environment Variables Configuration ──────────────────────────────────────
// Use environment variables for sensitive credentials
// Create a .env file with VITE_GOOGLE_CLIENT_ID, VITE_FIREBASE_API_KEY, etc.

export const ENV = {
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

// Google Drive API Config
export const GOOGLE_DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
export const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.file";

// Rate Limiting & Backup Protection
export const GDRIVE_RATE_LIMIT = {
  MIN_BACKUP_INTERVAL: 60000,        // Minimum 60 seconds between backups
  MAX_BACKUPS_PER_HOUR: 30,          // Maximum 30 backups per hour
  MAX_BACKUPS_PER_DAY: 200,          // Maximum 200 backups per day
  AUTO_BACKUP_DELAY: 30000,          // Wait 30 seconds after last change
  EXPONENTIAL_BACKOFF_BASE: 2000,    // Start with 2 second delay on errors
  MAX_RETRY_DELAY: 300000,           // Max 5 minutes between retries
  COOLDOWN_ON_ERROR: 60000,          // 1 minute cooldown after any error
};

// App Constants
export const MAX_ACTIVITY_LOG_SIZE = 1000;
export const ACTION_COOLDOWN = 1000; // 1 second cooldown between same actions
export const PAGINATION_PAGE_SIZE = 25;
