# AgriStore — Full Project Documentation

**Version:** 1.1.3  
**Type:** Offline-first Inventory + Billing Desktop App  
**Stack:** React 18 · Vite 5 · Tailwind 3 · Electron 29 · better-sqlite3 · Firebase (optional sync)  
**Target Platforms:** Windows (NSIS + portable EXE), with macOS/Linux dev support

---

## 1. Overview

AgriStore is a desktop point-of-sale & inventory management application targeted at small agri-input retail stores (seed/fertilizer/pesticide shops). It runs **fully offline** with optional cloud sync, license-key activation, and automated local backups.

### Key Capabilities
- Item / batch / expiry management with FIFO cost tracking
- Customer ledger with credit, partial payments, quick pay
- GST-aware invoicing (cash/credit), delivery notes, recurring invoices
- Purchase entry with supplier ledger
- Other-expense tracker
- Profit & Loss reports, item-wise sales, customer aging
- Multi-user with roles (admin / cashier)
- License-gated activation (offline-verifiable keys)
- Auto-backup to disk + optional Firebase / Google Drive sync
- Crash recovery snapshots

---

## 2. Repository Layout

```
uzhavan_v34 updated/
├── electron/                     # Electron main process (Node side)
│   ├── main.cjs                  # App bootstrap, window, IPC, updater
│   ├── preload.cjs               # contextBridge API exposed to renderer
│   ├── database.cjs              # better-sqlite3 wrapper + schema
│   ├── license.cjs               # Offline license verify (HMAC)
│   └── autoBackup.cjs            # Scheduled DB backups to disk
│
├── src/                          # React renderer
│   ├── main.jsx                  # ReactDOM entry
│   ├── App.jsx                   # Root: routing, auth, layout, toasts
│   ├── index.css                 # Tailwind + globals
│   │
│   ├── pages/                    # Top-level screens
│   │   ├── Dashboard.jsx
│   │   ├── ItemsPage.jsx
│   │   ├── CustomersPage.jsx
│   │   ├── InvoicesPage.jsx
│   │   ├── PurchasesPage.jsx
│   │   ├── OtherExpensesPage.jsx
│   │   ├── ReportsPage.jsx
│   │   ├── UsersPage.jsx
│   │   ├── StoreSettingsPage.jsx
│   │   ├── LoginPage.jsx
│   │   ├── LicenseActivationPage.jsx
│   │   ├── Sidebar.jsx
│   │   └── shared.js             # Helpers shared across pages
│   │
│   ├── components/               # Reusable UI primitives
│   │   ├── UIComponents.jsx      # Modal, Btn, Input, Badge, Comboboxes, Toast
│   │   ├── FormComponents.jsx    # CategoryField, ManageCategoriesModal
│   │   ├── Pagination.jsx
│   │   ├── LoadingStates.jsx     # Spinner, Skeleton, EmptyState
│   │   ├── Alert.jsx
│   │   ├── AccessibleComponents.jsx
│   │   ├── BatchComponents.jsx
│   │   ├── RecurringInvoice.jsx
│   │   ├── CloudSyncComponents.jsx
│   │   ├── FirebaseSyncComponents.jsx
│   │   ├── Icon.jsx
│   │   └── index.js
│   │
│   ├── services/                 # Data + integrations
│   │   ├── localDatabase.js      # IndexedDB (browser fallback)
│   │   ├── dataHooks.js          # useLocalData() — central data layer
│   │   ├── localAuth.js          # Login/logout/session
│   │   ├── licenseService.js     # Renderer-side license check
│   │   ├── localBackup.js        # Manual backup/restore
│   │   ├── crashRecovery.js      # Auto-snapshot on unload
│   │   ├── batchTracking.js
│   │   ├── firebase.js           # Firebase init
│   │   ├── firebaseSync.js       # Bi-directional sync
│   │   ├── cloudSync.js
│   │   ├── googleDrive.js
│   │   └── index.js
│   │
│   ├── hooks/                    # usePagination, useDebouncedValue, useLoadingState
│   ├── utils/                    # helpers.js, validation.js, accessibility.js
│   ├── config/env.js
│   ├── assets/
│   └── test/                     # Vitest specs
│
├── build/icon.ico                # Windows installer icon
├── release/                      # electron-builder output (.exe, .blockmap)
├── docs/                         # Marketing + comparison docs
│
├── generate-license.cjs          # CLI: emit license_*.txt keys
├── firebase.json / firestore.rules
├── vite.config.js / vitest.config.js
├── tailwind.config.js / postcss.config.js
├── electron-builder.json.bak
├── ARCHITECTURE.md
├── OFFLINE_MODE.md
├── FIREBASE_SETUP.md
└── package.json
```

---

## 3. Runtime Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Electron Main Process (Node)         electron/main.cjs       │
│  ├─ BrowserWindow                                             │
│  ├─ license.cjs        ── HMAC verify ──► license_*.txt       │
│  ├─ database.cjs       ── better-sqlite3 ──► agristore.db     │
│  ├─ autoBackup.cjs     ── timer ─────────► backups/*.db       │
│  ├─ electron-updater   ── GitHub releases                     │
│  └─ ipcMain handlers                                          │
│         ▲ contextBridge (preload.cjs)                         │
│         ▼ window.electronAPI                                  │
├──────────────────────────────────────────────────────────────┤
│  Renderer (Chromium)                  src/main.jsx → App.jsx  │
│  ├─ React 18 + Tailwind                                       │
│  ├─ services/dataHooks.js  (single source of truth)           │
│  │      ├─ Electron mode → IPC → SQLite                       │
│  │      └─ Browser mode  → IndexedDB (localDatabase.js)       │
│  ├─ Pages (Items, Invoices, Customers, ...)                   │
│  ├─ Components (Modal, Btn, Combobox, Pagination, ...)        │
│  ├─ crashRecovery.js (snapshot on beforeunload)               │
│  └─ Optional: firebaseSync.js for cloud backup                │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow
1. **Renderer** calls a hook from `useLocalData()` → e.g. `addItem(payload)`
2. Hook detects environment:
   - In **Electron** → `window.electronAPI.invoke('db:addItem', payload)` → main process → `better-sqlite3` → returns row
   - In **Browser** → writes directly into IndexedDB via `localDatabase.js`
3. Mutations trigger a state refresh; subscribers re-render.
4. **autoBackup** copies the live `.db` file to a timestamped backup every N minutes (default 30 min, configurable).
5. On `beforeunload`, `crashRecovery` writes an in-memory snapshot to `localStorage` for next-boot recovery.

### IPC Surface (`preload.cjs` → `window.electronAPI`)
| Channel | Purpose |
|---|---|
| `db:query` / `db:run` | Generic SQL access |
| `db:get<Entity>` / `db:add<Entity>` / `db:update<Entity>` / `db:delete<Entity>` | CRUD for items, customers, invoices, purchases, expenses, users |
| `license:check` / `license:activate` | License validation |
| `backup:create` / `backup:restore` / `backup:list` | Manual backup ops |
| `app:getVersion` / `app:checkForUpdates` | Auto-update |
| `dialog:saveFile` / `dialog:openFile` | Native file pickers |

---

## 4. Database Schema (SQLite)

Defined in `electron/database.cjs`. Mirror tables exist in IndexedDB for browser mode.

| Table | Key columns | Notes |
|---|---|---|
| `items` | id, name, category, unit, hsn, gst, price, stock | One row per SKU |
| `batches` | id, itemId, batchNo, mfgDate, expiryDate, qty, costPrice | FIFO consumption |
| `customers` | id, name, phone, address, gstin, openingBalance | |
| `invoices` | id, no, date, customerId, type(cash/credit), subtotal, tax, total, paid, status | |
| `invoiceItems` | id, invoiceId, itemId, batchId, qty, rate, gst, amount | |
| `payments` | id, invoiceId, date, amount, mode, note | Multi-payment support |
| `purchases` | id, no, date, supplier, total | |
| `purchaseItems` | id, purchaseId, itemId, qty, costPrice, batchNo, expiryDate | Creates `batches` row |
| `expenses` | id, date, category, amount, note | Other-expenses |
| `users` | id, username, passwordHash, role, active | |
| `settings` | key, value | Store name, GSTIN, address, logo, prefs |
| `categories` | id, name, type | Item categories |

Indexes on `invoices.customerId`, `invoiceItems.invoiceId`, `batches.itemId`, `payments.invoiceId`.

---

## 5. Module Reference

### 5.1 Pages

| Page | File | Highlights |
|---|---|---|
| Dashboard | `Dashboard.jsx` | KPI cards (today sales, dues, low stock, expiring), recent invoices |
| Items | `ItemsPage.jsx` | CRUD, filter chips with live counts, profit column (price − FIFO cost), expiry badges, duplicate-name guard, pagination |
| Customers | `CustomersPage.jsx` | Summary cards, filters, expandable rows showing invoices+payments, quick-pay modal, pagination |
| Invoices | `InvoicesPage.jsx` | Cash/credit/quote types, status chips, sticky totals, delivery modal, smart empty state, print/PDF, recurring |
| Purchases | `PurchasesPage.jsx` | Multi-line purchase entry → auto-creates batches |
| Other Expenses | `OtherExpensesPage.jsx` | Category-tagged expense tracking |
| Reports | `ReportsPage.jsx` | Current: single P&L dashboard. Planned: 7-tab analytics (Sales, Purchase, Stock, Customer, GST, P&L, Cashbook) |
| Users | `UsersPage.jsx` | Add/edit users, role + active toggle (admin only) |
| Store Settings | `StoreSettingsPage.jsx` | Store profile, GSTIN, logo, invoice prefs, backup config |
| Login | `LoginPage.jsx` | Local-credential login |
| License Activation | `LicenseActivationPage.jsx` | First-run gate, paste/import key |
| Sidebar | `Sidebar.jsx` | Navigation, collapse, role-aware menu |

### 5.2 Shared Components (`src/components`)

- **UIComponents**: `Modal`, `Btn`, `Input`, `Badge`, `useToast`/`ToastProvider`, `CompanyCombobox`, `CustomerCombobox`, `ItemCombobox`, `PurchaseItemCombobox`, `RecordPaymentModal`
- **FormComponents**: `CategoryField`, `ManageCategoriesModal`
- **Pagination** + `usePagination()` hook
- **LoadingStates**: `Spinner`, `LoadingOverlay`, `SkeletonTable`, `SkeletonStatCard`, `LoadingState`, `EmptyState`, `SkipLink`
- **BatchComponents**: batch picker with expiry warnings
- **RecurringInvoice**: schedule UI
- **CloudSyncComponents / FirebaseSyncComponents**: sync status & manual triggers
- **AccessibleComponents**: a11y wrappers (focus trap, aria live regions)

### 5.3 Services

- `dataHooks.js` — `useLocalData()` returns `{ items, customers, invoices, ..., addItem, updateItem, deleteItem, ... }`. Single API regardless of backend.
- `localDatabase.js` — IndexedDB schema mirrors SQLite, used in dev / browser preview.
- `localAuth.js` — `loginLocal`, `logoutLocal`, `getCurrentUser`, password hashing (PBKDF2).
- `licenseService.js` — renderer-side check + activate (delegates to Electron when present).
- `crashRecovery.js` — `initCrashRecovery`, `didAppCrash`, `clearCrashFlag`, `exportToFile`, `getBackupList`, `restoreFromBackup`.
- `localBackup.js` — manual export/import as JSON or SQLite file.
- `firebaseSync.js` — push/pull deltas; uses Firestore (`firebase.json`, `firestore.rules`).
- `googleDrive.js` — optional Drive backup.
- `batchTracking.js` — FIFO consumption + expiry utilities.

### 5.4 Hooks (`src/hooks`)

| Hook | Purpose |
|---|---|
| `usePagination(list, pageSize)` | Returns `{ page, setPage, totalPages, pageItems }` |
| `useDebouncedValue(value, ms)` | Debounce search input |
| `useLoadingState()` | `{ loading, start, stop, withLoading(asyncFn) }` |

### 5.5 Utils

- `helpers.js` — `formatCurrency`, `formatDate`, `costMap`, `expiryStatus`, `applyPreset`, `downloadXLSX`, etc.
- `validation.js` — phone/GSTIN/email checks, invoice validation
- `accessibility.js` — focus & aria helpers

---

## 6. Licensing System

**Goal:** Offline-verifiable, machine-bound activation.

### Flow
1. Vendor runs `node generate-license.cjs` → produces `license_<Store>_<timestamp>.txt` containing JSON + HMAC signature.
2. User pastes file/key into **License Activation** screen on first launch.
3. `electron/license.cjs` verifies HMAC with shared secret, checks expiry & machine fingerprint, writes to `userData/license.json`.
4. On each launch, `checkLicense()` returns `{ valid, status }`; if invalid → activation screen.
5. Statuses: `valid`, `expired`, `machine_mismatch`, `not_activated`, `tampered`.

### Generator (`generate-license.cjs`)
- Inputs: store name, validity days, allowed machine fingerprint(s).
- Output: signed text token committed to `license_*.txt`.

---

## 7. Backups & Crash Recovery

- **Auto-backup** (`electron/autoBackup.cjs`): copies live SQLite file to `userData/backups/agristore_YYYYMMDD_HHmm.db`. Retention configurable (default keeps last 30).
- **Manual backup**: Store Settings → Backup → choose JSON or SQLite, native save dialog.
- **Crash recovery** (`services/crashRecovery.js`): writes JSON snapshot to `localStorage` on `beforeunload`; on next boot, if previous session didn't clear the flag, offers restore.
- **Cloud** (optional): `firebaseSync` push on schedule + manual sync button.

---

## 8. Build, Run, Release

### Scripts
| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server (http://localhost:5173) |
| `npm run build` | Production bundle to `dist/` |
| `npm run preview` | Preview built bundle |
| `npm test` / `test:run` / `test:coverage` | Vitest |
| `npm run electron:dev` | Launch Electron against built `dist/` |
| `npm run electron:build` | Build Win x64 installer + portable |
| `npm run electron:publish` | Same + publish to GitHub Releases |

### Dev Workflow (Electron + HMR)
```bash
# Terminal 1
npm run dev

# Terminal 2 (after Vite is ready on :5173)
ELECTRON_START_URL=http://localhost:5173 npx electron .
```

### Production Build
```bash
npm run build
npm run electron:build
# → release/AgriStore Setup <version>.exe  (NSIS installer)
# → release/AgriStore <version>.exe        (portable)
```

### Auto-Update
- Configured via `electron-updater` → GitHub provider (`laimaruthi/Agristore`).
- `latest.yml` + `.blockmap` published with each release.

### Native Module (better-sqlite3)
- Windows: prebuilt binary downloaded via `electron-builder install-app-deps` (postinstall hook).
- macOS dev: rebuild manually if native SQLite required:
  ```bash
  npx electron-rebuild -f -w better-sqlite3
  ```
  Otherwise app silently falls back to IndexedDB.

---

## 9. Configuration

### Environment (`src/config/env.js`)
Exposes feature flags & Firebase keys (when sync is enabled). Override via build-time `VITE_*` env vars.

### Firebase (optional)
1. Create project, enable Firestore + Auth (anonymous or email).
2. Paste config into `src/config/env.js` or set `VITE_FIREBASE_*` env vars.
3. Deploy `firestore.rules` via Firebase CLI.
4. Use **Cloud Sync** panel in Store Settings to enable.

See `FIREBASE_SETUP.md` for full steps.

---

## 10. Testing

- Framework: **Vitest** + Testing Library + jsdom.
- Specs in `src/test/`.
- Run: `npm test` (watch) or `npm run test:run` (CI).
- Coverage: `npm run test:coverage` → text + HTML report.

---

## 11. Security & Data

- Passwords hashed with PBKDF2 (`localAuth.js`).
- License HMAC secret kept out of repo (set as env var when generating keys).
- Firestore rules restrict reads/writes to authenticated user's tenant.
- All user data stays local unless cloud sync is explicitly enabled.
- No telemetry.

---

## 12. Known Limitations / Roadmap

| Status | Item |
|---|---|
| ⚠️ | `ReportsPage.jsx` currently shows only P&L; spec calls for 7 tabs (Sales / Purchase / Stock / Customer / GST / P&L / Cashbook) — pending rewrite |
| ⚠️ | macOS / Linux installer not packaged (Win only in builder config) |
| ⚠️ | `better-sqlite3` ABI must match Electron version — rebuild needed when bumping Electron |
| 🔜 | E-invoice (IRN/QR) generation |
| 🔜 | Barcode scanner integration |
| 🔜 | Mobile (PWA) companion |
| 🔜 | Multi-store consolidation via cloud sync |

---

## 13. Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| Blank Electron window on dev | Vite not ready when Electron loaded — reload window (Cmd/Ctrl+R) or restart with Vite started first |
| `ERR_DLOPEN_FAILED` for `better_sqlite3.node` | Native binary built for wrong arch — run `npx electron-rebuild -f -w better-sqlite3`; app will still work via IndexedDB |
| License `machine_mismatch` | Key bound to different machine fingerprint — regenerate key for current machine |
| Update not detected | Check `latest.yml` is published in GitHub release; version in `package.json` must be higher |
| `postinstall` fails | Network/proxy blocking electron-builder download — set `ELECTRON_MIRROR` / `npm_config_*` env vars |
| Data missing after reinstall | Data lives in `%APPDATA%/agristore` (Win) or `~/Library/Application Support/agristore` (mac) — not in install dir |

---

## 14. File-Level Quick Index

- **Bootstrap**: `electron/main.cjs`, `electron/preload.cjs`, `src/main.jsx`, `src/App.jsx`
- **DB**: `electron/database.cjs`, `src/services/localDatabase.js`, `src/services/dataHooks.js`
- **License**: `electron/license.cjs`, `src/services/licenseService.js`, `generate-license.cjs`, `src/pages/LicenseActivationPage.jsx`
- **Backup**: `electron/autoBackup.cjs`, `src/services/localBackup.js`, `src/services/crashRecovery.js`
- **Cloud**: `src/services/firebase.js`, `firebaseSync.js`, `googleDrive.js`, `firebase.json`, `firestore.rules`
- **UI Kit**: `src/components/UIComponents.jsx`, `FormComponents.jsx`, `Pagination.jsx`, `LoadingStates.jsx`
- **Packaging**: `package.json` (`build` section), `electron-builder.json.bak`, `build/icon.ico`

---

## 15. Glossary

- **FIFO cost** — When stock is sold, cost = cost-price of the oldest unconsumed batch.
- **Batch** — A purchased lot of an item with its own expiry & cost.
- **HSN** — Harmonised System Nomenclature code (GST classification).
- **GSTIN** — Goods and Services Tax Identification Number.
- **NSIS** — Nullsoft Scriptable Install System (Windows installer used by electron-builder).

---

*Last regenerated: 23 May 2026*
