// ── App Updates Panel ─────────────────────────────────────────────────────────
// Self-contained UI for checking, downloading, and installing app updates via
// electron-updater. Subscribes to all updater events from the main process and
// reflects them in a single state machine.

import { useState, useEffect } from 'react';

const STATES = {
  IDLE: 'idle',
  CHECKING: 'checking',
  UP_TO_DATE: 'up-to-date',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  ERROR: 'error',
};

export default function UpdateSettings() {
  const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;
  const isElectron = !!electronAPI?.updater;

  const [currentVersion, setCurrentVersion] = useState('—');
  const [state, setState] = useState(STATES.IDLE);
  const [availableVersion, setAvailableVersion] = useState(null);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [lastCheckedAt, setLastCheckedAt] = useState(null);

  useEffect(() => {
    if (!isElectron) return undefined;

    electronAPI.updater.getVersion().then((v) => setCurrentVersion(v || '—'));

    const offs = [
      electronAPI.updater.on('checking', () => {
        setState(STATES.CHECKING);
        setErrorMsg('');
        setLastCheckedAt(new Date());
      }),
      electronAPI.updater.on('available', (info) => {
        setState(STATES.DOWNLOADING);
        setAvailableVersion(info?.version || null);
        setDownloadPercent(0);
      }),
      electronAPI.updater.on('not-available', () => {
        setState(STATES.UP_TO_DATE);
      }),
      electronAPI.updater.on('progress', (p) => {
        setDownloadPercent(Math.round(p?.percent || 0));
      }),
      electronAPI.updater.on('downloaded', (info) => {
        setState(STATES.DOWNLOADED);
        setAvailableVersion(info?.version || null);
        setDownloadPercent(100);
      }),
      electronAPI.updater.on('error', (e) => {
        setState(STATES.ERROR);
        setErrorMsg((e && e.message) || 'Update check failed');
      }),
    ];

    return () => offs.forEach((fn) => typeof fn === 'function' && fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkForUpdates = async () => {
    if (!isElectron) return;
    setState(STATES.CHECKING);
    setErrorMsg('');
    try {
      const r = await electronAPI.updater.check();
      if (r && !r.success) {
        if (r.dev) {
          setState(STATES.IDLE);
          setErrorMsg('Auto-update only works in the installed app, not in dev mode.');
        } else {
          setState(STATES.ERROR);
          setErrorMsg(r.error || 'Update check failed');
        }
      }
      // success path is signaled via events (available / not-available)
    } catch (e) {
      setState(STATES.ERROR);
      setErrorMsg(e.message);
    }
  };

  const installNow = async () => {
    if (!isElectron) return;
    if (!window.confirm('Restart now to install the update?\n\nYour data is preserved — only the app code is replaced.')) return;
    try {
      await electronAPI.updater.install();
    } catch (e) {
      setState(STATES.ERROR);
      setErrorMsg(e.message);
    }
  };

  if (!isElectron) {
    return (
      <div className="card p-5">
        <h2 className="font-bold text-emerald-300 mb-1">🔄 App Updates</h2>
        <p className="text-xs text-emerald-500/50 mt-2">
          Auto-update is only available in the installed AgriStore app (Windows).
        </p>
      </div>
    );
  }

  const busy = state === STATES.CHECKING || state === STATES.DOWNLOADING;

  return (
    <div className="card p-5 space-y-3">
      <div>
        <h2 className="font-bold text-emerald-300 mb-1">🔄 App Updates</h2>
        <p className="text-xs text-emerald-500/70">
          Current version:{' '}
          <span className="font-mono text-emerald-300">v{currentVersion}</span>
          {availableVersion && state !== STATES.UP_TO_DATE && (
            <>
              {' '}→{' '}
              <span className="font-mono text-amber-300">v{availableVersion}</span>
            </>
          )}
        </p>
      </div>

      {/* Status block */}
      {state === STATES.IDLE && (
        <p className="text-sm text-emerald-200/70">
          Click "Check for Updates" to see if a newer version is available.
        </p>
      )}

      {state === STATES.CHECKING && (
        <p className="text-sm text-amber-300 flex items-center gap-2">
          <span className="animate-spin">⏳</span> Checking for updates...
        </p>
      )}

      {state === STATES.UP_TO_DATE && (
        <div className="p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
          <p className="text-sm text-emerald-300">✓ You're on the latest version.</p>
          {lastCheckedAt && (
            <p className="text-[11px] text-emerald-500/60 mt-0.5">
              Last checked: {lastCheckedAt.toLocaleTimeString()}
            </p>
          )}
        </div>
      )}

      {state === STATES.DOWNLOADING && (
        <div className="space-y-2 p-3 rounded-xl bg-amber-900/20 border border-amber-700/30">
          <p className="text-sm text-amber-300">
            ⬇️ Downloading update{availableVersion ? ` v${availableVersion}` : ''}...
          </p>
          <div className="h-2 rounded-full bg-emerald-900/40 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${downloadPercent}%` }}
            />
          </div>
          <p className="text-xs text-emerald-300/80 font-mono">{downloadPercent}%</p>
        </div>
      )}

      {state === STATES.DOWNLOADED && (
        <div className="p-3 rounded-xl bg-emerald-900/30 border border-emerald-600/40">
          <p className="text-sm font-semibold text-emerald-200">
            ✅ Update v{availableVersion} ready to install
          </p>
          <p className="text-xs text-emerald-400/80 mt-1">
            Click "Install & Restart" below. The app will close, apply the update, then reopen.
            Your data stays safe.
          </p>
        </div>
      )}

      {state === STATES.ERROR && (
        <div className="p-3 rounded-xl bg-red-900/20 border border-red-700/30">
          <p className="text-sm text-red-400">⚠️ {errorMsg}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={checkForUpdates}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === STATES.CHECKING ? 'Checking...' : 'Check for Updates'}
        </button>

        {state === STATES.DOWNLOADED && (
          <button
            onClick={installNow}
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold"
          >
            🚀 Install & Restart
          </button>
        )}
      </div>

      <p className="text-[11px] text-emerald-500/40">
        Updates are also checked automatically in the background every 4 hours.
      </p>
    </div>
  );
}
