// ── Pages Index ───────────────────────────────────────────────────────────────
// Export all page components

// Re-export shared utilities
export { AppContext, useAppContext } from './shared';

// ── Page Components ───────────────────────────────────────────────────────────
export { Dashboard } from './Dashboard';
export { CustomersPage } from './CustomersPage';
export { ItemsPage, BLANK_ITEM } from './ItemsPage';
export { default as LoginPage } from './LoginPage';
export { default as Sidebar } from './Sidebar';
export { default as UsersPage, ROLES, hasPermission, isManager } from './UsersPage';
export { default as InvoicesPage } from './InvoicesPage';
export { default as PurchasesPage } from './PurchasesPage';
export { default as StoreSettingsPage } from './StoreSettingsPage';

