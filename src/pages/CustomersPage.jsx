// ── Customers Page ────────────────────────────────────────────────────────────
// Customer management with CRUD, import/export, and history

import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Modal, 
  Input, 
  Btn, 
  Badge,
  useToast,
  RecordPaymentModal,
} from '../components/UIComponents';
import { Pagination } from '../components/Pagination';
import { Alert } from '../components/Alert';
import { Icon } from '../components/Icon';
import { usePagination } from '../hooks';
import { 
  fmtCurrency,
  fmtDate, 
  fmtDateTime,
  nowTimestamp,
  newId, 
  daysSinceInvoice, 
  isOverdue, 
  exportCSV 
} from '../utils/helpers';

export function CustomersPage({ 
  customers, 
  setCustomers, 
  invoices, 
  setInvoices, 
  setInvoiceState, 
  setPage, 
  user, 
  addActivity 
}) {
  const [search, setSearch] = useState("");
  const [dueFilter, setDueFilter] = useState("all"); // all, withDue, noDue
  const [overdueFilter, setOverdueFilter] = useState("all"); // all, overdue, none
  const [deliveryFilter, setDeliveryFilter] = useState("all"); // all, pending, done
  const [sortBy, setSortBy] = useState("name"); // name, recent, due, oldest
  const [expandedId, setExpandedId] = useState(null);
  const [quickPayCustomer, setQuickPayCustomer] = useState(null);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [histPayModal, setHistPayModal] = useState(null);
  const showToast = useToast();

  // ✅ Helper to calculate customer due
  const getCustomerDue = (customerId) => {
    const custInvoices = (invoices || []).filter((inv) => inv.customerId === customerId);
    return custInvoices.reduce((s, inv) => s + (inv.total - (inv.paidAmount || 0)), 0);
  };

  // Record payment from inside history modal
  const recordHistPayment = (invoiceId, amount, method = "cash") => {
    // ✅ Defensive validation
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) {
      showToast("Invalid payment amount", "error");
      return;
    }
    const target = (invoices || []).find((i) => i.id === invoiceId);
    if (!target) { showToast("Invoice not found", "error"); return; }
    const balance = Math.max(0, (target.total || 0) - (target.paidAmount || 0));
    if (balance <= 0) { showToast("Already fully paid", "info"); return; }
    // ✅ Clamp at remaining balance to prevent overpayment
    const safeAmt = Math.min(amt, balance);

    setInvoices((prev) => prev.map((inv) => {
      if (inv.id !== invoiceId) return inv;
      // ✅ Round to 2 decimals to avoid floating-point "99.99 ≠ 100" bug
      const newPaid = Math.round(((inv.paidAmount || 0) + safeAmt) * 100) / 100;
      const newStatus = newPaid + 0.005 >= (inv.total || 0) ? "paid" : newPaid > 0 ? "partial" : "pending";
      const newPayment = { date: nowTimestamp(), amount: safeAmt, method, note: "Payment received", recordedBy: "" };
      addActivity(`Payment ₹${safeAmt.toLocaleString("en-IN")} (${method.toUpperCase()}) recorded for ${invoiceId}`, "invoice");
      return { ...inv, paidAmount: newPaid, status: newStatus, payments: [...(inv.payments || []), newPayment] };
    }));
    setHistPayModal(null);
    showToast(`Payment ₹${safeAmt.toLocaleString("en-IN")} recorded successfully`, "success");
  };

  // Navigate to invoice detail in Invoices page
  const goToInvoice = (inv) => {
    setInvoiceState((s) => ({ ...s, view: "detail", selected: inv }));
    setPage("invoices");
    setModal(null);
  };
  
  const blank = () => ({ name: "", aadhar: "", phone: "", email: "", address: "", gstin: "", creditLimit: "" });
  const [form, setForm] = useState(blank());
  const [errors, setErrors] = useState({});
  const csvRef = useRef(null);
  const xlsxRef = useRef(null);
  const [xlsxPreview, setXlsxPreview] = useState(null);
  const canEdit = true;

  // Annotated customers: single pass to compute all per-customer aggregates
  const annotated = useMemo(() => {
    return customers.map((c) => {
      const myInvs = (invoices || []).filter((inv) => inv.customerId === c.id);
      let totalDue = 0;
      const overdueInvs = [];
      let overdueBalance = 0;
      let oldestDays = 0;
      let hasPendingDelivery = false;
      let lastVisit = null;
      myInvs.forEach((inv) => {
        const bal = (inv.total || 0) - (inv.paidAmount || 0);
        if (bal > 0) totalDue += bal;
        if (isOverdue(inv)) {
          overdueInvs.push(inv);
          overdueBalance += bal;
          const d = daysSinceInvoice(inv.date);
          if (d > oldestDays) oldestDays = d;
        }
        if (Array.isArray(inv.items) && inv.items.some((l) => !l.delivered)) hasPendingDelivery = true;
        if (inv.date && (!lastVisit || inv.date > lastVisit)) lastVisit = inv.date;
      });
      return { ...c, _myInvs: myInvs, _totalDue: totalDue, _overdueInvs: overdueInvs, _overdueBalance: overdueBalance, _oldestDays: oldestDays, _hasPendingDelivery: hasPendingDelivery, _lastVisit: lastVisit };
    });
  }, [customers, invoices]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const qNoSpace = search.replace(/\s/g, "");
    return annotated.filter((c) => {
      const searchMatch = c.name.toLowerCase().includes(q) ||
        (c.phone || "").includes(search) ||
        (c.aadhar || "").replace(/\s/g, "").includes(qNoSpace) ||
        (c.address || "").toLowerCase().includes(q);
      if (!searchMatch) return false;

      if (dueFilter === "withDue" && !(c._totalDue > 0)) return false;
      if (dueFilter === "noDue" && c._totalDue > 0) return false;

      if (overdueFilter === "overdue" && c._overdueInvs.length === 0) return false;
      if (overdueFilter === "none" && c._overdueInvs.length > 0) return false;

      if (deliveryFilter === "pending" && !c._hasPendingDelivery) return false;
      if (deliveryFilter === "done" && c._hasPendingDelivery) return false;

      return true;
    });
  }, [annotated, search, dueFilter, overdueFilter, deliveryFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortBy) {
      case "recent":
        arr.sort((a, b) => (b._lastVisit || "").localeCompare(a._lastVisit || ""));
        break;
      case "due":
        arr.sort((a, b) => b._totalDue - a._totalDue);
        break;
      case "oldest":
        arr.sort((a, b) => b._oldestDays - a._oldestDays);
        break;
      case "name":
      default:
        arr.sort((a, b) => a.name.localeCompare(b.name));
    }
    return arr;
  }, [filtered, sortBy]);

  const pagination = usePagination(sorted, 50);

  const clearFilters = () => {
    setSearch(""); setDueFilter("all"); setOverdueFilter("all"); setDeliveryFilter("all"); setSortBy("name");
  };
  const filtersActive = search || dueFilter !== "all" || overdueFilter !== "all" || deliveryFilter !== "all" || sortBy !== "name";

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    // Unique customer name
    const normalizedName = form.name.trim().toLowerCase();
    const dupName = customers.find((c) => c.name.trim().toLowerCase() === normalizedName && c.id !== selected?.id);
    if (dupName) e.name = `Customer "${dupName.name}" already exists`;
    // Unique phone
    if (form.phone) {
      const dup = customers.find((c) => c.phone === form.phone && c.id !== selected?.id);
      if (dup) e.phone = `Phone already used by "${dup.name}"`;
    }
    // Unique Aadhar
    if (form.aadhar) {
      const clean = form.aadhar.replace(/\s/g, "");
      const dup = customers.find((c) => (c.aadhar || "").replace(/\s/g, "") === clean && c.id !== selected?.id);
      if (dup) e.aadhar = `Aadhar already used by "${dup.name}"`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    if (modal === "add") { 
      setCustomers((p) => [...p, { ...form, id: newId(customers) }]); 
      addActivity(`New customer added: ${form.name}`, "customer"); 
      showToast(`Customer "${form.name}" added successfully`, "success");
    } else { 
      setCustomers((p) => p.map((c) => c.id === selected.id ? { ...c, ...form } : c)); 
      addActivity(`Customer updated: ${form.name}`, "customer"); 
      showToast(`Customer "${form.name}" updated successfully`, "success");
    }
    setModal(null);
  };

  const ff = (k) => (e) => { 
    setForm((p) => ({ ...p, [k]: e.target.value })); 
    setErrors((p) => ({ ...p, [k]: undefined })); 
  };
  
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  const del = () => { 
    if (!deleteConfirm) return; 
    const name = deleteConfirm.name;
    setCustomers((p) => p.filter((c) => c.id !== deleteConfirm.id)); 
    setDeleteConfirm(null); 
    showToast(`Customer "${name}" deleted`, "warning");
  };
  
  const openAdd = () => { setForm(blank()); setErrors({}); setModal("add"); };
  const openEdit = (c) => { setSelected(c); setForm({ ...blank(), ...c }); setErrors({}); setModal("edit"); };

  // CSV Import
  const handleCSV = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.trim().split("\n").slice(1);
      const imported = lines.map((l, i) => { 
        const [name, aadhar, phone, email, address] = l.split(",").map((s) => s.trim()); 
        return { id: newId(customers) + i, name: name || "", aadhar: aadhar || "", phone: phone || "", email: email || "", address: address || "" }; 
      }).filter((c) => c.name);
      setCustomers((p) => [...p, ...imported]); 
      addActivity(`${imported.length} customers imported`, "customer");
      showToast(`${imported.length} customers imported from CSV`, "success");
    };
    reader.readAsText(file); e.target.value = "";
  };

  // Excel Import with preview
  const handleExcel = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const keys = raw.length > 0 ? Object.keys(raw[0]) : [];
        const find = (terms) => keys.find((k) => terms.some((t) => k.toLowerCase().includes(t))) || "";
        const colName = find(["customer name", "name"]);
        const colPhone = find(["phone", "mobile", "contact"]);
        const colAadhar = find(["aadhar", "aadhaar"]);
        const colAddress = find(["address", "location", "place", "village"]);
        const colEmail = find(["email", "mail"]);
        const colNotes = find(["notes", "note", "remark", "products", "items"]);
        const colAmount = find(["amount", "total", "balance"]);

        const existPhones = new Set(customers.map((c) => (c.phone || "").replace(/\D/g, "")).filter(Boolean));
        const existAadhars = new Set(customers.map((c) => (c.aadhar || "").replace(/\s/g, "")).filter(Boolean));

        let skipped = 0;
        const rows = [];
        raw.forEach((r) => {
          const name = String(r[colName] || "").trim();
          if (!name || name.toLowerCase() === "grand total" || name.toLowerCase() === "(file read error") return;
          const phone = String(r[colPhone] || "").replace(/\D/g, "");
          const aadhar = String(r[colAadhar] || "").replace(/\s/g, "");
          const isDup = (phone && existPhones.has(phone)) || (aadhar && existAadhars.has(aadhar));
          if (isDup) { skipped++; return; }
          const notes = [r[colNotes] || "", r[colAmount] ? `Amount: ₹${r[colAmount]}` : ""].filter(Boolean).join(" | ");
          rows.push({
            name,
            phone,
            aadhar,
            email: String(r[colEmail] || "").trim(),
            address: String(r[colAddress] || "").trim(),
            notes,
            _selected: true,
          });
        });
        setXlsxPreview({ rows, skipped, colMap: { colName, colPhone, colAadhar, colEmail, colAddress, colNotes, colAmount } });
      } catch (err) {
        showToast("Error reading Excel file: " + err.message, "error");
      }
    };
    reader.readAsArrayBuffer(file); e.target.value = "";
  };

  const toggleXlsxRow = (idx) => {
    setXlsxPreview((p) => {
      const rows = [...p.rows];
      rows[idx] = { ...rows[idx], _selected: !rows[idx]._selected };
      return { ...p, rows };
    });
  };
  
  const toggleAllXlsx = () => {
    setXlsxPreview((p) => {
      const allSelected = p.rows.every((r) => r._selected);
      return { ...p, rows: p.rows.map((r) => ({ ...r, _selected: !allSelected })) };
    });
  };
  
  const confirmExcelImport = () => {
    const toImport = xlsxPreview.rows.filter((r) => r._selected);
    const imported = toImport.map((r, i) => ({
      id: newId(customers) + i,
      name: r.name,
      phone: r.phone,
      aadhar: r.aadhar,
      email: r.email,
      address: r.address,
    }));
    setCustomers((p) => [...p, ...imported]);
    addActivity(`${imported.length} customers imported from Excel`, "customer");
    showToast(`${imported.length} customers imported from Excel`, "success");
    setXlsxPreview(null);
  };

  // History panel state
  const [historyCustomer, setHistoryCustomer] = useState(null);

  return (
    <div className="space-y-5">
      {/* Customer list */}
      <div className="w-full">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold page-title flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Customers
          </h1>
          <div className="flex gap-2 flex-wrap">
            {canEdit && (
              <>
                <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} aria-label="Import CSV file" />
                <Btn variant="outline" size="sm" onClick={() => csvRef.current?.click()}>⬆ Import CSV</Btn>
              </>
            )}
            {canEdit && (
              <>
                <input ref={xlsxRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcel} aria-label="Import Excel file" />
                <Btn variant="outline" size="sm" onClick={() => xlsxRef.current?.click()}>📊 Import Excel</Btn>
              </>
            )}
            <Btn variant="outline" size="sm" onClick={() => exportCSV("customers.csv", ["Name","Phone","Aadhar","Email","Address"], customers.map((c) => [c.name, c.phone, c.aadhar, c.email, c.address]))}>⬇ Export CSV</Btn>
            {canEdit && <Btn size="sm" onClick={openAdd}>+ Add Customer</Btn>}
          </div>
        </div>
        
        <input 
          className="w-full border border-emerald-700/30 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-emerald-900/30 shadow-sm mt-1 mb-3" 
          placeholder="Search by name, phone or Aadhar…" 
          value={search} 
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search customers"
        />
        
        {/* Filters bar: Due / Overdue / Delivery / Sort / Clear */}
        <div className="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label="Filters">
          <span className="text-xs font-semibold text-emerald-500/60 uppercase">Filter:</span>

          <select value={dueFilter} onChange={(e) => setDueFilter(e.target.value)}
            className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-emerald-900/30 text-emerald-200 border border-emerald-700/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            aria-label="Due filter">
            <option value="all">💰 All Due</option>
            <option value="withDue">💰 With Due</option>
            <option value="noDue">✓ No Due</option>
          </select>

          <select value={overdueFilter} onChange={(e) => setOverdueFilter(e.target.value)}
            className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-emerald-900/30 text-emerald-200 border border-emerald-700/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            aria-label="Overdue filter">
            <option value="all">⏰ All Overdue</option>
            <option value="overdue">⏰ Overdue Only</option>
            <option value="none">✓ Not Overdue</option>
          </select>

          <select value={deliveryFilter} onChange={(e) => setDeliveryFilter(e.target.value)}
            className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-emerald-900/30 text-emerald-200 border border-emerald-700/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            aria-label="Delivery filter">
            <option value="all">🚚 All Delivery</option>
            <option value="pending">🚚 Pending Delivery</option>
            <option value="done">✓ All Delivered</option>
          </select>

          <span className="text-xs font-semibold text-emerald-500/60 uppercase ml-2">Sort:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-emerald-900/30 text-emerald-200 border border-emerald-700/30 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            aria-label="Sort by">
            <option value="name">Name A→Z</option>
            <option value="recent">Newest visit</option>
            <option value="due">Highest due</option>
            <option value="oldest">Oldest overdue</option>
          </select>

          {filtersActive && (
            <button onClick={clearFilters}
              className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-amber-900/30 text-amber-300 border border-amber-700/40 hover:bg-amber-900/50">
              ✕ Clear filters
            </button>
          )}
          {filtersActive && (
            <span className="text-xs font-bold text-amber-400 ml-1">
              ({sorted.length} of {customers.length})
            </span>
          )}
        </div>
        
        {/* Summary cards: 5 stat cards */}
        {(() => {
          const totalCustomers = customers.length;
          const withDueCount = annotated.filter((c) => c._totalDue > 0).length;
          const grandTotalDue = annotated.reduce((s, c) => s + c._totalDue, 0);
          const overdue30 = annotated.filter((c) => c._oldestDays >= 30).length;
          const pendingDelivery = annotated.filter((c) => c._hasPendingDelivery).length;
          const cards = [
            { l: "Total Customers", v: totalCustomers, color: "text-emerald-400", icon: "👥" },
            { l: "With Due", v: withDueCount, color: "text-amber-400", icon: "💰" },
            { l: "Total Due", v: fmtCurrency(grandTotalDue), color: grandTotalDue > 0 ? "text-red-400" : "text-emerald-400", icon: "₹" },
            { l: "Overdue 30d+", v: overdue30, color: overdue30 > 0 ? "text-purple-400" : "text-emerald-500/50", icon: "⏰" },
            { l: "Pending Delivery", v: pendingDelivery, color: pendingDelivery > 0 ? "text-blue-400" : "text-emerald-500/50", icon: "🚚" },
          ];
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-3">
              {cards.map((c) => (
                <div key={c.l} className="p-3 rounded-xl text-center" style={{ background:"rgba(16,185,129,.08)", border:"1px solid rgba(34,197,94,.15)" }}>
                  <p className="text-xs text-emerald-500/60 mb-1"><span aria-hidden="true">{c.icon}</span> {c.l}</p>
                  <p className={`text-lg font-bold ${c.color}`}>{c.v}</p>
                </div>
              ))}
            </div>
          );
        })()}
        
        {/* Customer Table */}
        <div className="card overflow-hidden overflow-x-auto">
          <div className="section-header">
            <h3 className="text-sm font-semibold text-emerald-300">{sorted.length} customer{sorted.length !== 1 ? "s" : ""}{pagination.totalPages > 1 ? ` · page ${pagination.currentPage}/${pagination.totalPages}` : ""}</h3>
          </div>
          <div className="overflow-y-auto max-h-[calc(100vh-260px)]">
            <table className="w-full text-sm">
              <thead className="thead-sticky">
                <tr>
                  <th className="w-8 px-2 py-3"></th>
                  {["Name", "Phone", "Aadhar", "Address", "Last Visit", "Due Amount", "Overdue Status", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-emerald-500/50 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-800/30">
                {pagination.paginatedItems.map((c) => {
                  const custOverdue = c._overdueInvs;
                  const custOverdueBalance = c._overdueBalance;
                  const oldestDays = c._oldestDays;
                  const totalDue = c._totalDue;
                  const invCount = c._myInvs.length;
                  const lastVisit = c._lastVisit;
                  const lastVisitDays = lastVisit ? daysSinceInvoice(lastVisit) : null;
                  const isExpanded = expandedId === c.id;
                  // Invoice-count badge tier
                  let badgeTier = null;
                  if (invCount === 1) badgeTier = { color: "neutral", txt: `🧾 1` };
                  else if (invCount >= 2 && invCount <= 4) badgeTier = { color: "green", txt: `🧾 ${invCount} repeat` };
                  else if (invCount >= 5) badgeTier = { color: "yellow", txt: `🧾 ${invCount} ⭐` };

                  return (
                    <React.Fragment key={c.id}>
                    <tr className={`transition-colors ${custOverdue.length > 0 ? "bg-purple-900/20 hover:bg-purple-900/30" : "hover:bg-emerald-800/30"}`}>
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : c.id)}
                          className="text-emerald-400 hover:text-emerald-200 text-xs"
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                          aria-expanded={isExpanded}
                          disabled={invCount === 0}
                          title={invCount === 0 ? "No invoices" : (isExpanded ? "Collapse" : "Expand mini-ledger")}
                        >
                          {invCount === 0 ? "·" : (isExpanded ? "▼" : "▶")}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-emerald-100">{c.name}</p>
                          {badgeTier && <Badge color={badgeTier.color}>{badgeTier.txt}</Badge>}
                        </div>
                        {custOverdue.length > 0 && <p className="text-xs text-purple-400 font-bold mt-0.5">💰 {oldestDays}d overdue</p>}
                      </td>
                      <td className="px-4 py-3 text-emerald-400/70">{c.phone}</td>
                      <td className="px-4 py-3 text-emerald-400/70 font-mono text-xs">{c.aadhar || "—"}</td>
                      <td className="px-4 py-3 text-emerald-400/70 text-xs max-w-[180px] truncate" title={c.address || ""}>{c.address || "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        {lastVisit ? (
                          <div>
                            <p className="text-emerald-300">{fmtDate(lastVisit)}</p>
                            <p className="text-emerald-500/50">{lastVisitDays === 0 ? "today" : `${lastVisitDays}d ago`}</p>
                          </div>
                        ) : <span className="text-emerald-600/40">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {totalDue > 0 
                          ? <span className="font-bold text-red-400">₹{totalDue.toLocaleString("en-IN")}</span>
                          : <span className="text-emerald-600/40 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {custOverdue.length > 0 ? (
                          <div className="space-y-1">
                            <Badge color="indigo">💰 {custOverdue.length} Overdue</Badge>
                            <p className="text-xs text-purple-400 font-semibold">₹{custOverdueBalance.toLocaleString("en-IN")} balance</p>
                          </div>
                        ) : (
                          <span className="text-emerald-600/40 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 flex-wrap">
                          {totalDue > 0 && canEdit && (
                            <button onClick={() => setQuickPayCustomer(c)} className="px-3 py-1.5 rounded-xl text-xs font-bold text-white shadow-md inline-flex items-center gap-1.5" style={{ background:"linear-gradient(135deg,#f59e0b,#d97706)" }}>💵 Pay</button>
                          )}
                          <Btn size="sm" variant="secondary" onClick={() => setHistoryCustomer(historyCustomer?.id === c.id ? null : c)}>📋 History</Btn>
                          {canEdit && <Btn size="sm" variant="outline" onClick={() => openEdit(c)}>Edit</Btn>}
                          {canEdit && <Btn size="sm" variant="danger" onClick={() => setDeleteConfirm(c)}>Delete</Btn>}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && invCount > 0 && (
                      <tr className="bg-emerald-950/40">
                        <td></td>
                        <td colSpan={8} className="px-4 py-3">
                          {/* Mini-ledger: stat strip + last 5 invoices */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                            {[
                              { l: "Invoices", v: invCount, color: "text-emerald-300" },
                              { l: "Total Due", v: fmtCurrency(totalDue), color: totalDue > 0 ? "text-red-400" : "text-emerald-400" },
                              { l: "Overdue Bal.", v: fmtCurrency(custOverdueBalance), color: custOverdueBalance > 0 ? "text-purple-400" : "text-emerald-400" },
                              { l: "Last Visit", v: lastVisit ? `${lastVisitDays === 0 ? "today" : lastVisitDays + "d ago"}` : "—", color: "text-emerald-300" },
                            ].map((s) => (
                              <div key={s.l} className="p-2 rounded-lg text-center" style={{ background:"rgba(16,185,129,.06)", border:"1px solid rgba(34,197,94,.12)" }}>
                                <p className="text-xs text-emerald-500/60">{s.l}</p>
                                <p className={`text-sm font-bold ${s.color}`}>{s.v}</p>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs font-bold text-emerald-500/60 uppercase mb-1.5">Last 5 invoices</p>
                          <div className="rounded-lg overflow-hidden" style={{ border:"1px solid rgba(34,197,94,.15)" }}>
                            <table className="w-full text-xs">
                              <thead style={{ background:"rgba(16,185,129,.08)" }}>
                                <tr>
                                  {["Invoice","Date","Total","Paid","Balance","Status"].map((h) => (
                                    <th key={h} className="px-2 py-1.5 text-left text-emerald-500/60 uppercase font-bold">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {[...c._myInvs].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5).map((inv) => {
                                  const bal = (inv.total || 0) - (inv.paidAmount || 0);
                                  const ovd = isOverdue(inv);
                                  return (
                                    <tr key={inv.id} style={{ borderTop:"1px solid rgba(34,197,94,.08)" }}>
                                      <td className="px-2 py-1.5">
                                        <button onClick={() => goToInvoice(inv)} className="font-mono font-bold text-emerald-400 underline underline-offset-2 hover:text-emerald-300">{inv.id}</button>
                                      </td>
                                      <td className="px-2 py-1.5 text-emerald-300/70">{fmtDate(inv.date)}</td>
                                      <td className="px-2 py-1.5 text-emerald-300">{fmtCurrency(inv.total || 0)}</td>
                                      <td className="px-2 py-1.5 text-emerald-400">{fmtCurrency(inv.paidAmount || 0)}</td>
                                      <td className={`px-2 py-1.5 font-bold ${bal > 0 ? "text-red-400" : "text-emerald-500/50"}`}>{bal > 0 ? fmtCurrency(bal) : "—"}</td>
                                      <td className="px-2 py-1.5">
                                        <Badge color={inv.status === "paid" ? "green" : inv.status === "partial" ? "yellow" : "red"}>{inv.status}</Badge>
                                        {ovd && <Badge color="indigo">⏰</Badge>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-emerald-500/50">No customers found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {pagination.totalPages > 1 && (
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            onPageChange={pagination.goToPage}
            onNext={pagination.nextPage}
            onPrev={pagination.prevPage}
            onFirst={pagination.firstPage}
            onLast={pagination.lastPage}
            hasNextPage={pagination.hasNextPage}
            hasPrevPage={pagination.hasPrevPage}
          />
        )}

        {/* Add/Edit Modal */}
        {(modal === "add" || modal === "edit") && (
          <Modal title={modal === "add" ? "Add Customer" : "Edit Customer"} onClose={() => setModal(null)}>
            <div className="space-y-3">
              <Input label="Name *" value={form.name} onChange={ff("name")} error={errors.name} placeholder="Customer name" autoFocus />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Phone" value={form.phone} onChange={ff("phone")} error={errors.phone} placeholder="9876543210" hint="Must be unique" />
                <Input label="Aadhar Number" value={form.aadhar} onChange={ff("aadhar")} error={errors.aadhar} placeholder="XXXX XXXX XXXX" hint="12-digit unique" />
              </div>
              <Input label="Address" value={form.address} onChange={ff("address")} placeholder="Full address" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="GSTIN (for B2B)" value={form.gstin || ""} onChange={ff("gstin")} placeholder="33XXXXX1234X1Z5" hint="Optional - for registered dealers" />
                <Input label="Credit Limit" type="number" value={form.creditLimit || ""} onChange={ff("creditLimit")} placeholder="0" hint="Maximum credit allowed" />
              </div>
              <div className="flex gap-2 pt-2">
                <Btn onClick={save}>Save</Btn>
                <Btn variant="secondary" onClick={() => setModal(null)}>Cancel</Btn>
              </div>
            </div>
          </Modal>
        )}

        {/* Excel Import Preview Modal */}
        {xlsxPreview && (
          <Modal title="📊 Import Customers from Excel" onClose={() => setXlsxPreview(null)} wide>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-400 font-semibold">{xlsxPreview.rows.filter((r) => r._selected).length} of {xlsxPreview.rows.length} selected</span>
                {xlsxPreview.skipped > 0 && <span className="text-amber-400">{xlsxPreview.skipped} duplicates skipped</span>}
              </div>
              <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-emerald-700/30">
                <table className="w-full text-xs">
                  <thead className="thead-sticky">
                    <tr>
                      <th className="px-2 py-2 text-left">
                        <input 
                          type="checkbox" 
                          checked={xlsxPreview.rows.every((r) => r._selected)} 
                          onChange={toggleAllXlsx}
                          aria-label="Select all"
                        />
                      </th>
                      {["Name", "Phone", "Aadhar", "Email", "Address", "Notes"].map((h) => (
                        <th key={h} className="px-2 py-2 text-left text-emerald-500/60 uppercase font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-800/20">
                    {xlsxPreview.rows.map((r, i) => (
                      <tr key={i} className={`${r._selected ? "" : "opacity-40"} hover:bg-emerald-900/20`}>
                        <td className="px-2 py-1.5">
                          <input 
                            type="checkbox" 
                            checked={r._selected} 
                            onChange={() => toggleXlsxRow(i)}
                            aria-label={`Select ${r.name}`}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-emerald-200 font-medium">{r.name}</td>
                        <td className="px-2 py-1.5 text-emerald-300/70">{r.phone || "—"}</td>
                        <td className="px-2 py-1.5 text-emerald-300/70">{r.aadhar || "—"}</td>
                        <td className="px-2 py-1.5 text-emerald-300/70">{r.email || "—"}</td>
                        <td className="px-2 py-1.5 text-emerald-300/70 max-w-[140px] truncate" title={r.address || ""}>{r.address || "—"}</td>
                        <td className="px-2 py-1.5 text-emerald-300/50 max-w-[180px] truncate">{r.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 pt-1">
                <Btn onClick={confirmExcelImport} disabled={!xlsxPreview.rows.some((r) => r._selected)}>
                  Import {xlsxPreview.rows.filter((r) => r._selected).length} Customers
                </Btn>
                <Btn variant="secondary" onClick={() => setXlsxPreview(null)}>Cancel</Btn>
              </div>
            </div>
          </Modal>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <Modal title="Delete Customer" onClose={() => setDeleteConfirm(null)}>
          <div className="space-y-4">
            <Alert variant="error" title={<>Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?</>}>
              This action cannot be undone.
            </Alert>
            <div className="flex gap-2 justify-end">
              <Btn variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
              <button onClick={del} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md">
                <Icon name="trash" size={16} />
                Yes, Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {quickPayCustomer && !histPayModal && (() => {
        const qc = quickPayCustomer;
        const unpaid = (invoices || [])
          .filter((inv) => inv.customerId === qc.id && (inv.total - (inv.paidAmount || 0)) > 0)
          .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
        const totalUnpaid = unpaid.reduce((s, inv) => s + (inv.total - (inv.paidAmount || 0)), 0);
        return (
          <Modal title={`💵 Quick Pay — ${qc.name}`} onClose={() => setQuickPayCustomer(null)}>
            <div className="space-y-3">
              <div className="p-3 rounded-xl text-center" style={{ background:"rgba(239,68,68,.1)", border:"1px solid rgba(239,68,68,.25)" }}>
                <p className="text-xs text-red-300 mb-0.5">Total Outstanding</p>
                <p className="text-xl font-bold text-red-400">{fmtCurrency(totalUnpaid)}</p>
                <p className="text-xs text-emerald-500/60 mt-1">{unpaid.length} unpaid invoice{unpaid.length !== 1 ? "s" : ""}</p>
              </div>
              {unpaid.length === 0 ? (
                <p className="text-emerald-500/50 text-sm py-4 text-center">No unpaid invoices</p>
              ) : (
                <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                  {unpaid.map((inv) => {
                    const bal = (inv.total || 0) - (inv.paidAmount || 0);
                    const ovd = isOverdue(inv);
                    return (
                      <div key={inv.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg" style={{ background: ovd ? "rgba(168,85,247,.08)" : "rgba(16,185,129,.06)", border:`1px solid ${ovd ? "rgba(168,85,247,.25)" : "rgba(34,197,94,.15)"}` }}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => { setQuickPayCustomer(null); goToInvoice(inv); }} className="font-mono font-bold text-emerald-400 text-xs underline underline-offset-2 hover:text-emerald-300">{inv.id}</button>
                          <span className="text-xs text-emerald-500/60">{fmtDate(inv.date)}</span>
                          {ovd && <Badge color="indigo">⏰ {daysSinceInvoice(inv.date)}d</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-red-400">{fmtCurrency(bal)}</span>
                          <button onClick={() => setHistPayModal(inv)} className="px-2 py-1 rounded-lg text-xs font-bold text-white" style={{ background:"linear-gradient(135deg,#f59e0b,#d97706)" }}>Pay 💵</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Btn variant="secondary" onClick={() => setQuickPayCustomer(null)}>Close</Btn>
              </div>
            </div>
            {histPayModal && (
              <RecordPaymentModal
                invoice={histPayModal}
                onRecord={recordHistPayment}
                onClose={() => setHistPayModal(null)}
              />
            )}
          </Modal>
        );
      })()}

      {/* History popup modal */}
      {historyCustomer && (() => {
        const hc = historyCustomer;
        const custInvoices = (invoices || []).filter((inv) => inv.customerId === hc.id).sort((a, b) => new Date(b.date) - new Date(a.date));
        const totalSpent = custInvoices.reduce((s, inv) => s + (inv.paidAmount || 0), 0);
        const totalBalance = custInvoices.reduce((s, inv) => s + Math.max(0, inv.total - (inv.paidAmount || 0)), 0);
        const totalBilled = custInvoices.reduce((s, inv) => s + inv.total, 0);
        const allPayments = custInvoices.flatMap((inv) => (inv.payments || []).map((p) => ({ ...p, invoiceId: inv.id }))).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        
        return (
          <Modal onClose={() => setHistoryCustomer(null)} title={`👤 ${hc.name} — History`} wide>
            <div className="space-y-4">
              {/* Customer info */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm p-3 rounded-xl" style={{ background:"rgba(16,185,129,.08)", border:"1px solid rgba(34,197,94,.15)" }}>
                {[["Phone", hc.phone], ["Email", hc.email], ["Aadhar", hc.aadhar], ["Address", hc.address]].map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-xs font-bold text-emerald-500/60 uppercase w-14 shrink-0">{k}</span>
                    <span className="text-emerald-200 text-xs">{v || "—"}</span>
                  </div>
                ))}
              </div>
              
              {/* Summary stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { l: "Purchases", v: custInvoices.length, color: "text-emerald-400" },
                  { l: "Billed", v: fmtCurrency(totalBilled), color: "text-blue-400" },
                  { l: "Paid", v: fmtCurrency(totalSpent), color: "text-emerald-400" },
                  { l: "Balance", v: fmtCurrency(totalBalance), color: totalBalance > 0 ? "text-red-400" : "text-emerald-400" },
                  { l: "Delivery", v: (() => { const totalItems = custInvoices.reduce((s, inv) => s + inv.items.length, 0); const deliveredItems = custInvoices.reduce((s, inv) => s + inv.items.filter((l) => l.delivered).length, 0); return totalItems === 0 ? "—" : deliveredItems === totalItems ? "All Done" : `${deliveredItems}/${totalItems}`; })(), color: (() => { const totalItems = custInvoices.reduce((s, inv) => s + inv.items.length, 0); const deliveredItems = custInvoices.reduce((s, inv) => s + inv.items.filter((l) => l.delivered).length, 0); return totalItems > 0 && deliveredItems === totalItems ? "text-emerald-400" : deliveredItems > 0 ? "text-amber-400" : "text-red-400"; })() },
                ].map((s) => (
                  <div key={s.l} className="p-2.5 rounded-xl text-center" style={{ background:"rgba(16,185,129,.08)", border:"1px solid rgba(34,197,94,.15)" }}>
                    <p className={`text-base font-bold ${s.color}`}>{s.v}</p>
                    <p className="text-xs text-emerald-500/50">{s.l}</p>
                  </div>
                ))}
              </div>
              
              {/* Invoice history */}
              <h3 className="text-xs font-bold text-emerald-500/60 uppercase tracking-wide">Invoice History</h3>
              {custInvoices.length === 0 ? (
                <p className="text-emerald-500/40 text-sm py-4 text-center">No purchases yet</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {custInvoices.map((inv) => {
                    const paid = inv.paidAmount || 0;
                    const balance = inv.total - paid;
                    const overdue = isOverdue(inv);
                    const dLineBase = (l) => l.qty * l.price * (1 - l.discount / 100);
                    const dLineTax = (l) => dLineBase(l) * ((l.cgst + l.sgst) / 100);
                    const dTotal = inv.items.reduce((s, l) => s + dLineBase(l) + dLineTax(l), 0);
                    const statusColor = inv.status === "paid" ? "green" : inv.status === "partial" ? "yellow" : "red";
                    
                    return (
                      <div key={inv.id} className="rounded-xl overflow-hidden" style={{ border:`1px solid ${overdue ? "rgba(168,85,247,.3)" : "rgba(34,197,94,.15)"}`, background: overdue ? "rgba(168,85,247,.08)" : "rgba(16,185,129,.05)" }}>
                        <div className="flex items-center justify-between px-3 py-2 gap-2 flex-wrap" style={{ borderBottom:"1px solid rgba(34,197,94,.1)" }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={() => { setHistoryCustomer(null); goToInvoice(inv); }} className="font-mono font-bold text-emerald-400 text-xs underline underline-offset-2 hover:text-emerald-300">{inv.id}</button>
                            <span className="text-xs text-emerald-500/50">{fmtDate(inv.date)}</span>
                            <Badge color={statusColor}>{inv.status}</Badge>
                            {overdue && <Badge color="indigo">💰 {daysSinceInvoice(inv.date)}d</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className="text-xs font-bold text-emerald-300">{fmtCurrency(dTotal)}</p>
                              {balance > 0 && <p className="text-xs text-red-400">Bal: {fmtCurrency(balance)}</p>}
                            </div>
                            {balance > 0 && (
                              <button onClick={() => setHistPayModal(inv)} className="px-2 py-1 rounded-lg text-xs font-bold text-white shrink-0" style={{ background:"linear-gradient(135deg,#f59e0b,#d97706)" }}>Pay 💵</button>
                            )}
                            <button onClick={() => { setHistoryCustomer(null); goToInvoice(inv); }} className="px-2 py-1 rounded-lg text-xs font-semibold shrink-0" style={{ color:"#6ee7b7", border:"1px solid rgba(34,197,94,.3)" }}>🧾</button>
                          </div>
                        </div>
                        <div className="px-3 py-1.5">
                          {inv.items.slice(0, 3).map((l, i) => (
                            <div key={i} className="flex items-center justify-between py-0.5 text-xs">
                              <span className="text-emerald-300/70">• {l.name} × {l.qty}</span>
                              <span className="font-semibold text-emerald-300">{fmtCurrency(dLineBase(l) + dLineTax(l))}</span>
                            </div>
                          ))}
                          {inv.items.length > 3 && (
                            <p className="text-xs text-emerald-500/50 mt-1">+{inv.items.length - 3} more items</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* All Payment History */}
              {allPayments.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-emerald-500/60 uppercase tracking-wide mb-2">💳 All Payment History</h3>
                  <div className="rounded-xl overflow-hidden max-h-[200px] overflow-y-auto" style={{ border:"1px solid rgba(34,197,94,.2)" }}>
                    <table className="w-full text-xs">
                      <thead className="thead-sticky">
                        <tr>
                          {["#","Invoice","Date & Time","Amount","Note"].map((h) => (
                            <th key={h} className="text-left px-2 py-2 text-xs font-bold text-emerald-500/60 uppercase">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allPayments.map((p, i) => (
                          <tr key={i} style={{ borderTop:"1px solid rgba(34,197,94,.1)" }}>
                            <td className="px-2 py-1.5 text-emerald-500/50">{i + 1}</td>
                            <td className="px-2 py-1.5">
                              <button onClick={() => { setHistoryCustomer(null); goToInvoice(custInvoices.find((inv) => inv.id === p.invoiceId)); }} className="font-mono font-bold text-emerald-400 underline underline-offset-2 hover:text-emerald-300">{p.invoiceId}</button>
                            </td>
                            <td className="px-2 py-1.5 text-emerald-300/70">{fmtDateTime(p.date)}</td>
                            <td className="px-2 py-1.5 font-bold text-emerald-400">{fmtCurrency(p.amount)}</td>
                            <td className="px-2 py-1.5 text-emerald-500/50">{p.note || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-2 py-1.5 text-right text-xs font-bold text-emerald-400" style={{ borderTop:"1px solid rgba(34,197,94,.2)", background:"rgba(16,185,129,.08)" }}>
                      Total: {fmtCurrency(allPayments.reduce((s, p) => s + (p.amount || 0), 0))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {histPayModal && (
              <RecordPaymentModal 
                invoice={histPayModal} 
                onRecord={recordHistPayment} 
                onClose={() => setHistPayModal(null)} 
              />
            )}
          </Modal>
        );
      })()}
    </div>
  );
}

export default CustomersPage;
