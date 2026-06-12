/**
 * Cloud Sync Settings Component
 * - Configure sync server
 * - View sync status
 * - Manual sync controls
 * - Backup management
 */

import React, { useState, useEffect } from 'react';
import { Modal, Btn, Input, Badge } from './UIComponents';
import {
  getCloudConfig,
  setCloudConfig,
  getSyncStatus,
  testCloudConnection,
  fullSync,
  uploadBackupToCloud,
  getCloudBackups,
  restoreFromCloud,
  startAutoSync,
  stopAutoSync,
} from '../services/cloudSync';

// ── Sync Status Badge ─────────────────────────────────────────────────────────
function SyncStatusBadge({ status }) {
  if (!status.configured) {
    return <Badge color="gray">Not Configured</Badge>;
  }
  if (!status.enabled) {
    return <Badge color="yellow">Disabled</Badge>;
  }
  if (status.pendingChanges > 0) {
    return <Badge color="blue">{status.pendingChanges} Pending</Badge>;
  }
  return <Badge color="green">Synced</Badge>;
}

// ── Cloud Sync Settings Panel ─────────────────────────────────────────────────
export function CloudSyncSettings({ onClose }) {
  const [config, setConfig] = useState({
    serverUrl: '',
    apiKey: '',
    storeId: '',
    enabled: false,
  });
  const [status, setStatus] = useState(getSyncStatus());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const saved = getCloudConfig();
    if (saved) {
      setConfig(saved);
    }
    setStatus(getSyncStatus());
  }, []);

  const handleSave = () => {
    setCloudConfig(config);
    setStatus(getSyncStatus());
    
    if (config.enabled) {
      startAutoSync(5); // Sync every 5 minutes
    } else {
      stopAutoSync();
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testCloudConnection();
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await fullSync();
      setSyncResult(result);
      setStatus(getSyncStatus());
    } catch (err) {
      setSyncResult({ success: false, error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleBackup = async () => {
    setSyncing(true);
    try {
      const result = await uploadBackupToCloud();
      if (result.success) {
        alert(`✅ Backup uploaded! ${result.recordCount} records saved.`);
      } else {
        alert(`❌ Backup failed: ${result.error}`);
      }
    } catch (err) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      const result = await getCloudBackups();
      if (result.success) {
        setBackups(result.backups);
      }
    } catch (err) {
      console.error('Failed to load backups:', err);
    } finally {
      setLoadingBackups(false);
    }
  };

  const handleRestore = async (backupId) => {
    if (!confirm('⚠️ This will overwrite all local data. Continue?')) return;
    
    setSyncing(true);
    try {
      const result = await restoreFromCloud(backupId);
      if (result.success) {
        alert(`✅ Restored ${result.recordCount} records. Reloading app...`);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-emerald-300">☁️ Cloud Sync</h2>
          <p className="text-sm text-emerald-500/60">
            Sync data across devices and backup to cloud
          </p>
        </div>
        <SyncStatusBadge status={status} />
      </div>

      {/* Enable Toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
        <div>
          <p className="font-semibold text-emerald-200">Enable Cloud Sync</p>
          <p className="text-xs text-emerald-500/60">
            Automatically sync changes to your server
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-emerald-900/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
        </label>
      </div>

      {/* Server Configuration */}
      <div className="space-y-4">
        <Input
          label="Server URL"
          value={config.serverUrl}
          onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
          placeholder="https://your-server.com/api"
        />
        
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="API Key"
            type="password"
            value={config.apiKey}
            onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            placeholder="Your API key"
          />
          <Input
            label="Store ID"
            value={config.storeId}
            onChange={(e) => setConfig({ ...config, storeId: e.target.value })}
            placeholder="unique-store-id"
          />
        </div>
      </div>

      {/* Test Connection */}
      {config.serverUrl && (
        <div className="flex items-center gap-3">
          <Btn 
            variant="secondary" 
            onClick={handleTest} 
            disabled={testing}
          >
            {testing ? '🔄 Testing...' : '🔌 Test Connection'}
          </Btn>
          {testResult && (
            <span className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {testResult.success ? '✅ Connected!' : `❌ ${testResult.error}`}
            </span>
          )}
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Btn onClick={handleSave}>💾 Save Settings</Btn>
      </div>

      {/* Sync Status */}
      {status.configured && (
        <div className="p-4 rounded-xl bg-slate-900/50 border border-emerald-700/30 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-300">Sync Status</p>
              <p className="text-xs text-emerald-500/60">
                Last sync: {status.lastSync ? new Date(status.lastSync).toLocaleString() : 'Never'}
              </p>
              {status.pendingChanges > 0 && (
                <p className="text-xs text-amber-400">
                  {status.pendingChanges} changes waiting to sync
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Btn 
                size="sm" 
                onClick={handleSync} 
                disabled={syncing}
              >
                {syncing ? '🔄' : '🔄'} Sync Now
              </Btn>
              <Btn 
                size="sm" 
                variant="secondary"
                onClick={handleBackup}
                disabled={syncing}
              >
                ☁️ Backup
              </Btn>
            </div>
          </div>

          {syncResult && (
            <div className={`p-3 rounded-lg text-sm ${
              syncResult.success 
                ? 'bg-green-900/30 text-green-400' 
                : 'bg-red-900/30 text-red-400'
            }`}>
              {syncResult.success ? (
                <>
                  ✅ Sync complete! 
                  Pushed: {syncResult.push?.synced || 0}, 
                  Pulled: {syncResult.pull?.applied || 0}
                </>
              ) : (
                `❌ Sync failed: ${syncResult.error || 'Unknown error'}`
              )}
            </div>
          )}
        </div>
      )}

      {/* Cloud Backups */}
      {status.configured && (
        <div className="space-y-3">
          <button
            onClick={() => {
              setShowAdvanced(!showAdvanced);
              if (!showAdvanced) loadBackups();
            }}
            className="text-sm font-semibold text-blue-400 hover:text-blue-300"
          >
            {showAdvanced ? '▼' : '▶'} Cloud Backups
          </button>

          {showAdvanced && (
            <div className="p-4 rounded-xl bg-blue-900/10 border border-blue-700/30">
              {loadingBackups ? (
                <p className="text-sm text-blue-400/60">Loading backups...</p>
              ) : backups.length === 0 ? (
                <p className="text-sm text-blue-400/60">No cloud backups found</p>
              ) : (
                <div className="space-y-2">
                  {backups.slice(0, 5).map((backup, idx) => (
                    <div 
                      key={backup.id || idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-blue-900/20"
                    >
                      <div>
                        <p className="text-sm text-blue-300">
                          {new Date(backup.timestamp).toLocaleString()}
                        </p>
                        <p className="text-xs text-blue-400/60">
                          {backup.recordCount || '?'} records
                        </p>
                      </div>
                      <Btn 
                        size="sm" 
                        variant="secondary"
                        onClick={() => handleRestore(backup.id)}
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
      )}

      {/* Help Text */}
      <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700/30">
        <h4 className="text-sm font-semibold text-slate-300 mb-2">ℹ️ Setup Guide</h4>
        <ul className="text-xs text-slate-400 space-y-1">
          <li>• You need your own sync server to use this feature</li>
          <li>• Works with any REST API backend (Node.js, Firebase, etc.)</li>
          <li>• Data is encrypted in transit (HTTPS required)</li>
          <li>• Sync happens automatically every 5 minutes when enabled</li>
          <li>• Offline changes are queued and synced when online</li>
        </ul>
      </div>

      {/* Close Button */}
      {onClose && (
        <div className="flex justify-end pt-4 border-t border-emerald-700/30">
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
        </div>
      )}
    </div>
  );
}

// ── Sync Status Indicator (for header/sidebar) ───────────────────────────────
export function SyncIndicator({ onClick }) {
  const [status, setStatus] = useState(getSyncStatus());

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(getSyncStatus());
    }, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  if (!status.configured) return null;

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold transition-colors ${
        status.pendingChanges > 0
          ? 'bg-amber-900/30 text-amber-400 border border-amber-700/40'
          : status.enabled
          ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/40'
          : 'bg-slate-900/30 text-slate-400 border border-slate-700/40'
      }`}
      title={status.lastSync ? `Last sync: ${new Date(status.lastSync).toLocaleString()}` : 'Click to configure'}
    >
      <span className={`w-2 h-2 rounded-full ${
        status.pendingChanges > 0 ? 'bg-amber-400 animate-pulse' : 
        status.enabled ? 'bg-emerald-400' : 'bg-slate-500'
      }`} />
      {status.pendingChanges > 0 ? `${status.pendingChanges} pending` : status.enabled ? 'Synced' : 'Offline'}
    </button>
  );
}

export default CloudSyncSettings;
