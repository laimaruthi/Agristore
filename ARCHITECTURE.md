# AgriStore - Code Architecture

## 📁 Project Structure

```
src/
├── App.jsx                    # Main app component (being modularized)
├── main.jsx                   # App entry point
├── index.css                  # Global styles + Tailwind
│
├── components/                # Reusable UI Components
│   ├── index.js              # Component exports
│   ├── UIComponents.jsx      # Core UI (Modal, Btn, Input, etc.)
│   ├── Pagination.jsx        # Pagination component
│   ├── LoadingStates.jsx     # Spinners, skeletons, empty states
│   ├── FormComponents.jsx    # Form inputs with validation
│   └── AccessibleComponents.jsx  # WCAG 2.1 AA compliant components
│
├── services/                  # Business Logic & API Integrations
│   ├── index.js              # Service exports
│   ├── firebase.js           # Firebase auth & Firestore hooks
│   ├── googleDrive.js        # Google Drive backup with rate limiting
│   └── localBackup.js        # IndexedDB backups & auto-download
│
├── utils/                     # Utility Functions
│   ├── helpers.js            # Date, currency, ID generation
│   ├── validation.js         # Form validation rules & schemas
│   └── accessibility.js      # ARIA utilities & keyboard helpers
│
├── hooks/                     # Custom React Hooks
│   └── index.js              # usePagination, useDebounce, etc.
│
├── pages/                     # Page Components (extracted modules)
│   ├── index.js              # Page exports
│   ├── shared.js             # Shared context & utilities
│   ├── Dashboard.jsx         # ✅ Revenue, analytics, alerts (~550 lines)
│   ├── CustomersPage.jsx     # ✅ Customer CRUD, history (~500 lines)
│   ├── ItemsPage.jsx         # ✅ Inventory management (~600 lines)
│   ├── InvoicesPage.jsx      # ✅ Sales invoicing (~700 lines)
│   ├── PurchasesPage.jsx     # ✅ Purchase orders (~550 lines)
│   ├── LoginPage.jsx         # ✅ Firebase authentication (~100 lines)
│   ├── Sidebar.jsx           # ✅ Navigation component (~50 lines)
│   └── UsersPage.jsx         # ✅ Staff user management (~120 lines)
│
├── config/                    # Configuration
│   └── env.js                # Environment variables
│
└── test/                      # Unit Tests (92 tests)
    ├── setup.js              # Test configuration
    ├── helpers.test.js       # Utility tests
    ├── validation.test.js    # Validation tests
    ├── hooks.test.js         # Hook tests
    └── accessibility.test.js # A11y tests
```

## 🔧 Services Layer

### Firebase Service (`services/firebase.js`)
- Firebase initialization & configuration
- Firestore real-time sync hooks
- Offline persistence with automatic sync
- Data protection (prevents accidental data loss)
- Image compression utility

### Google Drive Service (`services/googleDrive.js`)
- Google OAuth2 token management
- Rate limiting (30/hr, 200/day limits)
- Exponential backoff on errors
- Master + daily backup rotation
- Automatic cleanup of old backups

### Local Backup Service (`services/localBackup.js`)
- IndexedDB storage for offline backups
- File System Access API for folder selection
- Download history tracking
- Automatic fallback to browser download

## 🧩 Component Library

### Core UI (`components/UIComponents.jsx`)
- `Badge` - Status badges with colors
- `Modal` - Dialog with keyboard support
- `Input` - Form input with validation
- `Btn` - Button variants (primary, secondary, danger)
- `ToastProvider` / `useToast` - Toast notifications
- `CustomerCombobox` - Searchable customer selector
- `ItemCombobox` - Searchable item selector
- `RecordPaymentModal` - Payment recording
- `DeleteConfirmModal` - Deletion confirmation

### Accessibility (`components/AccessibleComponents.jsx`)
- `SkipLink` - Skip to main content
- `AccessibleModal` - Focus trapping & ARIA
- `AccessibleAlert` - Live regions
- `AccessibleProgress` - Progress indicators
- `LiveRegion` - Screen reader announcements

## 📄 Page Splitting Progress

### ✅ Extracted Pages

| Page | Lines | Status | Description |
|------|-------|--------|-------------|
| Dashboard | ~550 | ✅ Complete | Revenue, analytics, alerts |
| CustomersPage | ~500 | ✅ Complete | Customer CRUD, history, Excel import |
| ItemsPage | ~600 | ✅ Complete | Inventory management, bulk add |
| LoginPage | ~100 | ✅ Complete | Firebase authentication |
| Sidebar | ~50 | ✅ Complete | Navigation component |
| UsersPage | ~120 | ✅ Complete | Staff user management |
| InvoicesPage | ~700 | ✅ Complete | Sales invoicing, payment tracking, Excel import |
| PurchasesPage | ~550 | ✅ Complete | Purchase orders, company management |

### 📋 Remaining in App.jsx

| Page | Lines | Description |
|------|-------|-------------|
| StoreSettingsPage | ~1000 | Settings, backup, themes |
| LocalBackupSection | ~350 | Local/auto backup component |

### How to Split a Page

1. Create new file: `src/pages/CustomersPage.jsx`
2. Import dependencies:
```jsx
import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Badge, Modal, Input, Btn, useToast, RecordPaymentModal } from '../components';
import { fmtCurrency, fmtDate, newId, isOverdue, exportCSV } from '../utils/helpers';
```

3. Export the component:
```jsx
export function CustomersPage({ customers, setCustomers, ... }) {
  // Component code
}
```

4. Update `pages/index.js` to export
5. Update `App.jsx` to import from pages

## 🧪 Testing

```bash
npm run test        # Watch mode
npm run test:run    # Single run (92 tests)
npm run test:coverage  # With coverage report
```

## 📦 Build Output (Code Split)

```
dist/
├── index.html
├── vendor.js      (140 KB) - React
├── firebase.js    (526 KB) - Firebase SDK
├── xlsx.js        (332 KB) - Excel library
└── index.js       (285 KB) - Application code
```

## 🔄 Import Patterns

```jsx
// Components
import { Modal, Btn, Input, Badge, useToast } from './components';

// Services
import { useFirestore, useOfflineMode, saveLocalBackup } from './services';
import { uploadToGoogleDriveWithHistory, canPerformGDriveBackup } from './services';

// Utilities
import { fmtCurrency, fmtDate, today, newId, debounce } from './utils/helpers';
import { validateForm, FORM_SCHEMAS } from './utils/validation';

// Hooks
import { usePagination, useDebouncedValue, useLoadingState } from './hooks';
```
