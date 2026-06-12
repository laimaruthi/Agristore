// ── Unit Tests for Custom Hooks ──────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useDebouncedValue,
  usePagination,
  useLoadingState,
  useLocalStorage,
  usePrevious,
} from '../hooks';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('test', 300));
    expect(result.current).toBe('test');
  });

  it('debounces value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'initial' } }
    );

    rerender({ value: 'changed' });
    expect(result.current).toBe('initial');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('changed');
  });

  it('cancels pending updates on new value', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } }
    );

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    rerender({ value: 'c' });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current).toBe('c');
  });
});

describe('usePagination', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));

  it('paginates items correctly', () => {
    const { result } = renderHook(() => usePagination(items, 10));

    expect(result.current.currentPage).toBe(1);
    expect(result.current.totalPages).toBe(10);
    expect(result.current.paginatedItems.length).toBe(10);
    expect(result.current.paginatedItems[0].id).toBe(1);
    expect(result.current.totalItems).toBe(100);
  });

  it('navigates to next page', () => {
    const { result } = renderHook(() => usePagination(items, 10));

    act(() => {
      result.current.nextPage();
    });

    expect(result.current.currentPage).toBe(2);
    expect(result.current.paginatedItems[0].id).toBe(11);
  });

  it('navigates to previous page', () => {
    const { result } = renderHook(() => usePagination(items, 10));

    act(() => {
      result.current.goToPage(3);
    });

    expect(result.current.currentPage).toBe(3);

    act(() => {
      result.current.prevPage();
    });

    expect(result.current.currentPage).toBe(2);
  });

  it('navigates to first and last page', () => {
    const { result } = renderHook(() => usePagination(items, 10));

    act(() => {
      result.current.lastPage();
    });

    expect(result.current.currentPage).toBe(10);

    act(() => {
      result.current.firstPage();
    });

    expect(result.current.currentPage).toBe(1);
  });

  it('prevents navigating beyond bounds', () => {
    const { result } = renderHook(() => usePagination(items, 10));

    act(() => {
      result.current.prevPage();
    });

    expect(result.current.currentPage).toBe(1);

    act(() => {
      result.current.goToPage(10);
      result.current.nextPage();
    });

    expect(result.current.currentPage).toBe(10);
  });

  it('calculates hasNextPage and hasPrevPage correctly', () => {
    const { result } = renderHook(() => usePagination(items, 10));

    expect(result.current.hasPrevPage).toBe(false);
    expect(result.current.hasNextPage).toBe(true);

    act(() => {
      result.current.lastPage();
    });

    expect(result.current.hasPrevPage).toBe(true);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('handles empty array', () => {
    const { result } = renderHook(() => usePagination([], 10));

    expect(result.current.currentPage).toBe(1);
    expect(result.current.totalPages).toBe(0);
    expect(result.current.paginatedItems.length).toBe(0);
  });
});

describe('useLoadingState', () => {
  it('initializes with default state', () => {
    const { result } = renderHook(() => useLoadingState());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('initializes with custom state', () => {
    const { result } = renderHook(() => useLoadingState(true));

    expect(result.current.isLoading).toBe(true);
  });

  it('manages loading state', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.startLoading();
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBe(null);

    act(() => {
      result.current.stopLoading();
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('manages error state', () => {
    const { result } = renderHook(() => useLoadingState());

    act(() => {
      result.current.setLoadingError('Something went wrong');
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('Something went wrong');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBe(null);
  });

  it('withLoading wraps async functions', async () => {
    const { result } = renderHook(() => useLoadingState());
    const asyncFn = vi.fn().mockResolvedValue('success');

    let returnValue;
    await act(async () => {
      returnValue = await result.current.withLoading(asyncFn);
    });

    expect(asyncFn).toHaveBeenCalled();
    expect(returnValue).toBe('success');
    expect(result.current.isLoading).toBe(false);
  });
});

describe('usePrevious', () => {
  it('returns undefined on first render', () => {
    const { result } = renderHook(() => usePrevious('initial'));
    expect(result.current).toBe(undefined);
  });

  it('returns previous value after update', () => {
    const { result, rerender } = renderHook(
      ({ value }) => usePrevious(value),
      { initialProps: { value: 'first' } }
    );

    expect(result.current).toBe(undefined);

    rerender({ value: 'second' });
    expect(result.current).toBe('first');

    rerender({ value: 'third' });
    expect(result.current).toBe('second');
  });
});

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('returns initial value when localStorage is empty', () => {
    localStorage.getItem.mockReturnValue(null);
    
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
    
    expect(result.current[0]).toBe('default');
  });

  it('returns stored value from localStorage', () => {
    localStorage.getItem.mockReturnValue(JSON.stringify('stored-value'));
    
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'));
    
    expect(result.current[0]).toBe('stored-value');
  });

  it('updates localStorage when value changes', () => {
    localStorage.getItem.mockReturnValue(null);
    
    const { result } = renderHook(() => useLocalStorage('test-key', 'initial'));
    
    act(() => {
      result.current[1]('new-value');
    });
    
    expect(localStorage.setItem).toHaveBeenCalledWith('test-key', '"new-value"');
    expect(result.current[0]).toBe('new-value');
  });
});
