// ── Auto-backup module ────────────────────────────────────────────────────────
// Creates timestamped SQLite backups under <userData>/auto-backups/.
// Triggered on:
//   • App start (if no backup in last 24h)
//   • Nightly at 02:00 local time
//   • App quit (best-effort, before SQLite closes)
//
// Keeps the last MAX_BACKUPS files and prunes older ones automatically.

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const MAX_BACKUPS = 14;          // ~2 weeks of nightly backups
const NIGHTLY_HOUR = 2;          // 02:00 local time
const MIN_GAP_MS = 12 * 3600e3;  // don't run again if <12h since last
const META_FILE = 'auto-backup-meta.json';

let sqliteDB = null;
let nightlyTimer = null;

function getBackupDir() {
  const dir = path.join(app.getPath('userData'), 'auto-backups');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* ignore */ }
  return dir;
}

function getMetaPath() {
  return path.join(getBackupDir(), META_FILE);
}

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(getMetaPath(), 'utf8'));
  } catch {
    return { lastBackupAt: 0, history: [] };
  }
}

function writeMeta(meta) {
  try {
    fs.writeFileSync(getMetaPath(), JSON.stringify(meta, null, 2), 'utf8');
  } catch (e) {
    console.warn('[auto-backup] could not write meta:', e.message);
  }
}

function listBackups() {
  const dir = getBackupDir();
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.db'));
  } catch (_) { return []; }

  return files
    .map((f) => {
      const full = path.join(dir, f);
      let stat = null;
      try { stat = fs.statSync(full); } catch (_) { return null; }
      return {
        name: f,
        path: full,
        size: stat ? stat.size : 0,
        createdAt: stat ? stat.mtimeMs : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function pruneOld() {
  const list = listBackups();
  if (list.length <= MAX_BACKUPS) return;
  const toDelete = list.slice(MAX_BACKUPS);
  for (const f of toDelete) {
    try {
      fs.unlinkSync(f.path);
      console.log('[auto-backup] pruned', f.name);
    } catch (e) {
      console.warn('[auto-backup] could not prune', f.name, e.message);
    }
  }
}

function performBackup(reason = 'scheduled') {
  if (!sqliteDB || typeof sqliteDB.createBackup !== 'function') {
    console.warn('[auto-backup] SQLite module not available — skip');
    return { success: false, reason: 'no-db' };
  }

  const dir = getBackupDir();
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19); // 2026-04-25_22-48-00
  const filename = `agristore_${ts}_${reason}.db`;
  const fullPath = path.join(dir, filename);

  try {
    const result = sqliteDB.createBackup(fullPath);
    if (!result || !result.success) {
      throw new Error((result && result.error) || 'createBackup returned non-success');
    }
    let size = 0;
    try { size = fs.statSync(fullPath).size; } catch (_) { /* ignore */ }

    const meta = readMeta();
    meta.lastBackupAt = Date.now();
    meta.history.unshift({ name: filename, path: fullPath, size, createdAt: Date.now(), reason });
    meta.history = meta.history.slice(0, 100);
    writeMeta(meta);

    pruneOld();
    console.log(`[auto-backup] ✅ ${reason}:`, filename, `(${(size / 1024).toFixed(1)} KB)`);
    return { success: true, path: fullPath, size };
  } catch (e) {
    console.error('[auto-backup] failed:', e.message);
    return { success: false, error: e.message };
  }
}

function msUntilNext0200() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(NIGHTLY_HOUR, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleNightly() {
  if (nightlyTimer) clearTimeout(nightlyTimer);
  const ms = msUntilNext0200();
  console.log(
    `[auto-backup] next nightly run in ${Math.round(ms / 60000)} min @ 02:00 local`
  );
  nightlyTimer = setTimeout(() => {
    performBackup('nightly');
    // schedule the next one in 24h
    nightlyTimer = setTimeout(function loop() {
      performBackup('nightly');
      nightlyTimer = setTimeout(loop, 24 * 3600e3);
    }, 24 * 3600e3);
  }, ms);
}

// Public init — call after sqliteDB is initialised
function init(sqliteModule) {
  sqliteDB = sqliteModule;

  // Run a startup backup if more than MIN_GAP_MS since the last one
  const meta = readMeta();
  const gap = Date.now() - (meta.lastBackupAt || 0);
  if (gap > MIN_GAP_MS) {
    setTimeout(() => performBackup('startup'), 5000);
  } else {
    console.log(
      `[auto-backup] last backup ${Math.round(gap / 3600e3)}h ago — skip startup`
    );
  }

  scheduleNightly();
}

// Public — run on quit (synchronous-ish, best-effort)
function backupOnQuit() {
  return performBackup('quit');
}

module.exports = {
  init,
  backupOnQuit,
  listBackups,
  performBackup,
  getBackupDir,
};
