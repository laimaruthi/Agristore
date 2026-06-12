import React, { useEffect, useState, useCallback } from "react";

/**
 * UpdateNotification
 * ──────────────────
 * Listens for electron-updater events forwarded from the main process and
 * shows a non-blocking bottom-right card with progress + "Restart to install".
 *
 * Falls back silently when running in a browser (window.electronAPI absent).
 *
 * States:
 *   idle              – nothing shown
 *   checking          – spinner ("Checking for updates…")  (only after manual check)
 *   available         – "Update <v> available – downloading…"
 *   progress          – progress bar
 *   downloaded        – "Update ready – Restart now / Later"
 *   error             – red error chip (auto-dismiss after 6s)
 *   uptodate          – "You're up to date" (only after manual check, auto-dismiss)
 */
export default function UpdateNotification({ manualTrigger = 0 }) {
  const api = typeof window !== "undefined" ? window.electronAPI?.updater : null;

  const [state, setState] = useState("idle");
  const [info, setInfo] = useState(null);          // { version, releaseNotes, ... }
  const [progress, setProgress] = useState(0);     // 0..100
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("");

  // Subscribe to updater events
  useEffect(() => {
    if (!api) return undefined;

    api.getVersion?.().then(setCurrentVersion).catch(() => {});

    const offs = [
      api.on("checking",      () => { setState((s) => (manualMode ? "checking" : s)); }),
      api.on("available",     (i) => { setInfo(i); setState("available"); setDismissed(false); }),
      api.on("not-available", (i) => {
        if (manualMode) {
          setInfo(i);
          setState("uptodate");
          setDismissed(false);
          setTimeout(() => setState("idle"), 4000);
        }
      }),
      api.on("progress",      (p) => { setProgress(p?.percent || 0); setState("progress"); }),
      api.on("downloaded",    (i) => { setInfo(i); setState("downloaded"); setDismissed(false); }),
      api.on("error",         (e) => {
        setError(e?.message || "Update failed");
        setState("error");
        setTimeout(() => setState((s) => (s === "error" ? "idle" : s)), 6000);
      })
    ];
    return () => offs.forEach((off) => off && off());
  }, [api, manualMode]);

  // Manual "Check for updates" trigger from parent (e.g. Store Settings button)
  useEffect(() => {
    if (!api || manualTrigger === 0) return;
    setManualMode(true);
    setState("checking");
    setDismissed(false);
    api.check().then((r) => {
      if (r?.dev) {
        setError("Updates only work in installed (packaged) builds.");
        setState("error");
        setTimeout(() => setState("idle"), 5000);
      } else if (r && r.success === false) {
        setError(r.error || "Update check failed");
        setState("error");
        setTimeout(() => setState("idle"), 5000);
      }
    });
  }, [manualTrigger, api]);

  const handleInstall = useCallback(() => {
    if (!api) return;
    api.install();
  }, [api]);

  const handleDismiss = useCallback(() => setDismissed(true), []);

  if (!api) return null;                     // browser mode – nothing to show
  if (state === "idle" || dismissed) return null;

  // Style helpers
  const cardBase = "fixed bottom-4 right-4 z-[9999] max-w-sm w-[360px] rounded-2xl shadow-2xl border backdrop-blur p-4 text-sm";
  const palette = {
    checking:   "border-slate-700/50 bg-slate-900/95 text-slate-100",
    available:  "border-emerald-700/50 bg-emerald-900/90 text-emerald-50",
    progress:   "border-emerald-700/50 bg-emerald-900/90 text-emerald-50",
    downloaded: "border-emerald-600/60 bg-gradient-to-br from-emerald-700 to-emerald-900 text-white",
    uptodate:   "border-slate-700/50 bg-slate-900/95 text-slate-100",
    error:      "border-red-700/60 bg-red-900/90 text-red-50"
  };

  return (
    <div className={`${cardBase} ${palette[state] || palette.checking}`} role="status" aria-live="polite">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 font-bold">
          {state === "checking"   && <><Spinner /> Checking for updates…</>}
          {state === "available"  && <><span>⬇️</span> Update available</>}
          {state === "progress"   && <><span>📥</span> Downloading update…</>}
          {state === "downloaded" && <><span>✅</span> Update ready to install</>}
          {state === "uptodate"   && <><span>✅</span> You're up to date</>}
          {state === "error"      && <><span>⚠️</span> Update problem</>}
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="opacity-60 hover:opacity-100 -mt-1 -mr-1 px-2 text-lg leading-none"
        >×</button>
      </div>

      {/* Body */}
      <div className="space-y-2">
        {info?.version && state !== "uptodate" && (
          <div className="text-xs opacity-80">
            Version <b>{info.version}</b>
            {currentVersion && <> &nbsp;·&nbsp; current {currentVersion}</>}
          </div>
        )}

        {state === "uptodate" && (
          <div className="text-xs opacity-80">
            AgriStore {currentVersion} is the latest version.
          </div>
        )}

        {state === "progress" && (
          <>
            <div className="h-2 rounded-full bg-black/30 overflow-hidden">
              <div
                className="h-full bg-emerald-300 transition-all duration-200"
                style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
              />
            </div>
            <div className="text-xs opacity-80 flex justify-between">
              <span>{Math.round(progress)}%</span>
              {info?.version && <span>v{info.version}</span>}
            </div>
          </>
        )}

        {state === "available" && (
          <div className="text-xs opacity-80">
            Downloading in the background. We'll let you know when it's ready.
          </div>
        )}

        {state === "downloaded" && (
          <>
            {info?.releaseNotes && (
              <details className="text-xs bg-black/20 rounded-lg p-2 max-h-40 overflow-auto">
                <summary className="cursor-pointer font-semibold opacity-90">What's new</summary>
                <div
                  className="mt-2 prose prose-invert prose-sm max-w-none opacity-90"
                  dangerouslySetInnerHTML={{
                    __html: typeof info.releaseNotes === "string"
                      ? info.releaseNotes
                      : (Array.isArray(info.releaseNotes)
                          ? info.releaseNotes.map((n) => n.note).join("<br/>")
                          : "")
                  }}
                />
              </details>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleInstall}
                className="flex-1 px-3 py-2 rounded-xl font-bold bg-white text-emerald-900 hover:bg-emerald-50 transition"
              >
                🔄 Restart & install
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-2 rounded-xl font-medium bg-black/30 hover:bg-black/40 transition"
              >
                Later
              </button>
            </div>
            <div className="text-[10px] opacity-70 pt-1">
              Your data is safe — it will be preserved across the update.
            </div>
          </>
        )}

        {state === "error" && (
          <div className="text-xs opacity-90">{error}</div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
      aria-hidden="true"
    />
  );
}
