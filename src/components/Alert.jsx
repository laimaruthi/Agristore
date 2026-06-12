// ── Alert / Status Box Component ──────────────────────────────────────────────
// Theme-aware reusable alert boxes. Replaces ad-hoc bg-red-900/30 patterns.
// Usage: <Alert variant="error" title="Failed">Something went wrong</Alert>

import React from 'react';
import { Icon } from './Icon';

const VARIANTS = {
  success: { cls: 'alert-success', icon: 'success' },
  error:   { cls: 'alert-error',   icon: 'error' },
  warning: { cls: 'alert-warning', icon: 'warning' },
  info:    { cls: 'alert-info',    icon: 'info' },
};

export function Alert({ variant = 'info', title, children, icon, onClose, className = '' }) {
  const v = VARIANTS[variant] || VARIANTS.info;
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border p-3 ${v.cls} ${className}`}
    >
      <Icon name={icon || v.icon} size={20} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0 text-sm">
        {title && <div className="font-semibold mb-0.5">{title}</div>}
        {children && <div className="opacity-90">{children}</div>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="opacity-60 hover:opacity-100 flex-shrink-0"
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}

// ── Status Pill (compact inline status) ───────────────────────────────────────
export function StatusPill({ variant = 'info', children, icon, className = '' }) {
  const v = VARIANTS[variant] || VARIANTS.info;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${v.cls} ${className}`}>
      {icon !== false && <Icon name={icon || v.icon} size={12} />}
      {children}
    </span>
  );
}

export default Alert;
