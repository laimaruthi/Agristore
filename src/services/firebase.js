// ── Firebase Service ─────────────────────────────────────────────────────────
// Firebase initialization and Firestore hooks

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot, enableIndexedDbPersistence } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { useState, useEffect, useCallback, useRef } from "react";

// ── Environment Configuration ─────────────────────────────────────────────────
// Credentials come from the .env file (VITE_* vars) only — never hardcoded.
const ENV = {
  FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY || "",
  FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  FIREBASE_DATABASE_URL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "",
  FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

// ── Firebase Configuration ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: ENV.FIREBASE_API_KEY,
  authDomain: ENV.FIREBASE_AUTH_DOMAIN,
  databaseURL: ENV.FIREBASE_DATABASE_URL,
  projectId: ENV.FIREBASE_PROJECT_ID,
  storageBucket: ENV.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.FIREBASE_MESSAGING_SENDER_ID,
  appId: ENV.FIREBASE_APP_ID,
};

// ── Firebase Initialization ───────────────────────────────────────────────────
export const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";
export const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;
export const db = isFirebaseConfigured ? getFirestore(firebaseApp) : null;
export const auth = isFirebaseConfigured ? getAuth(firebaseApp) : null;

// ── Offline Persistence ───────────────────────────────────────────────────────
// Note: enableIndexedDbPersistence must be called before any other Firestore operations
// and can only be called once per Firestore instance
if (db) {
  enableIndexedDbPersistence(db)
    .then(() => {
      console.log("✅ Firestore offline persistence enabled");
    })
    .catch((err) => {
      if (err.code === "failed-precondition") {
        console.warn("⚠️ Multiple tabs open - offline mode limited");
      } else if (err.code === "unimplemented") {
        console.warn("⚠️ Browser doesn't support offline persistence");
      } else if (err.message?.includes("already") || err.code === "already-started") {
        // Already enabled - this is fine (happens with HMR or multiple imports)
        console.log("✅ Firestore offline persistence already enabled");
      } else {
        console.warn("⚠️ Offline persistence warning:", err.message);
      }
    });
}

// ── Offline State Management ──────────────────────────────────────────────────
const OFFLINE_CHANGES_KEY = "agristore_offline_changes_count";

export function getPendingChangesCount() {
  try {
    return parseInt(localStorage.getItem(OFFLINE_CHANGES_KEY) || "0", 10);
  } catch {
    return 0;
  }
}

export function incrementPendingChanges() {
  const count = getPendingChangesCount() + 1;
  localStorage.setItem(OFFLINE_CHANGES_KEY, String(count));
  return count;
}

export function resetPendingChanges() {
  localStorage.setItem(OFFLINE_CHANGES_KEY, "0");
}

// ── Data Sanitization ─────────────────────────────────────────────────────────
export function sanitizeForFirestore(val) {
  if (val === undefined || val === null) return null;
  if (Array.isArray(val)) return val.map(sanitizeForFirestore);
  if (typeof val === "object" && val !== null) {
    const clean = {};
    for (const [k, v] of Object.entries(val)) {
      if (v === undefined) continue;
      if ((k === "image" || k === "bgImage") && typeof v === "string" && v.startsWith("data:")) {
        clean[k] = "";
        continue;
      }
      clean[k] = sanitizeForFirestore(v);
    }
    return clean;
  }
  if (typeof val === "number" && isNaN(val)) return 0;
  if (typeof val === "string") {
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim()
      .slice(0, 10000);
  }
  return val;
}

// ── Network Status Hook ───────────────────────────────────────────────────────
export function useNetworkStatus() {
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

// ── Firestore Hook ────────────────────────────────────────────────────────────
export function useFirestore(key, defaultValue, enabled = true) {
  const valueRef = useRef(defaultValue);
  const docRef = useRef(null);
  const [synced, setSynced] = useState(false);
  const hasReceivedData = useRef(false);
  const initialLoadComplete = useRef(false);

  const [value, setValueState] = useState(() => {
    valueRef.current = defaultValue;
    return defaultValue;
  });

  useEffect(() => {
    if (!isFirebaseConfigured || !enabled) {
      setSynced(true);
      return;
    }
    setSynced(false);
    hasReceivedData.current = false;
    initialLoadComplete.current = false;
    docRef.current = doc(db, "agristore", key);
    
    const unsub = onSnapshot(
      docRef.current, 
      (snap) => {
        if (snap.exists()) {
          const remote = snap.data().value ?? defaultValue;
          
          if (hasReceivedData.current && Array.isArray(remote) && remote.length === 0) {
            const prevLength = Array.isArray(valueRef.current) ? valueRef.current.length : 0;
            if (prevLength > 3) {
              console.warn(`🛡️ PROTECTED: Firestore returned empty ${key}`);
              setSynced(true);
              return;
            }
          }
          
          if (hasReceivedData.current && Array.isArray(remote) && Array.isArray(valueRef.current)) {
            const prevLen = valueRef.current.length;
            const newLen = remote.length;
            if (prevLen > 10 && newLen < prevLen * 0.2) {
              console.warn(`🛡️ PROTECTED: ${key} data drop detected`);
              setSynced(true);
              return;
            }
          }
          
          hasReceivedData.current = true;
          initialLoadComplete.current = true;
          valueRef.current = remote;
          setValueState(remote);
        } else {
          if (!hasReceivedData.current) {
            setDoc(docRef.current, { value: sanitizeForFirestore(valueRef.current) })
              .catch((err) => console.error(`Failed to create ${key}:`, err));
          }
          initialLoadComplete.current = true;
        }
        setSynced(true);
      },
      (err) => {
        if (err.code === "permission-denied") {
          console.warn(`[firestore] permission-denied on ${key} — working in local-only mode`);
        } else {
          console.error(`Firestore ${key} error:`, err);
        }
        setSynced(true);
        initialLoadComplete.current = true;
      }
    );
    
    return unsub;
  }, [key, enabled]); // eslint-disable-line

  const setValue = useCallback((newVal) => {
    const resolved = typeof newVal === "function" ? newVal(valueRef.current) : newVal;
    
    if (Array.isArray(resolved) && resolved.length === 0) {
      const prevLength = Array.isArray(valueRef.current) ? valueRef.current.length : 0;
      if (prevLength > 3) {
        console.error(`🛡️ BLOCKED: Empty ${key} write`);
        alert(`⚠️ Data protection: Cannot save empty ${key}`);
        return;
      }
    }
    
    if (Array.isArray(resolved) && Array.isArray(valueRef.current)) {
      const prevLen = valueRef.current.length;
      const newLen = resolved.length;
      if (prevLen > 10 && newLen < prevLen * 0.2) {
        console.error(`🛡️ BLOCKED: ${key} data loss`);
        alert(`⚠️ Data protection: This would delete most of your ${key}`);
        return;
      }
    }
    
    valueRef.current = resolved;
    setValueState(resolved);
    
    if (isFirebaseConfigured && docRef.current) {
      if (!navigator.onLine) {
        incrementPendingChanges();
      }
      
      setDoc(docRef.current, { value: sanitizeForFirestore(resolved) })
        .catch((err) => {
          if (err.code === "permission-denied") {
            console.warn(`[firestore] permission-denied writing ${key} — working in local-only mode`);
          } else {
            console.error(`Failed to write ${key}:`, err);
          }
        });
    }
  }, [key]);

  return [value, setValue, synced];
}

// ── Offline Mode Hook ─────────────────────────────────────────────────────────
export function useOfflineMode() {
  const isOnline = useNetworkStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(getPendingChangesCount());

  useEffect(() => {
    const interval = setInterval(() => {
      setPendingChanges(getPendingChangesCount());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isOnline && pendingChanges > 0) {
      setIsSyncing(true);
      setTimeout(() => {
        resetPendingChanges();
        setPendingChanges(0);
        setIsSyncing(false);
      }, 2000);
    }
  }, [isOnline, pendingChanges]);

  return { isOnline, isSyncing, pendingChanges };
}

// ── Image Compression ─────────────────────────────────────────────────────────
export function compressImage(file, maxWidth = 200, quality = 0.6) {
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

// ── Auth Functions ────────────────────────────────────────────────────────────
export { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged };

export default {
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
};
