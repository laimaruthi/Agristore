// ── Pagination Component ──────────────────────────────────────────────────────
import React from 'react';

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onPageChange,
  onNext,
  onPrev,
  onFirst,
  onLast,
  hasNextPage,
  hasPrevPage,
  pageSize = 25,
  showPageSize = false,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
}) {
  if (totalPages <= 1 && !showPageSize) return null;
  
  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  };
  
  const pageNumbers = getPageNumbers();
  
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4 px-2">
      {/* Info */}
      <div className="text-sm text-emerald-500/60">
        Showing <span className="font-semibold text-emerald-400">{startIndex + 1}</span> to{' '}
        <span className="font-semibold text-emerald-400">{Math.min(endIndex, totalItems)}</span> of{' '}
        <span className="font-semibold text-emerald-400">{totalItems}</span> results
      </div>
      
      {/* Page size selector */}
      {showPageSize && onPageSizeChange && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-emerald-500/60">Show:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1 rounded-lg text-sm bg-emerald-900/40 border border-emerald-700/30 text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      )}
      
      {/* Navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          {/* First */}
          <button
            onClick={onFirst}
            disabled={!hasPrevPage}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              hasPrevPage
                ? 'text-emerald-400 hover:bg-emerald-900/40 border border-emerald-700/30'
                : 'text-emerald-700 cursor-not-allowed'
            }`}
            title="First page"
          >
            ««
          </button>
          
          {/* Previous */}
          <button
            onClick={onPrev}
            disabled={!hasPrevPage}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              hasPrevPage
                ? 'text-emerald-400 hover:bg-emerald-900/40 border border-emerald-700/30'
                : 'text-emerald-700 cursor-not-allowed'
            }`}
            title="Previous page"
          >
            «
          </button>
          
          {/* Page numbers */}
          {pageNumbers[0] > 1 && (
            <>
              <button
                onClick={() => onPageChange(1)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 hover:bg-emerald-900/40 border border-emerald-700/30"
              >
                1
              </button>
              {pageNumbers[0] > 2 && (
                <span className="px-2 text-emerald-600">...</span>
              )}
            </>
          )}
          
          {pageNumbers.map((page) => (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                page === currentPage
                  ? 'bg-emerald-600 text-white'
                  : 'text-emerald-400 hover:bg-emerald-900/40 border border-emerald-700/30'
              }`}
            >
              {page}
            </button>
          ))}
          
          {pageNumbers[pageNumbers.length - 1] < totalPages && (
            <>
              {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
                <span className="px-2 text-emerald-600">...</span>
              )}
              <button
                onClick={() => onPageChange(totalPages)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 hover:bg-emerald-900/40 border border-emerald-700/30"
              >
                {totalPages}
              </button>
            </>
          )}
          
          {/* Next */}
          <button
            onClick={onNext}
            disabled={!hasNextPage}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              hasNextPage
                ? 'text-emerald-400 hover:bg-emerald-900/40 border border-emerald-700/30'
                : 'text-emerald-700 cursor-not-allowed'
            }`}
            title="Next page"
          >
            »
          </button>
          
          {/* Last */}
          <button
            onClick={onLast}
            disabled={!hasNextPage}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              hasNextPage
                ? 'text-emerald-400 hover:bg-emerald-900/40 border border-emerald-700/30'
                : 'text-emerald-700 cursor-not-allowed'
            }`}
            title="Last page"
          >
            »»
          </button>
        </div>
      )}
    </div>
  );
}

export default Pagination;
