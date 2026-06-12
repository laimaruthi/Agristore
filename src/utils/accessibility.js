// ── Accessibility Utilities ──────────────────────────────────────────────────
// Provides utilities for WCAG 2.1 AA compliance

/**
 * Common ARIA labels for the application
 */
export const ARIA_LABELS = {
  // Navigation
  mainNav: 'Main navigation',
  sidebar: 'Sidebar navigation',
  breadcrumb: 'Breadcrumb navigation',
  
  // Actions
  save: 'Save changes',
  cancel: 'Cancel operation',
  delete: 'Delete item',
  edit: 'Edit item',
  add: 'Add new item',
  search: 'Search',
  filter: 'Filter results',
  sort: 'Sort results',
  close: 'Close dialog',
  open: 'Open dialog',
  expand: 'Expand section',
  collapse: 'Collapse section',
  
  // Form
  required: 'This field is required',
  optional: 'This field is optional',
  passwordToggle: 'Toggle password visibility',
  
  // Data display
  loading: 'Loading content',
  emptyState: 'No items found',
  pagination: 'Pagination navigation',
  table: 'Data table',
  
  // Notifications
  success: 'Success notification',
  error: 'Error notification',
  warning: 'Warning notification',
  info: 'Information notification',
};

/**
 * Generates accessible props for buttons
 * @param {Object} options - Button options
 * @returns {Object} Accessible props
 */
export const getButtonA11yProps = ({
  label,
  description,
  pressed,
  expanded,
  controls,
  disabled,
  loading,
}) => {
  const props = {
    'aria-label': label,
    'aria-disabled': disabled || loading,
    role: 'button',
    tabIndex: disabled ? -1 : 0,
  };
  
  if (description) props['aria-describedby'] = description;
  if (pressed !== undefined) props['aria-pressed'] = pressed;
  if (expanded !== undefined) props['aria-expanded'] = expanded;
  if (controls) props['aria-controls'] = controls;
  if (loading) props['aria-busy'] = true;
  
  return props;
};

/**
 * Generates accessible props for form inputs
 * @param {Object} options - Input options
 * @returns {Object} Accessible props
 */
export const getInputA11yProps = ({
  id,
  label,
  error,
  required,
  description,
  invalid,
}) => {
  const props = {
    id,
    'aria-label': label,
    'aria-required': required,
  };
  
  if (error) {
    props['aria-invalid'] = true;
    props['aria-errormessage'] = `${id}-error`;
  } else if (invalid !== undefined) {
    props['aria-invalid'] = invalid;
  }
  
  if (description) {
    props['aria-describedby'] = `${id}-description`;
  }
  
  return props;
};

/**
 * Generates accessible props for tables
 * @param {Object} options - Table options
 * @returns {Object} Accessible props
 */
export const getTableA11yProps = ({
  caption,
  sortColumn,
  sortDirection,
  rowCount,
}) => {
  const props = {
    role: 'table',
    'aria-rowcount': rowCount,
  };
  
  if (caption) {
    props['aria-label'] = caption;
  }
  
  return {
    tableProps: props,
    getSortProps: (column) => ({
      'aria-sort': sortColumn === column ? sortDirection : 'none',
      role: 'columnheader',
    }),
  };
};

/**
 * Generates accessible props for modals/dialogs
 * @param {Object} options - Modal options
 * @returns {Object} Accessible props
 */
export const getModalA11yProps = ({
  titleId,
  descriptionId,
  isOpen,
}) => ({
  role: 'dialog',
  'aria-modal': true,
  'aria-labelledby': titleId,
  'aria-describedby': descriptionId,
  'aria-hidden': !isOpen,
});

/**
 * Generates accessible props for alerts
 * @param {string} type - Alert type (success, error, warning, info)
 * @returns {Object} Accessible props
 */
export const getAlertA11yProps = (type) => ({
  role: type === 'error' ? 'alert' : 'status',
  'aria-live': type === 'error' ? 'assertive' : 'polite',
  'aria-atomic': true,
});

/**
 * Generates accessible props for progress indicators
 * @param {Object} options - Progress options
 * @returns {Object} Accessible props
 */
export const getProgressA11yProps = ({
  label,
  value,
  min = 0,
  max = 100,
  indeterminate = false,
}) => ({
  role: 'progressbar',
  'aria-label': label,
  'aria-valuenow': indeterminate ? undefined : value,
  'aria-valuemin': min,
  'aria-valuemax': max,
  'aria-busy': true,
});

/**
 * Generates accessible props for tabs
 * @param {Object} options - Tab options
 * @returns {Object} Tab and panel props
 */
export const getTabsA11yProps = ({
  selectedIndex,
  tabIds,
  panelIds,
}) => ({
  tabListProps: {
    role: 'tablist',
  },
  getTabProps: (index) => ({
    role: 'tab',
    id: tabIds[index],
    'aria-selected': selectedIndex === index,
    'aria-controls': panelIds[index],
    tabIndex: selectedIndex === index ? 0 : -1,
  }),
  getPanelProps: (index) => ({
    role: 'tabpanel',
    id: panelIds[index],
    'aria-labelledby': tabIds[index],
    hidden: selectedIndex !== index,
    tabIndex: 0,
  }),
});

/**
 * Trap focus within an element (for modals)
 * @param {HTMLElement} element - The element to trap focus within
 * @returns {Function} Cleanup function
 */
export const trapFocus = (element) => {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  
  const handleKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    
    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement?.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement?.focus();
    }
  };
  
  element.addEventListener('keydown', handleKeyDown);
  firstElement?.focus();
  
  return () => {
    element.removeEventListener('keydown', handleKeyDown);
  };
};

/**
 * Announce message to screen readers
 * @param {string} message - Message to announce
 * @param {string} priority - 'polite' or 'assertive'
 */
export const announceToScreenReader = (message, priority = 'polite') => {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

/**
 * Keyboard navigation handler for lists
 * @param {Event} e - Keyboard event
 * @param {Object} options - Navigation options
 */
export const handleListKeyboardNavigation = (e, {
  items,
  currentIndex,
  onSelect,
  onFocus,
  orientation = 'vertical',
}) => {
  const isVertical = orientation === 'vertical';
  const nextKey = isVertical ? 'ArrowDown' : 'ArrowRight';
  const prevKey = isVertical ? 'ArrowUp' : 'ArrowLeft';
  
  let newIndex = currentIndex;
  
  switch (e.key) {
    case nextKey:
      e.preventDefault();
      newIndex = Math.min(currentIndex + 1, items.length - 1);
      break;
    case prevKey:
      e.preventDefault();
      newIndex = Math.max(currentIndex - 1, 0);
      break;
    case 'Home':
      e.preventDefault();
      newIndex = 0;
      break;
    case 'End':
      e.preventDefault();
      newIndex = items.length - 1;
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      onSelect?.(items[currentIndex], currentIndex);
      return;
    default:
      return;
  }
  
  if (newIndex !== currentIndex) {
    onFocus?.(items[newIndex], newIndex);
  }
};

/**
 * Check if user prefers reduced motion
 * @returns {boolean}
 */
export const prefersReducedMotion = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Check if user prefers high contrast
 * @returns {boolean}
 */
export const prefersHighContrast = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: more)').matches;
};

/**
 * Generate unique IDs for accessibility attributes
 * @param {string} prefix - ID prefix
 * @returns {Function} ID generator
 */
export const createIdGenerator = (prefix) => {
  let counter = 0;
  return () => `${prefix}-${++counter}`;
};

/**
 * Skip link component helper
 * @returns {Object} Props for skip link
 */
export const getSkipLinkProps = (targetId) => ({
  href: `#${targetId}`,
  className: 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-600 focus:text-white focus:rounded-lg',
  onClick: (e) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView();
    }
  },
});

// CSS class for visually hidden elements (screen reader only)
export const srOnlyStyles = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: '0',
};

export default {
  ARIA_LABELS,
  getButtonA11yProps,
  getInputA11yProps,
  getTableA11yProps,
  getModalA11yProps,
  getAlertA11yProps,
  getProgressA11yProps,
  getTabsA11yProps,
  trapFocus,
  announceToScreenReader,
  handleListKeyboardNavigation,
  prefersReducedMotion,
  prefersHighContrast,
  createIdGenerator,
  getSkipLinkProps,
  srOnlyStyles,
};
