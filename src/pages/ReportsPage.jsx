/**
 * Reports Page - Sales report & Profit/Loss with Excel export (manager-only)
 */
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { Badge, Btn, useToast } from "../components/UIComponents";
import { fmtCurrency, today, num, lineBase, invoiceCOGS } from "../utils/helpers";

const getDatePart = (s) => (s ? String(s).split(" ")[0].split("T")[0] : "");

export default function ReportsPage({ invoices = [], purchases = [], customers = [], items = [], otherExpenses = [] }) {
  const showToast = useToast();
  const todayStr = today();
  const thisMonth = todayStr.slice(0, 7);

  const [range, setRange] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const inRange = (dateStr) => {
    const d = getDatePart(dateStr);
    if (!d) return false;
    if (range === "today") return d === todayStr;
    if (range === "month") return d.startsWith(thisMonth);
    if (range === "custom") return from && to && d >= from && d <= to;
    return true; // "all"
  };

  const filteredInv = useMemo(() => invoices.filter((i) => inRange(i.date)), [invoices, range, from, to, todayStr, thisMonth]);
  const filteredPur = useMemo(() => purchases.filter((p) => inRange(p.date)), [purchases, range, from, to, todayStr, thisMonth]);
  const filteredExp = useMemo(() => otherExpenses.filter((e) => inRange(e.date)), [otherExpenses, range, from, to, todayStr, thisMonth]);

  // Per-item cost lookup for legacy invoices (lines without a frozen `cost`):
  // fall back to the item's current purchase price.
  const itemCostById = useMemo(() => {
    const m = {};
    (items || []).forEach((it) => { m[String(it.id)] = num(it.purchasePrice); });
    return m;
  }, [items]);
  const costLookup = (l) => itemCostById[String(l.itemId)] || 0;

  // Taxable value of an invoice (pre-GST). Prefer the stored subtotal; for very
  // old records without it, recompute from line items.
  const invTaxable = (inv) =>
    inv.subtotal != null ? num(inv.subtotal) : (inv.items || []).reduce((s, l) => s + lineBase(l), 0);

  // Sales metrics
  const salesTotal = filteredInv.reduce((s, i) => s + num(i.total), 0);       // turnover, incl. GST
  const salesTaxable = filteredInv.reduce((s, i) => s + invTaxable(i), 0);    // pre-GST sales
  const salesPaid = filteredInv.reduce((s, i) => s + num(i.paidAmount), 0);
  const salesDue = salesTotal - salesPaid;

  // Cost of goods actually SOLD (not goods purchased) — the correct basis for
  // profit. Uses the cost frozen on each invoice line at sale time.
  const cogsTotal = filteredInv.reduce((s, i) => s + invoiceCOGS(i, costLookup), 0);

  // Purchase metrics (informational — stock bought in the period, NOT COGS)
  const purTotal = filteredPur.reduce((s, p) => s + num(p.total), 0);
  const purPaid = filteredPur.reduce((s, p) => s + num(p.paidAmount), 0);
  const purDue = purTotal - purPaid;

  // Other Expenses metrics
  const expTotal = filteredExp.reduce((s, e) => s + num(e.amount), 0);

  // P&L — gross profit is tax-exclusive sales minus cost of goods sold.
  const grossProfit = salesTaxable - cogsTotal;
  const netProfit = grossProfit - expTotal;
  const cashProfit = salesPaid - purPaid - expTotal;
  const margin = salesTaxable > 0 ? (netProfit / salesTaxable) * 100 : 0;

  // Expense breakdown by category
  const expenseByCategory = useMemo(() => {
    const map = {};
    filteredExp.forEach((e) => {
      const c = e.category || "Other";
      map[c] = (map[c] || 0) + (Number(e.amount) || 0);
    });
    return Object.entries(map)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredExp]);

  // By customer
  const byCustomer = useMemo(() => {
    const map = {};
    filteredInv.forEach((inv) => {
      const cid = inv.customerId;
      if (cid == null) return;
      if (!map[cid]) map[cid] = { count: 0, total: 0, paid: 0 };
      map[cid].count += 1;
      map[cid].total += inv.total || 0;
      map[cid].paid += inv.paidAmount || 0;
    });
    return Object.entries(map)
      .map(([id, v]) => {
        const c = customers.find((x) => String(x.id) === String(id));
        return { id, name: c?.name || "Unknown", ...v, due: v.total - v.paid };
      })
      .sort((a, b) => b.total - a.total);
  }, [filteredInv, customers]);

  // By item (qty, taxable revenue, cost, profit)
  const byItem = useMemo(() => {
    const map = {};
    filteredInv.forEach((inv) => {
      (inv.items || []).forEach((line) => {
        const id = line.itemId;
        if (id == null) return;
        if (!map[id]) map[id] = { qty: 0, revenue: 0, cost: 0 };
        map[id].qty += num(line.qty);
        map[id].revenue += lineBase(line); // taxable (pre-GST) revenue
        const unit = line.cost != null ? num(line.cost) : (itemCostById[String(id)] || 0);
        map[id].cost += num(line.qty) * unit;
      });
    });
    return Object.entries(map)
      .map(([id, v]) => {
        const it = items.find((x) => String(x.id) === String(id));
        return { id, name: it?.name || "Unknown", category: it?.category || "", ...v, profit: v.revenue - v.cost };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredInv, items, itemCostById]);

  const rangeLabel = range === "today" ? todayStr
    : range === "month" ? thisMonth
    : range === "custom" && from && to ? `${from} to ${to}`
    : "All time";

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    const summary = [
      ["Report period", rangeLabel],
      [],
      ["Sales"],
      ["Invoices", filteredInv.length],
      ["Sales Total (incl. GST)", salesTotal],
      ["Sales Taxable (excl. GST)", salesTaxable],
      ["Sales Paid", salesPaid],
      ["Sales Due", salesDue],
      [],
      ["Purchases (stock bought — informational)"],
      ["Purchase Orders", filteredPur.length],
      ["Purchase Total", purTotal],
      ["Purchase Paid", purPaid],
      ["Purchase Due", purDue],
      [],
      ["Other Expenses"],
      ["Expense Records", filteredExp.length],
      ["Other Expenses Total", expTotal],
      [],
      ["Profit & Loss"],
      ["Sales (taxable)", salesTaxable],
      ["Cost of Goods Sold", -cogsTotal],
      ["Gross Profit (Sales - COGS)", grossProfit],
      ["Other Expenses", -expTotal],
      ["Net Profit (Gross Profit - Other Expenses)", netProfit],
      ["Cash Profit (Paid Sales - Paid Purchases - Expenses)", cashProfit],
      ["Margin %", Number(margin.toFixed(2))],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

    const invRows = filteredInv.map((i) => {
      const c = customers.find((x) => String(x.id) === String(i.customerId));
      return {
        "Invoice ID": i.id,
        Date: getDatePart(i.date),
        Customer: c?.name || "Unknown",
        Total: i.total || 0,
        Paid: i.paidAmount || 0,
        Due: (i.total || 0) - (i.paidAmount || 0),
        Status: i.status || "",
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invRows), "Invoices");

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(byCustomer.map((c) => ({ Customer: c.name, Invoices: c.count, Total: c.total, Paid: c.paid, Due: c.due }))),
      "By Customer"
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(byItem.map((i) => ({ Item: i.name, Category: i.category, Qty: i.qty, "Revenue (taxable)": Number(i.revenue.toFixed(2)), Cost: Number(i.cost.toFixed(2)), Profit: Number(i.profit.toFixed(2)) }))),
      "By Item"
    );

    // Full master lists — useful for reconciliation even if they had no activity in the period
    const allCustomersSheet = (customers || []).map((c) => ({
      Name: c.name || "",
      Phone: c.phone || "",
      Email: c.email || "",
      Address: c.address || "",
      GSTIN: c.gstin || "",
      Balance: Number(c.balance || 0),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allCustomersSheet), "Customers (All)");

    const allItemsSheet = (items || []).map((i) => ({
      Name: i.name || "",
      Category: i.category || "",
      HSN: i.hsnCode || "",
      Unit: i.unit || "",
      Stock: i.stock || 0,
      MinStock: i.minStock || 0,
      SellPrice: Number(i.price || 0),
      PurchasePrice: Number(i.purchasePrice || 0),
      ExpiryDate: i.expiryDate || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allItemsSheet), "Items (All)");

    const purRows = filteredPur.map((p) => ({
      "Purchase ID": p.id,
      Date: getDatePart(p.date),
      Total: p.total || 0,
      Paid: p.paidAmount || 0,
      Due: (p.total || 0) - (p.paidAmount || 0),
      Status: p.status || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purRows), "Purchases");

    // Other Expenses detail + by category
    const expRows = filteredExp.map((e) => ({
      Date: getDatePart(e.date),
      Category: e.category || "",
      Description: e.description || "",
      "Payment Mode": e.paymentMode || "",
      Amount: Number(e.amount) || 0,
      Notes: e.notes || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), "Other Expenses");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(expenseByCategory.map((c) => ({ Category: c.category, Amount: c.amount }))),
      "Expenses By Category"
    );

    XLSX.writeFile(wb, `report_${rangeLabel.replace(/\s+/g, "_")}.xlsx`);
    showToast("Report exported", "success");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-emerald-100 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
              <line x1="3" y1="20" x2="21" y2="20"></line>
            </svg><span className="page-title">Reports</span>
          </h1>
          <div className="text-xs text-emerald-500/50 mt-1">Period: {rangeLabel}</div>
        </div>
        <Btn onClick={exportExcel} variant="primary">⬇ Export Excel</Btn>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["today", "month", "custom", "all"].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${range === r ? "bg-emerald-600 text-white" : "bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50"}`}
          >
            {r === "today" ? "Today" : r === "month" ? "This Month" : r === "custom" ? "Custom" : "All Time"}
          </button>
        ))}
        {range === "custom" && (
          <div className="flex gap-2 items-center">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1.5 rounded-lg bg-emerald-900/30 text-emerald-200 text-sm border border-emerald-700/30" />
            <span className="text-emerald-500 text-sm">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1.5 rounded-lg bg-emerald-900/30 text-emerald-200 text-sm border border-emerald-700/30" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <KPI label="Sales Total" value={fmtCurrency(salesTotal)} sub={`${filteredInv.length} invoices`} />
        <KPI label="Sales Paid" value={fmtCurrency(salesPaid)} sub={`Due ${fmtCurrency(salesDue)}`} />
        <KPI label="Purchases" value={fmtCurrency(purTotal)} sub={`${filteredPur.length} orders`} />
        <KPI label="Other Expenses" value={fmtCurrency(expTotal)} sub={`${filteredExp.length} records`} tone="red" />
        <KPI label="Net Profit" value={fmtCurrency(netProfit)} sub={`Margin ${margin.toFixed(1)}%`} tone={netProfit >= 0 ? "green" : "red"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Profit & Loss">
          <Row label="Sales (taxable)" value={fmtCurrency(salesTaxable)} />
          <Row label="Cost of Goods Sold" value={`- ${fmtCurrency(cogsTotal)}`} />
          <Row label="Gross Profit" value={fmtCurrency(grossProfit)} bold tone={grossProfit >= 0 ? "green" : "red"} />
          <div className="h-px bg-emerald-900/30 my-2" />
          <Row label="Other Expenses" value={`- ${fmtCurrency(expTotal)}`} />
          <Row label="Net Profit" value={fmtCurrency(netProfit)} bold tone={netProfit >= 0 ? "green" : "red"} />
          <div className="h-px bg-emerald-900/30 my-2" />
          <Row label="Cash Collected (sales)" value={fmtCurrency(salesPaid)} />
          <Row label="Cash Paid (purchases + expenses)" value={`- ${fmtCurrency(purPaid + expTotal)}`} />
          <Row label="Cash Profit" value={fmtCurrency(cashProfit)} bold tone={cashProfit >= 0 ? "green" : "red"} />
          <div className="text-[11px] text-emerald-500/50 mt-2 leading-snug">
            Profit is sales minus the cost of goods actually sold (not stock purchased). Purchases this period: {fmtCurrency(purTotal)}.
          </div>
        </Card>

        <Card title="Top Customers">
          {byCustomer.length === 0 ? (
            <div className="text-emerald-500/50 text-sm py-4">No sales in this period.</div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-emerald-300 uppercase border-b border-emerald-700/30 sticky top-0 t-card-bg z-10">
                  <tr><th className="text-left py-2">Customer</th><th className="text-right">Invoices</th><th className="text-right">Total</th><th className="text-right">Due</th></tr>
                </thead>
                <tbody>
                  {byCustomer.map((c) => (
                    <tr key={c.id} className="border-b border-emerald-700/20">
                      <td className="py-2 text-emerald-200">{c.name}</td>
                      <td className="text-right text-emerald-400">{c.count}</td>
                      <td className="text-right text-emerald-300">{fmtCurrency(c.total)}</td>
                      <td className="text-right"><Badge color={c.due > 0 ? "orange" : "green"}>{fmtCurrency(c.due)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Top Items Sold">
        {byItem.length === 0 ? (
          <div className="text-emerald-500/50 text-sm py-4">No items sold in this period.</div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-emerald-300 uppercase border-b border-emerald-700/30 sticky top-0 t-card-bg z-10">
                <tr><th className="text-left py-2">Item</th><th className="text-left">Category</th><th className="text-right">Qty</th><th className="text-right">Revenue</th><th className="text-right">Profit</th></tr>
              </thead>
              <tbody>
                {byItem.map((i) => (
                  <tr key={i.id} className="border-b border-emerald-700/20">
                    <td className="py-2 text-emerald-200">{i.name}</td>
                    <td className="text-emerald-500/50">{i.category || "—"}</td>
                    <td className="text-right text-emerald-400">{i.qty}</td>
                    <td className="text-right text-emerald-300">{fmtCurrency(i.revenue)}</td>
                    <td className={`text-right ${i.profit >= 0 ? "text-emerald-300" : "text-red-400"}`}>{fmtCurrency(i.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function KPI({ label, value, sub, tone }) {
  const color = tone === "red" ? "text-red-400" : tone === "green" ? "text-emerald-300" : "text-emerald-100";
  return (
    <div className="card p-4">
      <div className="text-xs text-emerald-300 font-medium uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-emerald-400 mt-1">{sub}</div>}
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="card p-4">
      <div className="text-sm font-bold text-emerald-100 mb-3">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, bold, tone }) {
  const color = tone === "red" ? "text-red-400" : tone === "green" ? "text-emerald-300" : "text-emerald-200";
  return (
    <div className={`flex justify-between py-1.5 ${bold ? "text-base" : "text-sm"}`}>
      <span className="text-emerald-300">{label}</span>
      <span className={`${bold ? "font-bold" : ""} ${color}`}>{value}</span>
    </div>
  );
}
