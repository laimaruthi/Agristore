// ── Unit tests for money math (helpers.js) ──────────────────────────────────
// These guard the calculation layer used by invoices, purchases, dashboard,
// and reports: line base/tax/total, rounding, cost-of-goods, and the
// NaN-safe currency formatter.
import { describe, it, expect } from 'vitest';
import {
  num, round2, fmtCurrency,
  lineBase, lineTax, lineTotal, lineCost, invoiceCOGS,
} from '../utils/helpers';

describe('num (numeric coercion guard)', () => {
  it('passes through finite numbers and numeric strings', () => {
    expect(num(5)).toBe(5);
    expect(num(-2.5)).toBe(-2.5);
    expect(num('42')).toBe(42);
    expect(num('3.14')).toBeCloseTo(3.14);
  });
  it('coerces undefined / null / NaN / Infinity / junk to 0', () => {
    expect(num(undefined)).toBe(0);
    expect(num(null)).toBe(0);
    expect(num(NaN)).toBe(0);
    expect(num(Infinity)).toBe(0);
    expect(num('abc')).toBe(0);
    expect(num({})).toBe(0);
  });
});

describe('round2 (paise rounding)', () => {
  it('rounds to two decimals', () => {
    expect(round2(1.236)).toBe(1.24);
    expect(round2(1.234)).toBe(1.23);
    expect(round2(10 / 3)).toBe(3.33);
  });
  it('is FP-safe for additive drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
  it('treats junk as 0', () => {
    expect(round2(undefined)).toBe(0);
    expect(round2('x')).toBe(0);
  });
});

describe('fmtCurrency', () => {
  it('formats with Indian grouping and 2 decimals', () => {
    expect(fmtCurrency(1234567.89)).toBe('₹12,34,567.89');
    expect(fmtCurrency(0)).toBe('₹0.00');
    expect(fmtCurrency(-500)).toBe('₹-500.00');
  });
  it('clamps to 2 decimals', () => {
    expect(fmtCurrency(10.999)).toBe('₹11.00');
  });
  it('never renders NaN — undefined/null/NaN become ₹0.00', () => {
    expect(fmtCurrency(undefined)).toBe('₹0.00');
    expect(fmtCurrency(null)).toBe('₹0.00');
    expect(fmtCurrency(NaN)).toBe('₹0.00');
    expect(fmtCurrency('not a number')).toBe('₹0.00');
  });
});

describe('line-item math', () => {
  const line = { qty: 2, price: 100, discount: 10, cgst: 9, sgst: 9, cost: 60 };

  it('lineBase applies quantity, price and discount%', () => {
    expect(lineBase(line)).toBe(180); // 2 × 100 × (1 − 0.10)
    expect(lineBase({ qty: 3, price: 50, discount: 0 })).toBe(150);
  });
  it('lineTax applies (cgst + sgst)% to the base', () => {
    expect(lineTax(line)).toBeCloseTo(32.4); // 180 × 0.18
  });
  it('lineTotal = base + tax', () => {
    expect(lineTotal(line)).toBeCloseTo(212.4);
  });
  it('lineCost = qty × unit cost', () => {
    expect(lineCost(line)).toBe(120); // 2 × 60
  });
  it('coerces string fields (form inputs arrive as strings)', () => {
    expect(lineBase({ qty: '2', price: '100', discount: '10' })).toBe(180);
    expect(lineTax({ qty: '1', price: '100', cgst: '9', sgst: '9' })).toBeCloseTo(18);
  });
  it('never produces NaN when fields are missing', () => {
    expect(lineBase({})).toBe(0);
    expect(lineTax({ qty: 5, price: 10 })).toBe(0); // no gst → 0 tax, not NaN
    expect(lineTotal({ qty: 1, price: 10 })).toBe(10);
    expect(lineCost({ qty: 4 })).toBe(0); // no cost recorded
  });
});

describe('invoiceCOGS', () => {
  it('sums qty × frozen line cost', () => {
    const inv = { items: [
      { qty: 2, cost: 50 },
      { qty: 1, cost: 30 },
    ] };
    expect(invoiceCOGS(inv)).toBe(130);
  });
  it('falls back to a cost lookup for legacy lines without a frozen cost', () => {
    const inv = { items: [
      { qty: 2, cost: 50 },          // frozen → 100
      { qty: 3, itemId: 'X' },       // legacy → lookup 10 → 30
    ] };
    const lookup = (l) => (l.itemId === 'X' ? 10 : 0);
    expect(invoiceCOGS(inv, lookup)).toBe(130);
  });
  it('prefers the frozen cost over the lookup', () => {
    const inv = { items: [{ qty: 1, cost: 7, itemId: 'X' }] };
    expect(invoiceCOGS(inv, () => 999)).toBe(7);
  });
  it('treats missing cost with no lookup as 0 (not NaN)', () => {
    expect(invoiceCOGS({ items: [{ qty: 5 }] })).toBe(0);
    expect(invoiceCOGS({})).toBe(0);
    expect(invoiceCOGS(null)).toBe(0);
  });
});

describe('invoice reconciliation invariants', () => {
  // Mirrors how InvoicesPage/PurchasesPage build a saved invoice: round base
  // and tax to paise, then derive the total from them.
  const buildInvoice = (items) => {
    const sub = round2(items.reduce((s, l) => s + lineBase(l), 0));
    const tax = round2(items.reduce((s, l) => s + lineTax(l), 0));
    const total = round2(sub + tax);
    const cogs = round2(items.reduce((s, l) => s + lineCost(l), 0));
    return { items, subtotal: sub, totalTax: tax, total, cogs };
  };

  it('subtotal + totalTax always equals total exactly', () => {
    const cases = [
      [{ qty: 3, price: 33.33, discount: 0, cgst: 9, sgst: 9, cost: 20 }],
      [{ qty: 7, price: 14.99, discount: 5, cgst: 6, sgst: 6, cost: 9 },
       { qty: 2, price: 100, discount: 0, cgst: 9, sgst: 9, cost: 70 }],
      [{ qty: 1, price: 0.01, discount: 0, cgst: 2.5, sgst: 2.5, cost: 0 }],
    ];
    for (const items of cases) {
      const inv = buildInvoice(items);
      expect(round2(inv.subtotal + inv.totalTax)).toBe(inv.total);
    }
  });

  it('gross profit = taxable sales − COGS', () => {
    const inv = buildInvoice([{ qty: 4, price: 100, discount: 0, cgst: 9, sgst: 9, cost: 60 }]);
    expect(inv.subtotal).toBe(400);          // pre-tax sales
    expect(inv.cogs).toBe(240);              // 4 × 60
    expect(inv.subtotal - inv.cogs).toBe(160); // gross profit
  });
});
