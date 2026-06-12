// ── Shared Utilities & Context for Pages ─────────────────────────────────────
// Common imports and utilities used across all pages

import React, { createContext, useContext } from 'react';

// ── App Context ───────────────────────────────────────────────────────────────
// Provides shared state to all pages without prop drilling
export const AppContext = createContext(null);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

// ── Helper Functions (re-exported from helpers.js) ────────────────────────────
export {
  fmtCurrency,
  fmtDate,
  fmtDateTime,
  today,
  nowTimestamp,
  newId,
  daysUntilExpiry,
  expiryStatus,
  daysSinceInvoice,
  isOverdue,
  exportCSV,
  sanitizeInput,
  debounce,
} from '../utils/helpers';

// ── Validation (re-exported from validation.js) ──────────────────────────────
export {
  VALIDATION_RULES,
  validateField,
  validateForm,
  FORM_SCHEMAS,
} from '../utils/validation';
