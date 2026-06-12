// ── Dashboard Page ────────────────────────────────────────────────────────────
// Main dashboard with analytics, alerts, and revenue reports

import React, { useState, useMemo } from 'react';
import { Badge } from '../components/UIComponents';
import { ExpiringBatchesPanel } from '../components/BatchComponents';
import { 
  fmtCurrency, 
  fmtDate, 
  today, 
  daysUntilExpiry, 
  daysSinceInvoice,
  isOverdue,
  num, lineBase, invoiceCOGS
} from '../utils/helpers';

export function Dashboard({
  items,
  customers,
  invoices,
  purchases,
  activity,
  setPage,
  setItemsStockFilter,
  backupStatus,
  onExportBackup,
  onDismissBackupReminder,
  storeInfo,
}) {
  const lowStock = items.filter((i) => (i.minStock || 0) > 0 && i.stock <= (i.minStock || 0));
  const expiring = items.filter((i) => { 
    const d = daysUntilExpiry(i.expiryDate); 
    return d !== null && d <= 60; 
  });
  const expired = expiring.filter((i) => daysUntilExpiry(i.expiryDate) < 0);
  const soonExpire = expiring.filter((i) => daysUntilExpiry(i.expiryDate) >= 0);
  
  // ✅ Overdue invoices — balance unpaid for 30+ days
  const overdueInvoices = invoices.filter(isOverdue);
  const [rf, setRf] = useState("all");
  const [cf, setCf] = useState(""); 
  const [ct, setCt] = useState("");
  const todayStr = today(); 
  const thisMonth = todayStr.slice(0, 7);
  
  // Helper to extract date part from various formats: "YYYY-MM-DD", "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DDTHH:mm:ss"
  const getDatePart = (dateStr) => {
    if (!dateStr) return "";
    return dateStr.split(" ")[0].split("T")[0]; // Handle both space and T separators
  };
  
  const fi = useMemo(() => {
    if (rf === "today") {
      return invoices.filter((i) => getDatePart(i.date) === todayStr);
    }
    if (rf === "month") {
      return invoices.filter((i) => getDatePart(i.date).startsWith(thisMonth));
    }
    if (rf === "custom" && cf && ct) {
      return invoices.filter((i) => {
        const d = getDatePart(i.date);
        return d >= cf && d <= ct;
      });
    }
    return invoices;
  }, [invoices, rf, cf, ct, todayStr, thisMonth]);
  
  const rev = fi.reduce((s, i) => s + i.total, 0);
  const purTotal = (purchases || []).reduce((s, i) => s + i.total, 0);
  
  // ✅ Enhanced Analytics
  // Top 50 customers by revenue
  const topCustomers = useMemo(() => {
    const custRevenue = {};
    invoices.forEach((inv) => {
      const custId = inv.customerId;
      if (custId != null) {
        custRevenue[custId] = (custRevenue[custId] || 0) + inv.total;
      }
    });
    return Object.entries(custRevenue)
      .map(([id, revenue]) => {
        const cust = customers.find((c) => String(c.id) === String(id));
        return { id, name: cust?.name || "Unknown", revenue };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 50);
  }, [invoices, customers]);
  
  // ✅ All Items by Sales (quantity sold & revenue)
  const topSellingItems = useMemo(() => {
    const itemStats = {};
    invoices.forEach((inv) => {
      (inv.items || []).forEach((line) => {
        const itemId = line.itemId;
        if (itemId != null) {
          if (!itemStats[itemId]) {
            itemStats[itemId] = { qty: 0, revenue: 0 };
          }
          itemStats[itemId].qty += line.qty || 0;
          const lineBase = (line.qty || 0) * (line.price || 0) * (1 - (line.discount || 0) / 100);
          const lineTax = lineBase * (((line.cgst || 0) + (line.sgst || 0)) / 100);
          itemStats[itemId].revenue += lineBase + lineTax;
        }
      });
    });
    return Object.entries(itemStats)
      .map(([id, stats]) => {
        const item = items.find((i) => String(i.id) === String(id));
        return { id, name: item?.name || "Unknown Item", category: item?.category || "", qty: stats.qty, revenue: stats.revenue };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [invoices, items]);
  
  // Payment collection trend (last 7 days)
  const paymentTrend = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayLabel = d.toLocaleDateString("en-IN", { weekday: "short" });
      
      let collected = 0;
      invoices.forEach((inv) => {
        (inv.payments || []).forEach((p) => {
          if (p.date && p.date.startsWith(dateStr)) {
            collected += p.amount;
          }
        });
      });
      
      days.push({ date: dateStr, day: dayLabel, amount: collected });
    }
    return days;
  }, [invoices]);
  
  // Inventory value summary — valued at COST (purchase price), not selling
  // price, so it reflects the asset value of stock on hand. Falls back to
  // selling price only if no purchase price is recorded.
  const inventoryValue = useMemo(() => {
    const totalValue = items.reduce((s, i) => s + (num(i.purchasePrice) || num(i.price)) * num(i.stock), 0);
    const totalItems = items.reduce((s, i) => s + num(i.stock), 0);
    return { totalValue, totalItems, avgPrice: totalItems > 0 ? totalValue / totalItems : 0 };
  }, [items]);
  
  // Payment method breakdown (Cash vs UPI)
  const paymentMethodStats = useMemo(() => {
    let cash = 0, upi = 0, other = 0;
    invoices.forEach((inv) => {
      (inv.payments || []).forEach((p) => {
        if (p.method === "upi") upi += p.amount;
        else if (p.method === "cash" || !p.method) cash += p.amount;
        else other += p.amount;
      });
    });
    return { cash, upi, other, total: cash + upi + other };
  }, [invoices]);
  
  // Profit margin (filtered by same date range as revenue)
  const filteredPurchases = useMemo(() => {
    if (rf === "today") {
      return (purchases || []).filter((p) => {
        const purchaseDate = (p.date || "").split("T")[0];
        return purchaseDate === todayStr;
      });
    }
    if (rf === "month") {
      return (purchases || []).filter((p) => {
        const purchaseDate = (p.date || "").split("T")[0];
        return purchaseDate.startsWith(thisMonth);
      });
    }
    if (rf === "custom" && cf && ct) {
      return (purchases || []).filter((p) => {
        const purchaseDate = (p.date || "").split("T")[0];
        return purchaseDate >= cf && purchaseDate <= ct;
      });
    }
    return purchases || [];
  }, [purchases, rf, cf, ct, todayStr, thisMonth]);
  
  const filteredPurTotal = filteredPurchases.reduce((s, p) => s + num(p.total), 0);
  // Profit = taxable sales − cost of goods SOLD (not stock purchased), so it
  // doesn't swing with stock-up / sell-down months. COGS uses the cost frozen
  // on each invoice line, falling back to the item's current purchase price.
  const itemCostById = useMemo(() => {
    const m = {};
    (items || []).forEach((it) => { m[String(it.id)] = num(it.purchasePrice); });
    return m;
  }, [items]);
  const revTaxable = fi.reduce((s, i) => s + (i.subtotal != null ? num(i.subtotal) : (i.items || []).reduce((a, l) => a + lineBase(l), 0)), 0);
  const cogs = fi.reduce((s, i) => s + invoiceCOGS(i, (l) => itemCostById[String(l.itemId)] || 0), 0);
  const profit = revTaxable - cogs;
  const profitMargin = revTaxable > 0 ? ((profit / revTaxable) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold page-title flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
          <rect x="3" y="3" width="7" height="7"></rect>
          <rect x="14" y="3" width="7" height="7"></rect>
          <rect x="14" y="14" width="7" height="7"></rect>
          <rect x="3" y="14" width="7" height="7"></rect>
        </svg>
        Dashboard
      </h1>

      {/* ── Expiring Batches Alert ── */}
      {storeInfo?.features?.batch_tracking !== false && <ExpiringBatchesPanel items={items} daysAhead={30} />}

      {/* ── Expiry Alerts ── */}
      {expired.length > 0 && (
        <div className="border border-red-800/30 rounded-xl p-4 flex items-start gap-3" style={{ background: "linear-gradient(135deg,rgba(239,68,68,.07),rgba(220,38,38,.04))" }} role="alert">
          <span className="text-lg" aria-hidden="true">⛔</span>
          <div>
            <p className="font-semibold text-red-400 text-sm">Expired Products — {expired.length} item{expired.length > 1 ? "s" : ""} past expiry date</p>
            <p className="text-red-400 text-xs mt-1">{expired.map((i) => `${i.name} (expired ${fmtDate(i.expiryDate)})`).join(" · ")}</p>
          </div>
        </div>
      )}
      {soonExpire.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl p-4 flex items-start gap-3" role="alert">
          <span className="text-amber-500 text-lg" aria-hidden="true">🕐</span>
          <div>
            <p className="font-semibold text-amber-400 text-sm">Expiring Soon — {soonExpire.length} item{soonExpire.length > 1 ? "s" : ""} expiring within 60 days</p>
            <p className="text-amber-400 text-xs mt-1">{soonExpire.map((i) => `${i.name} (${daysUntilExpiry(i.expiryDate)}d — ${fmtDate(i.expiryDate)})`).join(" · ")}</p>
          </div>
        </div>
      )}

      {/* ── Backup Status Good ── */}
      {backupStatus && backupStatus.status === 'good' && (
        <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-xl p-3 flex items-center gap-3">
          <span className="text-lg" aria-hidden="true">✅</span>
          <p className="text-emerald-400 text-sm">{backupStatus.message}</p>
          <button 
            onClick={onExportBackup}
            className="ml-auto px-3 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 text-xs font-medium rounded-lg transition-colors"
          >
            Export Again
          </button>
        </div>
      )}

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-6 gap-4">
        {[
          { l: "Total Items", v: items.length, i: "📦", g: "from-blue-400 to-blue-600", page: "items", filter: null },
          { l: "Customers", v: customers.length, i: "👥", g: "from-purple-400 to-purple-600", page: "customers", filter: null },
          { l: "Invoices", v: invoices.length, i: "🧾", g: "from-amber-400 to-orange-500", page: "invoices", filter: null },
          { l: "Purchases", v: (purchases || []).length, i: "🛒", g: "from-cyan-400 to-teal-600", page: "purchases", filter: null },
          { l: "Low Stock", v: lowStock.length, i: "⚠️", g: "from-red-400 to-red-600", page: "items", filter: "lowStock" },
          { l: "Overdue >30d", v: overdueInvoices.length, i: "💰", g: "from-violet-400 to-purple-600", page: "invoices", filter: null },
        ].map((s) => (
          <button 
            key={s.l} 
            className="card p-4 cursor-pointer hover:scale-105 hover:shadow-lg transition-all duration-200 flex flex-col items-center text-center"
            onClick={() => {
              if (s.filter) setItemsStockFilter(s.filter);
              else setItemsStockFilter("all");
              setPage(s.page);
            }}
            aria-label={`${s.l}: ${s.v}. Click to view details.`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3 shadow-md bg-gradient-to-br ${s.g}`} aria-hidden="true">{s.i}</div>
            <div className="text-2xl font-bold text-emerald-100">{s.v}</div>
            <div className="text-xs text-emerald-500/50 mt-0.5 font-medium">{s.l}</div>
          </button>
        ))}
      </div>

      {/* ── Revenue Report ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="font-bold text-emerald-200">Revenue Report</h2>
            <p className="text-xs text-emerald-500/50 mt-0.5">
              {rf === "today" ? `Today · ${todayStr}` : rf === "month" ? `Month · ${thisMonth}` : rf === "custom" && cf && ct ? `${cf} → ${ct}` : "All Time"}
            </p>
          </div>
          <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Date range filter">
            {[["today", "Today"], ["month", "This Month"], ["custom", "Custom"], ["all", "All Time"]].map(([id, lb]) => (
              <button 
                key={id} 
                onClick={() => setRf(id)} 
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${rf === id ? "text-white shadow-md" : "bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/30"}`} 
                style={rf === id ? { background: "linear-gradient(135deg,#059669,#4f46e5)" } : {}}
                aria-pressed={rf === id}
              >
                {lb}
              </button>
            ))}
          </div>
        </div>
        {rf === "custom" && (
          <div className="flex gap-3 mb-4 p-3 bg-emerald-900/20 rounded-xl border border-emerald-700/20">
            <div className="flex items-center gap-2">
              <label htmlFor="date-from" className="text-xs text-emerald-400 font-semibold">From</label>
              <input id="date-from" type="date" value={cf} onChange={(e) => setCf(e.target.value)} className="border border-emerald-700/30 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30" />
            </div>
            <span className="text-emerald-300 font-bold self-center" aria-hidden="true">→</span>
            <div className="flex items-center gap-2">
              <label htmlFor="date-to" className="text-xs text-emerald-400 font-semibold">To</label>
              <input id="date-to" type="date" value={ct} onChange={(e) => setCt(e.target.value)} className="border border-emerald-700/30 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30" />
            </div>
          </div>
        )}
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl font-bold page-title">{fmtCurrency(rev)}</div>
            <div className="text-sm text-emerald-500/50 mt-1">{fi.length} invoice{fi.length !== 1 ? "s" : ""}</div>
          </div>
          {fi.length > 0 && (
            <div className="text-right bg-emerald-900/20 px-4 py-2 rounded-xl border border-emerald-700/20">
              <div className="text-xs text-emerald-500/50">Avg per invoice</div>
              <div className="text-lg font-bold text-emerald-400">{fmtCurrency(rev / fi.length)}</div>
            </div>
          )}
        </div>
      </div>
      
      {/* ✅ Profit Margin & Financial Summary - Uses same date filter as Revenue Report */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-emerald-200">💰 Financial Summary</h2>
            <p className="text-xs text-emerald-500/50 mt-0.5">
              {rf === "today" ? `Today · ${todayStr}` : rf === "month" ? `Month · ${thisMonth}` : rf === "custom" && cf && ct ? `${cf} → ${ct}` : "All Time"}
              {fi.length === 0 && rf !== "all" && <span className="text-amber-400 ml-2">— No data for this period</span>}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
        <div className="card p-4 flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3 shadow-md bg-gradient-to-br from-emerald-400 to-emerald-600" aria-hidden="true">💰</div>
          <div className="text-2xl font-bold text-emerald-100">{fmtCurrency(rev)}</div>
          <div className="text-xs text-emerald-500/50 mt-0.5 font-medium">Total Sales</div>
        </div>
        <div className="card p-4 flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3 shadow-md bg-gradient-to-br from-cyan-400 to-cyan-600" aria-hidden="true">🛒</div>
          <div className="text-2xl font-bold text-cyan-400">{fmtCurrency(filteredPurTotal)}</div>
          <div className="text-xs text-emerald-500/50 mt-0.5 font-medium">Total Purchases</div>
        </div>
        <div className="card p-4 flex flex-col items-center text-center">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3 shadow-md bg-gradient-to-br ${profit >= 0 ? "from-green-400 to-green-600" : "from-red-400 to-red-600"}`} aria-hidden="true">📊</div>
          <div className={`text-2xl font-bold ${profit >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtCurrency(Math.abs(profit))}</div>
          <div className="text-xs text-emerald-500/50 mt-0.5 font-medium">Sales − Purchases</div>
        </div>
        <div className="card p-4 flex flex-col items-center text-center">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3 shadow-md bg-gradient-to-br ${Number(profitMargin) >= 20 ? "from-green-400 to-green-600" : Number(profitMargin) >= 0 ? "from-amber-400 to-amber-600" : "from-red-400 to-red-600"}`} aria-hidden="true">%</div>
          <div className={`text-2xl font-bold ${Number(profitMargin) >= 20 ? "text-green-400" : Number(profitMargin) >= 0 ? "text-amber-400" : "text-red-400"}`}>{profitMargin}%</div>
          <div className="text-xs text-emerald-500/50 mt-0.5 font-medium">Margin (Sales basis)</div>
        </div>
        </div>
      </div>
      
      {/* ✅ Inventory Value Summary */}
      <div className="card p-5">
        <div className="section-header -mx-5 -mt-5 mb-4" style={{ background: "linear-gradient(135deg,rgba(59,130,246,.08),rgba(37,99,235,.05))" }}>
          <h2 className="font-bold text-emerald-200">📦 Inventory Value Summary</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{fmtCurrency(inventoryValue.totalValue)}</div>
            <div className="text-xs text-emerald-500/50 mt-1">Total Inventory Value (at cost)</div>
          </div>
          <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">{inventoryValue.totalItems.toLocaleString("en-IN")}</div>
            <div className="text-xs text-emerald-500/50 mt-1">Total Stock Units</div>
          </div>
          <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-amber-400">{fmtCurrency(inventoryValue.avgPrice)}</div>
            <div className="text-xs text-emerald-500/50 mt-1">Avg Cost / Unit</div>
          </div>
        </div>
      </div>
      
      {/* ✅ Payment Collection Trend (Last 7 Days) */}
      <div className="card p-5">
        <div className="section-header -mx-5 -mt-5 mb-4" style={{ background: "linear-gradient(135deg,rgba(34,197,94,.08),rgba(22,163,74,.05))" }}>
          <h2 className="font-bold text-emerald-200">📈 Payment Collection Trend <span className="text-xs font-normal text-emerald-500/50">(Last 7 Days)</span></h2>
        </div>
        <div className="grid grid-cols-7 gap-2" role="img" aria-label="Payment collection chart for last 7 days">
          {paymentTrend.map((d, i) => {
            const maxAmount = Math.max(...paymentTrend.map((x) => x.amount), 1);
            const heightPercent = (d.amount / maxAmount) * 100;
            const isToday = d.date === todayStr;
            return (
              <div key={i} className="flex flex-col items-center">
                <div className="text-xs font-bold text-emerald-400 mb-1">{fmtCurrency(d.amount)}</div>
                <div className="w-full h-24 bg-emerald-900/30 rounded-lg flex items-end overflow-hidden">
                  <div 
                    className={`w-full rounded-t-lg transition-all ${isToday ? "bg-gradient-to-t from-emerald-500 to-emerald-400" : "bg-gradient-to-t from-emerald-700 to-emerald-600"}`}
                    style={{ height: `${Math.max(heightPercent, 5)}%` }}
                    aria-label={`${d.day}: ${fmtCurrency(d.amount)}`}
                  />
                </div>
                <div className={`text-xs mt-2 ${isToday ? "font-bold text-emerald-300" : "text-emerald-500/50"}`}>{d.day}</div>
                {isToday && <div className="text-[10px] text-emerald-400 font-semibold">TODAY</div>}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-between items-center text-xs">
          <span className="text-emerald-500/50">Total collected (7 days): <strong className="text-emerald-400">{fmtCurrency(paymentTrend.reduce((s, d) => s + d.amount, 0))}</strong></span>
          <span className="text-emerald-500/50">Daily average: <strong className="text-emerald-400">{fmtCurrency(paymentTrend.reduce((s, d) => s + d.amount, 0) / 7)}</strong></span>
        </div>
      </div>
      
      {/* ✅ Payment Methods & Top Customers */}
      <div className="grid grid-cols-2 gap-5">
        {/* Payment Methods Breakdown */}
        <div className="card p-5">
          <div className="section-header -mx-5 -mt-5 mb-4" style={{ background: "linear-gradient(135deg,rgba(16,185,129,.08),rgba(5,150,105,.05))" }}>
            <h2 className="font-bold text-emerald-200">💳 Payment Methods Breakdown</h2>
          </div>
          {paymentMethodStats.total > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Cash Card */}
                <div className="p-4 rounded-xl border border-emerald-700/30 hover:scale-[1.02] transition-transform cursor-default" style={{ background: "linear-gradient(135deg,rgba(16,185,129,.1),rgba(5,150,105,.05))" }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ background: "linear-gradient(135deg,#059669,#10b981)" }} aria-hidden="true">💵</div>
                    <span className="text-sm font-bold text-emerald-300 uppercase tracking-wide">Cash</span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-xl font-bold text-emerald-100">{fmtCurrency(paymentMethodStats.cash)}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400">
                      {paymentMethodStats.total > 0 ? ((paymentMethodStats.cash / paymentMethodStats.total) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-emerald-900/40 rounded-full overflow-hidden" role="progressbar" aria-valuenow={paymentMethodStats.cash} aria-valuemax={paymentMethodStats.total}>
                    <div 
                      className="h-full rounded-full transition-all duration-500" 
                      style={{ 
                        width: `${paymentMethodStats.total > 0 ? (paymentMethodStats.cash / paymentMethodStats.total) * 100 : 0}%`,
                        background: "linear-gradient(90deg,#059669,#10b981)"
                      }} 
                    />
                  </div>
                </div>
                
                {/* UPI Card */}
                <div className="p-4 rounded-xl border border-purple-700/30 hover:scale-[1.02] transition-transform cursor-default" style={{ background: "linear-gradient(135deg,rgba(147,51,234,.1),rgba(139,92,246,.05))" }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ background: "linear-gradient(135deg,#9333ea,#a855f7)" }} aria-hidden="true">📱</div>
                    <span className="text-sm font-bold text-purple-300 uppercase tracking-wide">UPI</span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-xl font-bold text-emerald-100">{fmtCurrency(paymentMethodStats.upi)}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-600/20 text-purple-400">
                      {paymentMethodStats.total > 0 ? ((paymentMethodStats.upi / paymentMethodStats.total) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-purple-900/40 rounded-full overflow-hidden" role="progressbar" aria-valuenow={paymentMethodStats.upi} aria-valuemax={paymentMethodStats.total}>
                    <div 
                      className="h-full rounded-full transition-all duration-500" 
                      style={{ 
                        width: `${paymentMethodStats.total > 0 ? (paymentMethodStats.upi / paymentMethodStats.total) * 100 : 0}%`,
                        background: "linear-gradient(90deg,#9333ea,#a855f7)"
                      }} 
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-3 border-t border-emerald-700/30">
                <span className="text-sm text-emerald-500/60 font-medium">Total Collected</span>
                <span className="text-lg font-bold text-emerald-300">{fmtCurrency(paymentMethodStats.total)}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-900/30 flex items-center justify-center text-3xl mb-3" aria-hidden="true">💳</div>
              <p className="text-emerald-500/50 text-sm">No payments recorded yet</p>
            </div>
          )}
        </div>
        
        {/* Top 50 Customers by Revenue */}
        <div className="card p-5">
          <div className="section-header -mx-5 -mt-5 mb-4" style={{ background: "linear-gradient(135deg,rgba(168,85,247,.08),rgba(139,92,246,.05))" }}>
            <h2 className="font-bold text-emerald-200">🏆 Top 50 Customers by Revenue</h2>
          </div>
          {topCustomers.length > 0 ? (
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {topCustomers.map((c, i) => {
                const maxRev = topCustomers[0]?.revenue || 1;
                return (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0 ${i === 0 ? "bg-amber-500 text-amber-900" : i === 1 ? "bg-gray-300 text-gray-700" : i === 2 ? "bg-amber-700 text-amber-100" : "bg-emerald-900/40 text-emerald-400"}`} aria-label={`Rank ${i + 1}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-semibold text-emerald-200 truncate">{c.name}</span>
                        <span className="text-sm font-bold text-emerald-400 flex-shrink-0 ml-2">{fmtCurrency(c.revenue)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-emerald-900/30 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${i === 0 ? "bg-amber-500" : i === 1 ? "bg-gray-400" : i === 2 ? "bg-amber-700" : "bg-purple-500"}`} style={{ width: `${(c.revenue / maxRev) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-emerald-500/50 text-sm">No customer data available</p>
          )}
        </div>
      </div>
      
      {/* ✅ All Selling Items */}
      <div className="card p-5">
        <div className="section-header -mx-5 -mt-5 mb-4" style={{ background: "linear-gradient(135deg,rgba(59,130,246,.08),rgba(37,99,235,.05))" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-emerald-200">📦 All Selling Items</h2>
            <span className="text-xs font-semibold text-emerald-400 bg-emerald-900/40 px-2 py-1 rounded-lg">{topSellingItems.length} items</span>
          </div>
        </div>
        {topSellingItems.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="thead-sticky">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-bold text-emerald-500/50 uppercase">#</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-emerald-500/50 uppercase">Item Name</th>
                    <th className="text-left px-3 py-2 text-xs font-bold text-emerald-500/50 uppercase">Category</th>
                    <th className="text-right px-3 py-2 text-xs font-bold text-emerald-500/50 uppercase">Qty Sold</th>
                    <th className="text-right px-3 py-2 text-xs font-bold text-emerald-500/50 uppercase">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-800/30">
                  {topSellingItems.map((item, i) => (
                    <tr key={item.id} className="hover:bg-emerald-800/20">
                      <td className="px-3 py-2">
                        <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-amber-500 text-amber-900" : i === 1 ? "bg-gray-300 text-gray-700" : i === 2 ? "bg-amber-700 text-amber-100" : "bg-emerald-900/40 text-emerald-400"}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-semibold text-emerald-200">{item.name}</td>
                      <td className="px-3 py-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400">{item.category || "—"}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-blue-400">{item.qty.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-400">{fmtCurrency(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-900/30 flex items-center justify-center text-3xl mb-3" aria-hidden="true">📦</div>
            <p className="text-emerald-500/50 text-sm">No sales data available</p>
          </div>
        )}
      </div>
      
      {/* ── Bottom Panels ── */}
      <div className="grid grid-cols-2 gap-5">
        {/* Low Stock Items */}
        <div className="card p-5 flex flex-col" style={{ maxHeight: 380 }}>
          <div className="section-header -mx-5 -mt-5 mb-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-emerald-200">Low Stock Items <span className="text-xs font-normal text-emerald-500/60">({lowStock.length})</span></h2>
              {lowStock.length > 0 && (
                <button onClick={() => { setItemsStockFilter("lowStock"); setPage("items"); }} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">View all →</button>
              )}
            </div>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-emerald-500/50 text-sm">All items well stocked ✓</p>
          ) : (
            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              {lowStock.map((i) => (
                <div key={i.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-emerald-100">{i.name}</p>
                    <p className="text-xs text-emerald-500/50">{i.category} · Min:{i.minStock}</p>
                  </div>
                  <Badge color={i.stock === 0 ? "red" : "yellow"}>{i.stock} left</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Expiring Items */}
        <div className="card p-5 flex flex-col" style={{ maxHeight: 380 }}>
          <div className="section-header -mx-5 -mt-5 mb-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-emerald-200">Expiring Items <span className="text-xs font-normal text-emerald-500/60">({expiring.length})</span></h2>
              {expiring.length > 0 && (
                <button onClick={() => setPage("items")} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">View all →</button>
              )}
            </div>
          </div>
          {expiring.length === 0 ? (
            <p className="text-emerald-500/50 text-sm">No items expiring within 60 days ✓</p>
          ) : (
            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              {expiring.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)).map((i) => {
                const d = daysUntilExpiry(i.expiryDate);
                return (
                  <div key={i.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-emerald-100">{i.name}</p>
                      <p className="text-xs text-emerald-500/50">{fmtDate(i.expiryDate)}</p>
                    </div>
                    <Badge color={d < 0 ? "red" : d <= 30 ? "red" : "yellow"}>{d < 0 ? "Expired" : `${d}d`}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Overdue Balances */}
        <div className="card p-5 flex flex-col" style={{ maxHeight: 380 }}>
          <div className="section-header -mx-5 -mt-5 mb-4" style={{ background: "linear-gradient(135deg,rgba(147,51,234,.08),rgba(109,40,217,.05))" }}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-emerald-200">💰 Overdue Balances <span className="text-xs font-normal text-purple-400">(unpaid &gt;30 days · {overdueInvoices.length})</span></h2>
              {overdueInvoices.length > 0 && (
                <button onClick={() => setPage("invoices")} className="text-xs font-semibold text-purple-300 hover:text-purple-200">View all →</button>
              )}
            </div>
          </div>
          {overdueInvoices.length === 0 ? (
            <p className="text-emerald-500/50 text-sm">No overdue balances ✓</p>
          ) : (
            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              {overdueInvoices.map((inv) => {
                const cust = inv.customerId != null ? customers.find((c) => String(c.id) === String(inv.customerId)) : null;
                const balance = inv.total - (inv.paidAmount || 0);
                const days = daysSinceInvoice(inv.date);
                return (
                  <div key={inv.id} className="flex items-center justify-between p-2 bg-purple-900/20 rounded-xl border border-purple-800/30">
                    <div>
                      <p className="text-sm font-semibold text-emerald-100">{cust?.name || inv.customerName || "Unknown"}</p>
                      <p className="text-xs text-emerald-500/50">{inv.id} · Invoice date: {fmtDate(inv.date)}</p>
                      <p className="text-xs text-purple-400 font-semibold mt-0.5">{days} days overdue{cust?.phone ? ` · 📞 ${cust.phone}` : ""}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-400">₹{balance.toLocaleString("en-IN")}</p>
                      <p className="text-xs text-emerald-500/50">balance due</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card p-5 flex flex-col" style={{ maxHeight: 380 }}>
          <div className="section-header -mx-5 -mt-5 mb-4">
            <h2 className="font-bold text-emerald-200">Recent Activity <span className="text-xs font-normal text-emerald-500/60">({activity.length})</span></h2>
          </div>
          {activity.length === 0 ? (
            <p className="text-emerald-500/50 text-sm">No recent activity</p>
          ) : (
            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              {activity.map((a) => (
                <div key={a.id} className="flex items-start gap-2.5">
                  <span className="text-base mt-0.5" aria-hidden="true">{a.type === "invoice" ? "🧾" : a.type === "stock" ? "📦" : "👤"}</span>
                  <div>
                    <p className="text-sm text-emerald-200">{a.text}</p>
                    <p className="text-xs text-emerald-500/50">{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
