// ── Accessible Components ────────────────────────────────────────────────────
// WCAG 2.1 AA compliant UI components

import React, { useRef, useEffect, useId } from 'react';
import { trapFocus, getModalA11yProps, getAlertA11yProps, getProgressA11yProps } from '../utils/accessibility';

/**
 * Skip Link - Allows keyboard users to skip to main content
 */
export function SkipLink({ targetId = 'main-content', children = 'Skip to main content' }) {
  const handleClick = (e) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <a
      href={`#${targetId}`}
      onClick={handleClick}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[9999] focus:px-6 focus:py-3 focus:bg-emerald-600 focus:text-white focus:rounded-xl focus:shadow-2xl focus:font-bold focus:outline-none focus:ring-4 focus:ring-emerald-400"
    >
      {children}
    </a>
  );
}

/**
 * Accessible Modal/Dialog
 */
export function AccessibleModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  className = '',
}) {
  const modalRef = useRef(null);
  const previousActiveElement = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  // Size classes
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full mx-4',
  };

  useEffect(() => {
    if (isOpen) {
      // Save current focus
      previousActiveElement.current = document.activeElement;

      // Trap focus
      if (modalRef.current) {
        const cleanup = trapFocus(modalRef.current);
        return cleanup;
      }
    } else {
      // Restore focus
      previousActiveElement.current?.focus();
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-hidden={!isOpen}
    >
      <div
        ref={modalRef}
        {...getModalA11yProps({ titleId, descriptionId, isOpen })}
        className={`w-full ${sizeClasses[size]} bg-slate-800 rounded-2xl shadow-2xl border border-white/10 ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div>
            <h2 id={titleId} className="text-xl font-bold text-white">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="text-sm text-white/60 mt-1">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * Accessible Alert/Notification
 */
export function AccessibleAlert({
  type = 'info',
  title,
  message,
  onDismiss,
  className = '',
}) {
  const alertStyles = {
    success: {
      bg: 'bg-emerald-900/30 border-emerald-500/30',
      icon: '✅',
      titleColor: 'text-emerald-400',
    },
    error: {
      bg: 'bg-red-900/30 border-red-500/30',
      icon: '❌',
      titleColor: 'text-red-400',
    },
    warning: {
      bg: 'bg-amber-900/30 border-amber-500/30',
      icon: '⚠️',
      titleColor: 'text-amber-400',
    },
    info: {
      bg: 'bg-blue-900/30 border-blue-500/30',
      icon: 'ℹ️',
      titleColor: 'text-blue-400',
    },
  };

  const style = alertStyles[type];

  return (
    <div
      {...getAlertA11yProps(type)}
      className={`p-4 rounded-xl border ${style.bg} ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl" aria-hidden="true">{style.icon}</span>
        <div className="flex-1">
          {title && (
            <h3 className={`font-bold ${style.titleColor}`}>{title}</h3>
          )}
          <p className="text-white/80 text-sm">{message}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white"
            aria-label="Dismiss notification"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Accessible Progress Bar
 */
export function AccessibleProgress({
  value,
  max = 100,
  label,
  showValue = true,
  size = 'md',
  color = 'emerald',
  className = '',
}) {
  const percentage = Math.round((value / max) * 100);
  const isIndeterminate = value === undefined || value === null;

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  const colorClasses = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  };

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-sm text-white/70">{label}</span>}
          {showValue && !isIndeterminate && (
            <span className="text-sm text-white/70">{percentage}%</span>
          )}
        </div>
      )}
      <div
        {...getProgressA11yProps({
          label: label || 'Progress',
          value: isIndeterminate ? undefined : value,
          max,
          indeterminate: isIndeterminate,
        })}
        className={`w-full ${sizeClasses[size]} bg-white/10 rounded-full overflow-hidden`}
      >
        <div
          className={`h-full ${colorClasses[color]} transition-all duration-300 ${
            isIndeterminate ? 'animate-pulse w-full' : ''
          }`}
          style={isIndeterminate ? {} : { width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Accessible Tooltip
 */
export function AccessibleTooltip({ children, content, position = 'top' }) {
  const tooltipId = useId();

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div className="relative inline-block group">
      <div aria-describedby={tooltipId}>{children}</div>
      <div
        id={tooltipId}
        role="tooltip"
        className={`absolute ${positionClasses[position]} px-3 py-1.5 text-sm bg-slate-700 text-white rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50`}
      >
        {content}
        <div
          className={`absolute w-2 h-2 bg-slate-700 transform rotate-45 ${
            position === 'top' ? 'top-full left-1/2 -translate-x-1/2 -mt-1' :
            position === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1' :
            position === 'left' ? 'left-full top-1/2 -translate-y-1/2 -ml-1' :
            'right-full top-1/2 -translate-y-1/2 -mr-1'
          }`}
        />
      </div>
    </div>
  );
}

/**
 * Screen Reader Only Text
 */
export function ScreenReaderOnly({ children, as: Component = 'span' }) {
  return (
    <Component className="sr-only">{children}</Component>
  );
}

/**
 * Live Region for dynamic announcements
 */
export function LiveRegion({ message, priority = 'polite', className = '' }) {
  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic="true"
      className={`sr-only ${className}`}
    >
      {message}
    </div>
  );
}

/**
 * Accessible Icon Button
 */
export function IconButton({
  icon,
  label,
  onClick,
  disabled = false,
  variant = 'default',
  size = 'md',
  className = '',
}) {
  const variants = {
    default: 'bg-white/10 hover:bg-white/20 text-white',
    primary: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    danger: 'bg-red-600 hover:bg-red-500 text-white',
    ghost: 'hover:bg-white/10 text-white/70 hover:text-white',
  };

  const sizes = {
    sm: 'p-1.5 text-sm',
    md: 'p-2',
    lg: 'p-3 text-lg',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`rounded-lg transition-colors ${variants[variant]} ${sizes[size]} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      {icon}
    </button>
  );
}

/**
 * Accessible Card with proper heading structure
 */
export function AccessibleCard({
  title,
  subtitle,
  children,
  headingLevel = 3,
  className = '',
  actions,
}) {
  const HeadingTag = `h${headingLevel}`;

  return (
    <article className={`rounded-2xl border border-white/10 bg-white/5 ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            {title && (
              <HeadingTag className="font-bold text-white">{title}</HeadingTag>
            )}
            {subtitle && (
              <p className="text-sm text-white/60">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </article>
  );
}

/**
 * Accessible Table wrapper
 */
export function AccessibleTable({
  caption,
  headers,
  children,
  className = '',
}) {
  return (
    <div className={`overflow-x-auto ${className}`} role="region" aria-label={caption}>
      <table className="w-full" role="table">
        {caption && (
          <caption className="sr-only">{caption}</caption>
        )}
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th
                key={index}
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-white/60 uppercase tracking-wider"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default {
  SkipLink,
  AccessibleModal,
  AccessibleAlert,
  AccessibleProgress,
  AccessibleTooltip,
  ScreenReaderOnly,
  LiveRegion,
  IconButton,
  AccessibleCard,
  AccessibleTable,
};
