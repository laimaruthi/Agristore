// ── Loading States Components ─────────────────────────────────────────────────
import React from 'react';

// Spinning loader
export function Spinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };
  
  return (
    <div className={`${sizes[size]} ${className}`}>
      <svg className="animate-spin" viewBox="0 0 24 24" fill="none">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
}

// Full page loading overlay
export function LoadingOverlay({ message = 'Loading...' }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-emerald-900/90 rounded-2xl p-8 flex flex-col items-center gap-4 border border-emerald-700/30">
        <Spinner size="lg" className="text-emerald-400" />
        <p className="text-emerald-200 font-semibold">{message}</p>
      </div>
    </div>
  );
}

// Skeleton loader for text
export function SkeletonText({ width = 'w-full', height = 'h-4', className = '' }) {
  return (
    <div
      className={`${width} ${height} bg-emerald-800/30 rounded animate-pulse ${className}`}
    />
  );
}

// Skeleton loader for cards
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`p-4 rounded-xl border border-emerald-800/30 bg-emerald-900/20 ${className}`}>
      <SkeletonText width="w-3/4" height="h-5" className="mb-3" />
      <SkeletonText width="w-full" height="h-3" className="mb-2" />
      <SkeletonText width="w-2/3" height="h-3" className="mb-2" />
      <SkeletonText width="w-1/2" height="h-3" />
    </div>
  );
}

// Skeleton loader for table rows
export function SkeletonTableRow({ columns = 5 }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <SkeletonText width={i === 0 ? 'w-24' : 'w-16'} height="h-4" />
        </td>
      ))}
    </tr>
  );
}

// Skeleton loader for table
export function SkeletonTable({ rows = 5, columns = 5 }) {
  return (
    <div className="overflow-hidden rounded-xl border border-emerald-800/30">
      <table className="w-full">
        <thead className="bg-emerald-900/30">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <SkeletonText width="w-20" height="h-4" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-emerald-800/30">
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Skeleton loader for stats cards
export function SkeletonStatCard() {
  return (
    <div className="p-4 rounded-xl border border-emerald-800/30 bg-emerald-900/20 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-800/30" />
        <div className="flex-1">
          <SkeletonText width="w-16" height="h-6" className="mb-1" />
          <SkeletonText width="w-24" height="h-3" />
        </div>
      </div>
    </div>
  );
}

// Loading state wrapper component
export function LoadingState({
  isLoading,
  error,
  children,
  loadingComponent,
  errorComponent,
  onRetry,
}) {
  if (isLoading) {
    return loadingComponent || (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" className="text-emerald-400" />
      </div>
    );
  }
  
  if (error) {
    return errorComponent || (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-red-400 font-semibold mb-2">Something went wrong</p>
        <p className="text-red-400/70 text-sm text-center mb-4">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition-colors"
          >
            🔄 Try Again
          </button>
        )}
      </div>
    );
  }
  
  return children;
}

// Empty state component
export function EmptyState({
  icon = '📭',
  title = 'No data found',
  description = 'There are no items to display.',
  action,
  actionLabel,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="text-5xl mb-4">{icon}</div>
      <p className="text-emerald-200 font-semibold text-lg mb-2">{title}</p>
      <p className="text-emerald-500/60 text-sm text-center max-w-md mb-6">{description}</p>
      {action && actionLabel && (
        <button
          onClick={action}
          className="px-6 py-2.5 rounded-xl font-semibold text-white shadow-lg transition-all hover:scale-105"
          style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// Progress bar
export function ProgressBar({ value, max = 100, showLabel = true, className = '' }) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-1">
        {showLabel && (
          <>
            <span className="text-xs text-emerald-500/60">{value} / {max}</span>
            <span className="text-xs font-semibold text-emerald-400">{percentage.toFixed(0)}%</span>
          </>
        )}
      </div>
      <div className="w-full h-2 bg-emerald-900/40 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default LoadingState;
