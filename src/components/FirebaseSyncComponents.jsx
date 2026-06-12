/**
 * Firebase Sync Settings Component
 * Easy setup wizard for Firebase cloud sync
 */

import React, { useState, useEffect } from 'react';
import { Modal, Btn, Input, Badge } from './UIComponents';
import {
  getFirebaseConfig,
  setFirebaseConfig,
  getFirebaseSyncStatus,
  testFirebaseConnection,
  syncWithFirebase,
  uploadToFirebase,
  downloadFromFirebase,
  createFirebaseBackup,
  listFirebaseBackups,
  restoreFirebaseBackup,
  startAutoSync,
  stopAutoSync,
  startRealtimeSync,
  stopRealtimeSync,
} from '../services/firebaseSync';

// ── Firebase Setup Wizard ─────────────────────────────────────────────────────
export function FirebaseSyncSettings({ onClose }) {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState({
    apiKey: '',
    authDomain: '',
    databaseURL: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    storeId: '',
    enabled: false,
    realtimeSync: false,
  });
  const [status, setStatus] = useState(getFirebaseSyncStatus());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [backups, setBackups] = useState([]);
  const [showBackups, setShowBackups] = useState(false);

  useEffect(() => {
    const saved = getFirebaseConfig();
    if (saved) {
      setConfig({ ...config, ...saved });
      if (saved.apiKey) setStep(3); // Skip to status if already configured
    }
    loadBackups();
  }, []);

  const loadBackups = async () => {
    const result = await listFirebaseBackups();
    if (result.success) {
      setBackups(result.backups);
    }
  };

  const handleSave = () => {
    setFirebaseConfig(config);
    setStatus(getFirebaseSyncStatus());
    
    if (config.enabled) {
      startAutoSync(5);
      if (config.realtimeSync) {
        startRealtimeSync(() => window.location.reload());
      }
    } else {
      stopAutoSync();
      stopRealtimeSync();
    }
    
    setStep(3);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    
    // Save config first
    setFirebaseConfig(config);
    
    try {
      const result = await testFirebaseConnection();
      setTestResult(result);
      if (result.success) {
        setStep(3);
      }
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async (direction) => {
    setSyncing(true);
    setSyncResult(null);
    
    try {
      let result;
      if (direction === 'upload') {
        result = await uploadToFirebase();
      } else if (direction === 'download') {
        result = await downloadFromFirebase();
      } else {
        result = await syncWithFirebase();
      }
      setSyncResult(result);
      setStatus(getFirebaseSyncStatus());
    } catch (err) {
      setSyncResult({ success: false, error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleBackup = async () => {
    setSyncing(true);
    try {
      const result = await createFirebaseBackup();
      if (result.success) {
        alert(`✅ Backup created: ${result.backupId}`);
        loadBackups();
      } else {
        alert(`❌ Backup failed: ${result.error}`);
      }
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleRestore = async (backupId) => {
    if (!confirm('⚠️ This will REPLACE all local data with backup data. Continue?')) return;
    
    setSyncing(true);
    try {
      const result = await restoreFirebaseBackup(backupId);
      if (result.success) {
        alert(`✅ Restored ${result.recordCount} records. Reloading...`);
        window.location.reload();
      } else {
        alert(`❌ Restore failed: ${result.error}`);
      }
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">🔥</span>
        <div>
          <h2 className="text-lg font-bold text-emerald-300">Firebase Cloud Sync</h2>
          <p className="text-sm text-emerald-500/60">
            Cloud backup & multi-device sync
          </p>
        </div>
      </div>

      {/* Step 1: Introduction */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Important Notice */}
          <div className="p-4 rounded-xl bg-amber-900/30 border border-amber-500/50">
            <h3 className="font-semibold text-amber-300 mb-2">🔒 Your Own Private Cloud</h3>
            <p className="text-sm text-amber-200/80">
              Your data is 100% private and secure. Only YOU can access it.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
            <h3 className="font-semibold text-emerald-300 mb-2">✨ Features:</h3>
            <ul className="text-sm text-emerald-200/80 space-y-1">
              <li>• ☁️ Cloud backup for your store data</li>
              <li>• 📱 Sync between multiple computers</li>
              <li>• 💾 Backup history & restore points</li>
            </ul>
          </div>

          <div className="p-3 rounded-lg bg-blue-900/20 border border-blue-700/30 text-sm text-blue-300">
            � Contact your software provider to get Firebase configuration values.
          </div>
          
          <div className="flex justify-end">
            <Btn onClick={() => setStep(2)}>
              Enter Configuration →
            </Btn>
          </div>
        </div>
      )}

      {/* Step 2: Configuration */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-blue-900/30 border border-blue-600/30">
            <p className="text-sm text-blue-300">
              📋 Enter the Firebase configuration values provided by your software provider
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="API Key *"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="AIzaSy..."
            />
            <Input
              label="Project ID *"
              value={config.projectId}
              onChange={(e) => setConfig({ ...config, projectId: e.target.value })}
              placeholder="my-project-123"
            />
          </div>
          
          <Input
            label="Database URL *"
            value={config.databaseURL}
            onChange={(e) => setConfig({ ...config, databaseURL: e.target.value })}
            placeholder="https://my-project-123-default-rtdb.firebaseio.com"
          />
          
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Auth Domain (optional)"
              value={config.authDomain}
              onChange={(e) => setConfig({ ...config, authDomain: e.target.value })}
              placeholder="my-project-123.firebaseapp.com"
            />
            <Input
              label="App ID (optional)"
              value={config.appId}
              onChange={(e) => setConfig({ ...config, appId: e.target.value })}
              placeholder="1:123456:web:abc123"
            />
          </div>
          
          <div className="p-4 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
            <Input
              label="Your Store Name"
              value={config.storeId}
              onChange={(e) => setConfig({ ...config, storeId: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
              placeholder="my-store-name"
            />
            <p className="text-xs text-emerald-400/60 mt-1">
              Enter your store name (use hyphens instead of spaces).
            </p>
          </div>
          
          {/* Test Result */}
          {testResult && (
            <div className={`p-3 rounded-lg text-sm ${
              testResult.success ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
            }`}>
              {testResult.success ? '✅ Connected to Firebase!' : `❌ ${testResult.error}`}
            </div>
          )}
          
          <div className="flex justify-between">
            <Btn variant="secondary" onClick={() => setStep(1)}>← Back</Btn>
            <div className="flex gap-2">
              <Btn 
                variant="secondary" 
                onClick={handleTest}
                disabled={testing || !config.apiKey || !config.databaseURL || !config.storeId}
              >
                {testing ? '🔄 Testing...' : '🔌 Test Connection'}
              </Btn>
              <Btn 
                onClick={() => {
                  setConfig({ ...config, enabled: true });
                  handleSave();
                }}
                disabled={!config.apiKey || !config.databaseURL || !config.storeId}
              >
                Save & Enable →
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Status & Controls */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Status Card */}
          <div className="p-4 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-emerald-300">Sync Status</span>
              <Badge color={config.enabled ? 'green' : 'gray'}>
                {config.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-emerald-500/60">Store ID</p>
                <p className="text-emerald-200 font-mono">{config.storeId || '—'}</p>
              </div>
              <div>
                <p className="text-emerald-500/60">Last Sync</p>
                <p className="text-emerald-200">
                  {status.lastSync ? new Date(status.lastSync).toLocaleString() : 'Never'}
                </p>
              </div>
            </div>
          </div>

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-emerald-700/30">
            <div>
              <p className="font-semibold text-emerald-200">Auto Sync</p>
              <p className="text-xs text-emerald-500/60">Sync every 5 minutes</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => {
                  const newConfig = { ...config, enabled: e.target.checked };
                  setConfig(newConfig);
                  setFirebaseConfig(newConfig);
                  if (e.target.checked) {
                    startAutoSync(5);
                  } else {
                    stopAutoSync();
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Sync Buttons */}
          <div className="flex gap-2 flex-wrap">
            <Btn onClick={() => handleSync('upload')} disabled={syncing}>
              {syncing ? '🔄' : '⬆️'} Upload to Cloud
            </Btn>
            <Btn variant="secondary" onClick={() => handleSync('download')} disabled={syncing}>
              {syncing ? '🔄' : '⬇️'} Download from Cloud
            </Btn>
            <Btn variant="secondary" onClick={handleBackup} disabled={syncing}>
              💾 Create Backup
            </Btn>
          </div>

          {/* Sync Result */}
          {syncResult && (
            <div className={`p-3 rounded-lg text-sm ${
              syncResult.success ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
            }`}>
              {syncResult.success 
                ? `✅ Success! ${syncResult.recordCount || syncResult.uploaded || 0} records processed.`
                : `❌ ${syncResult.error}`
              }
            </div>
          )}

          {/* Backups */}
          <div className="space-y-2">
            <button
              onClick={() => {
                setShowBackups(!showBackups);
                if (!showBackups) loadBackups();
              }}
              className="text-sm font-semibold text-blue-400 hover:text-blue-300"
            >
              {showBackups ? '▼' : '▶'} Cloud Backups ({backups.length})
            </button>
            
            {showBackups && (
              <div className="p-4 rounded-xl bg-blue-900/10 border border-blue-700/30 max-h-48 overflow-y-auto">
                {backups.length === 0 ? (
                  <p className="text-sm text-blue-400/60">No backups yet. Create one above!</p>
                ) : (
                  <div className="space-y-2">
                    {backups.map((backup) => (
                      <div 
                        key={backup.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-blue-900/20"
                      >
                        <div>
                          <p className="text-sm text-blue-300">{backup.id}</p>
                          <p className="text-xs text-blue-400/60">
                            {new Date(backup.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <Btn 
                          size="sm" 
                          variant="secondary"
                          onClick={() => handleRestore(backup.id)}
                          disabled={syncing}
                        >
                          Restore
                        </Btn>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Edit Config Button */}
          <div className="pt-4 border-t border-emerald-700/30 flex justify-between">
            <Btn variant="secondary" size="sm" onClick={() => setStep(2)}>
              ⚙️ Edit Config
            </Btn>
            {onClose && (
              <Btn variant="secondary" onClick={onClose}>Close</Btn>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sync Status Indicator (for header) ────────────────────────────────────────
export function FirebaseSyncIndicator({ onClick }) {
  const [status, setStatus] = useState(getFirebaseSyncStatus());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(getFirebaseSyncStatus());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  if (!status.configured) return null;

  const timeSinceSync = status.lastSync 
    ? Math.floor((Date.now() - new Date(status.lastSync).getTime()) / 60000)
    : null;

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold transition-colors ${
        status.enabled
          ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/40'
          : 'bg-slate-900/30 text-slate-400 border border-slate-700/40'
      }`}
      title={status.lastSync ? `Last sync: ${new Date(status.lastSync).toLocaleString()}` : 'Click to configure'}
    >
      <span className="text-base">🔥</span>
      {status.enabled ? (
        timeSinceSync !== null ? `${timeSinceSync}m ago` : 'Synced'
      ) : 'Off'}
    </button>
  );
}

export default FirebaseSyncSettings;
