// ── Unit Tests for Helper Functions ──────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fmtCurrency,
  today,
  fmtDate,
  fmtDateTime,
  newId,
  newInvId,
  newPurId,
  daysUntilExpiry,
  expiryStatus,
  daysSinceInvoice,
  isOverdue,
  debounce,
  canPerformAction,
  exportCSV,
} from '../utils/helpers';

describe('Currency Formatting', () => {
  it('formats currency with Indian locale', () => {
    expect(fmtCurrency(1000)).toBe('₹1,000.00');
    expect(fmtCurrency(1234567.89)).toBe('₹12,34,567.89');
    expect(fmtCurrency(0)).toBe('₹0.00');
  });

  it('handles negative numbers', () => {
    expect(fmtCurrency(-500)).toBe('₹-500.00');
  });

  it('handles string input', () => {
    expect(fmtCurrency('1000')).toBe('₹1,000.00');
  });
});

describe('Date Functions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('today() returns current date in YYYY-MM-DD format', () => {
    expect(today()).toBe('2026-04-06');
  });

  it('fmtDate() formats date as DD/MM/YYYY', () => {
    expect(fmtDate('2026-04-06')).toBe('06/04/2026');
    expect(fmtDate('2026-12-25')).toBe('25/12/2026');
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('')).toBe('—');
  });

  it('fmtDateTime() formats date and time', () => {
    expect(fmtDateTime('2026-04-06 14:30:00')).toBe('06/04/2026 2:30 PM');
    expect(fmtDateTime('2026-04-06 09:15:00')).toBe('06/04/2026 9:15 AM');
    expect(fmtDateTime('2026-04-06 00:00:00')).toBe('06/04/2026 12:00 AM');
    expect(fmtDateTime('2026-04-06')).toBe('06/04/2026'); // Falls back to date only
  });
});

describe('ID Generators', () => {
  it('newId() generates sequential IDs', () => {
    expect(newId([])).toBe(1);
    expect(newId([{ id: 1 }, { id: 2 }, { id: 3 }])).toBe(4);
    expect(newId([{ id: 10 }, { id: 5 }])).toBe(11);
  });

  it('newInvId() generates clean sequential invoice numbers', () => {
    // Invoice IDs are the user-facing invoice number (printed on challans, shown
    // in exports) so they must stay clean and sequential — no random suffix.
    expect(newInvId([])).toBe('INV-001');

    expect(newInvId([{ id: 'INV-001-abc' }])).toBe('INV-002');

    // Picks max sequence across existing invoices, regardless of order.
    expect(newInvId([{ id: 'INV-005-xyz' }, { id: 'INV-003-def' }])).toBe('INV-006');
  });

  it('newPurId() generates unique purchase IDs', () => {
    const id1 = newPurId([]);
    expect(id1).toMatch(/^PUR-001-[a-z0-9]+$/);

    const id2 = newPurId([{ id: 'PUR-010-abc' }]);
    expect(id2).toMatch(/^PUR-011-[a-z0-9]+$/);
  });
});

describe('Expiry Helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('daysUntilExpiry() calculates days correctly', () => {
    expect(daysUntilExpiry('2026-04-16')).toBe(10); // 10 days ahead
    expect(daysUntilExpiry('2026-04-01')).toBe(-5); // 5 days ago
    expect(daysUntilExpiry('2026-04-06')).toBe(0);  // Today
    expect(daysUntilExpiry(null)).toBe(null);
    expect(daysUntilExpiry('')).toBe(null);
  });

  it('expiryStatus() returns correct status object', () => {
    // Expired
    const expired = expiryStatus('2026-04-01');
    expect(expired.label).toBe('Expired');
    expect(expired.color).toBe('red');

    // Expiring soon (within 30 days)
    const expiringSoon = expiryStatus('2026-04-20');
    expect(expiringSoon.label).toBe('14d left');
    expect(expiringSoon.color).toBe('red');

    // Warning (31-60 days)
    const warning = expiryStatus('2026-05-20');
    expect(warning.color).toBe('yellow');

    // Safe (>60 days)
    const safe = expiryStatus('2026-07-01');
    expect(safe.color).toBe('green');

    // No date
    expect(expiryStatus(null)).toBe(null);
  });
});

describe('Invoice Overdue Helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-06'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('daysSinceInvoice() calculates days passed', () => {
    expect(daysSinceInvoice('2026-04-01')).toBe(5);
    expect(daysSinceInvoice('2026-03-07')).toBe(30);
    expect(daysSinceInvoice('2026-04-06')).toBe(0);
    expect(daysSinceInvoice(null)).toBe(0);
  });

  it('isOverdue() detects overdue invoices', () => {
    // Overdue: 30+ days with balance
    expect(isOverdue({ date: '2026-03-01', total: 1000, paidAmount: 500 })).toBe(true);
    
    // Not overdue: less than 30 days
    expect(isOverdue({ date: '2026-04-01', total: 1000, paidAmount: 500 })).toBe(false);
    
    // Not overdue: fully paid
    expect(isOverdue({ date: '2026-03-01', total: 1000, paidAmount: 1000 })).toBe(false);
    
    // Not overdue: no balance
    expect(isOverdue({ date: '2026-03-01', total: 0, paidAmount: 0 })).toBe(false);
  });
});

describe('Debounce Function', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces function calls', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn('a');
    debouncedFn('b');
    debouncedFn('c');

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('resets timer on each call', () => {
    const fn = vi.fn();
    const debouncedFn = debounce(fn, 100);

    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn();
    vi.advanceTimersByTime(50);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('Action Rate Limiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows first action', () => {
    expect(canPerformAction('test-action')).toBe(true);
  });

  it('blocks rapid repeated actions', () => {
    canPerformAction('rapid-test');
    expect(canPerformAction('rapid-test')).toBe(false);
  });

  it('allows action after cooldown', () => {
    canPerformAction('cooldown-test');
    vi.advanceTimersByTime(1001);
    expect(canPerformAction('cooldown-test')).toBe(true);
  });

  it('tracks different actions separately', () => {
    canPerformAction('action-a');
    expect(canPerformAction('action-b')).toBe(true);
  });
});
