/**
 * Invoices Page - Sales invoicing, payment tracking
 */
import { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { 
  Modal, Input, Btn, Badge, useToast, 
  CustomerCombobox, ItemCombobox, RecordPaymentModal 
} from "../components/UIComponents";
import { Alert } from "../components/Alert";
import { Icon } from "../components/Icon";
import { Pagination } from "../components/Pagination";
import { EmptyState } from "../components/LoadingStates";
import { usePagination, useDebouncedValue } from "../hooks";
import riceIcon from "../assets/sheaf-of-rice.png";
import {
  fmtCurrency, fmtDate, fmtDateTime, today, nowTimestamp,
  newId, newInvId, exportCSV, isOverdue, daysSinceInvoice,
  amountInWords, stateCodeToName,
  num, round2, lineBase, lineTax, lineTotal, lineCost
} from "../utils/helpers";
import { consumeStockFIFO } from "../services/batchTracking";

export default function InvoicesPage({ 
  invoices, setInvoices, customers, setCustomers, items, setItems, 
  user, addActivity, storeInfo, invoiceState, setInvoiceState 
}) {
  const { view, custId, invItems, selected } = invoiceState;
  const setView = (v) => setInvoiceState((s) => ({ ...s, view: v }));
  const setCustId = (v) => setInvoiceState((s) => ({ ...s, custId: v }));
  const setInvItems = (fn) => setInvoiceState((s) => ({ ...s, invItems: typeof fn === "function" ? fn(s.invItems) : fn }));
  const setSelected = (v) => setInvoiceState((s) => ({ ...s, selected: v }));
  const showToast = useToast();

  const [addItemId, setAddItemId] = useState("");
  const [addQty, setAddQty] = useState(1);
  const [lineError, setLineError] = useState("");
  const [paidAmountInput, setPaidAmountInput] = useState("");
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState("cash");
  const [payModal, setPayModal] = useState(null);
  const [editInv, setEditInv] = useState(null);
  const [editDate, setEditDate] = useState("");
  const [editPaid, setEditPaid] = useState("");
  const [invSearch, setInvSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // all, unpaid, partial, paid, overdue, pendingDelivery
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [invoiceFormat, setInvoiceFormat] = useState("simple"); // "simple" or "gst"
  const [deliveryModal, setDeliveryModal] = useState(null);
  const canEdit = true;
  
  const debouncedSearch = useDebouncedValue(invSearch, 300);

  const getCustomerDue = (customerId) => {
    if (!customerId) return 0;
    return invoices
      .filter((inv) => String(inv.customerId) === String(customerId))
      .reduce((sum, inv) => sum + (inv.total - (inv.paidAmount || 0)), 0);
  };
  
  const selectedCustomerDue = custId ? getCustomerDue(custId) : 0;

  const openEditInv = (inv) => { setEditInv(inv); setEditDate(inv.date); setEditPaid(String(inv.paidAmount || 0)); };
  const saveEditInvoice = () => {
    if (!editInv) return;
    // ✅ FP-safe rounding + tolerance (same logic as recordPayment)
    const total = Math.round((editInv.total || 0) * 100) / 100;
    const paidRaw = Math.min(Number(editPaid) || 0, total);
    const paid = Math.round(paidRaw * 100) / 100;
    const status = paid + 0.005 >= total ? "paid" : paid > 0 ? "partial" : "pending";
    setInvoices((prev) => prev.map((inv) => {
      if (inv.id !== editInv.id) return inv;
      const updated = { ...inv, date: editDate, paidAmount: paid, status };
      setInvoiceState((s) => s.selected?.id === editInv.id ? { ...s, selected: updated } : s);
      return updated;
    }));
    addActivity(`Invoice ${editInv.id} edited`, "invoice");
    showToast(`Invoice ${editInv.id} updated successfully`, "success");
    setEditInv(null);
  };

  const handleAddCustomer = (form) => {
    const newCust = { ...form, id: newId(customers) };
    setCustomers((p) => [...p, newCust]);
    addActivity(`New customer added: ${newCust.name}`, "customer");
    showToast(`Customer "${newCust.name}" added`, "success");
    return newCust;
  };

  const addLine = () => {
    const item = items.find((i) => String(i.id) === String(addItemId));
    if (!item) return;
    if (item.stock === 0) { setLineError(`"${item.name}" is out of stock.`); return; }
    const qty = Number(addQty);
    if (qty <= 0) { setLineError("Quantity must be at least 1."); return; }
    if (qty > item.stock) { setLineError(`Only ${item.stock} units available for "${item.name}". You entered ${qty}.`); return; }
    setLineError("");
    // Dedup check must use the latest state (functional updater) to survive rapid double-clicks
    setInvItems((p) => {
      const existing = p.findIndex((l) => String(l.itemId) === String(item.id));
      if (existing >= 0) {
        const newQty = p[existing].qty + qty;
        if (newQty > item.stock) {
          setLineError(`Total qty (${newQty}) would exceed available stock (${item.stock}).`);
          return p;
        }
        return p.map((l, i) => i === existing ? { ...l, qty: newQty } : l);
      }
      // Capture the unit cost at sale time (frozen on the line) so profit/COGS
      // reporting is correct even if the item's purchase price changes later.
      return [...p, { itemId: item.id, name: item.name, qty, price: Number(item.price) || 0, discount: Number(item.discount) || 0, cgst: Number(item.cgst) || 0, sgst: Number(item.sgst) || 0, cost: num(item.purchasePrice), delivered: false }];
    });
    setAddItemId(""); setAddQty(1);
  };

  const removeLine = (idx) => setInvItems((p) => p.filter((_, i) => i !== idx));

  // Edit the quantity of a line already added to the invoice. Clamps to at
  // least 1 and to the item's available stock (warns if the cap is hit).
  const updateLineQty = (idx, value) => {
    setLineError("");
    setInvItems((p) => p.map((l, i) => {
      if (i !== idx) return l;
      const item = items.find((it) => String(it.id) === String(l.itemId));
      const max = item ? Number(item.stock) || 0 : Infinity;
      let qty = Math.floor(Number(value));
      if (!Number.isFinite(qty) || qty < 1) qty = 1;
      if (qty > max) { qty = max; setLineError(`Only ${max} units available for "${l.name}".`); }
      return { ...l, qty };
    }));
  };

  // lineBase/lineTax/lineTotal now come from helpers (single source of truth).
  const subtotal = invItems.reduce((s, l) => s + lineBase(l), 0);
  const totalTax = invItems.reduce((s, l) => s + lineTax(l), 0);
  const grandTotal = subtotal + totalTax;

  const saveInvoice = () => {
    if (!custId || invItems.length === 0) return;
    // Round base + tax to paise, then derive total from them so the stored
    // figures reconcile exactly: subtotal + totalTax = total. Tolerance on the
    // paid check avoids the floating-point "partial when paid in full" bug.
    const sub = round2(subtotal);
    const tax = round2(totalTax);
    const gt = round2(sub + tax);
    const paidRaw = Math.min(Number(paidAmountInput) || 0, gt);
    const paid = round2(paidRaw);
    const status = paid + 0.005 >= gt ? "paid" : paid > 0 ? "partial" : "pending";
    const initPayments = paid > 0 ? [{ date: nowTimestamp(), amount: paid, method: invoicePaymentMethod, note: "Initial payment", recordedBy: user.name }] : [];
    // Freeze cost-of-goods-sold on the invoice for correct profit reporting.
    const cogs = round2(invItems.reduce((s, l) => s + lineCost(l), 0));
    const inv = { id: newInvId(invoices), customerId: Number(custId), date: nowTimestamp(), status, paidAmount: paid, payments: initPayments, items: invItems, subtotal: sub, totalTax: tax, total: gt, cogs, createdBy: user.name };
    setInvoices((p) => [...p, inv]);
    // item.stock is the authoritative on-hand quantity (shown everywhere).
    setItems((prev) => prev.map((item) => { const l = invItems.find((l) => String(l.itemId) === String(item.id)); if (!l) return item; const ns = Math.max(0, item.stock - l.qty); addActivity(`Stock reduced: ${item.name} → ${ns}`, "stock"); return { ...item, stock: ns }; }));
    // Mirror the deduction into batch records (FIFO/expiry tracking). This is a
    // secondary store; if it fails we surface a warning so the user can reconcile
    // rather than letting item.stock and batch totals silently diverge.
    Promise.all(invItems.map((l) => consumeStockFIFO(l.itemId, l.qty)))
      .then((results) => {
        const short = results.filter((r) => r && r.success === false);
        if (short.length) {
          showToast(`Stock saved, but ${short.length} item(s) had no matching batch records to update.`, "warning");
        }
      })
      .catch((err) => {
        console.error("FIFO consume failed:", err);
        showToast("Stock saved, but batch/expiry records could not be updated. Please verify batches.", "warning");
      });
    const custName = customers.find((c) => String(c.id) === String(custId))?.name;
    addActivity(`Invoice ${inv.id} created for ${custName}${paid > 0 ? ` (${invoicePaymentMethod.toUpperCase()} ₹${paid.toLocaleString("en-IN")})` : ""}`, "invoice");
    showToast(`Invoice ${inv.id} created for ${custName}`, "success");
    setPaidAmountInput("");
    setInvoicePaymentMethod("cash");
    setInvoiceState({ view: "detail", custId: "", invItems: [], selected: inv });
  };

  const recordPayment = (invoiceId, amount, method = "cash", note = "") => {
    // ✅ Defensive validation
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) {
      showToast("Invalid payment amount", "error");
      return;
    }
    const target = invoices.find((i) => i.id === invoiceId);
    if (!target) {
      showToast("Invoice not found", "error");
      return;
    }
    const balance = Math.max(0, target.total - (target.paidAmount || 0));
    if (balance <= 0) {
      showToast("Already fully paid", "info");
      return;
    }
    // ✅ Cap at remaining balance to prevent overpayment
    const safeAmt = Math.min(amt, balance);

    setInvoices((prev) => prev.map((inv) => {
      if (inv.id !== invoiceId) return inv;
      // ✅ Round to 2 decimals to avoid floating-point "99.99 ≠ 100" bug
      const newPaid = Math.round(((inv.paidAmount || 0) + safeAmt) * 100) / 100;
      const newStatus = newPaid + 0.005 >= inv.total ? "paid" : newPaid > 0 ? "partial" : "pending";
      const newPayment = {
        date: nowTimestamp(),
        amount: safeAmt,
        method,
        note: (note || "").trim() || "Payment received",
        recordedBy: user.name,
      };
      const updated = { ...inv, paidAmount: newPaid, status: newStatus, payments: [...(inv.payments || []), newPayment] };
      setInvoiceState((s) => s.selected?.id === invoiceId ? { ...s, selected: updated } : s);
      addActivity(`Payment ₹${safeAmt.toLocaleString("en-IN")} (${method.toUpperCase()}) recorded for ${invoiceId}`, "invoice");
      return updated;
    }));
    showToast(`Payment ₹${safeAmt.toLocaleString("en-IN")} recorded`, "success");
  };

  const printInvoice = () => window.print();

  // ── Delivery management ─────────────────────────────────────────────────────
  const updateInvoiceItems = (invoiceId, mapper) => {
    setInvoices((prev) => prev.map((inv) => {
      if (inv.id !== invoiceId) return inv;
      const updated = { ...inv, items: inv.items.map(mapper) };
      setInvoiceState((s) => s.selected?.id === invoiceId ? { ...s, selected: updated } : s);
      setDeliveryModal((d) => d?.id === invoiceId ? updated : d);
      return updated;
    }));
  };

  const toggleLineDelivered = (invoiceId, idx) => {
    updateInvoiceItems(invoiceId, (l, i) => i === idx
      ? { ...l, delivered: !l.delivered, deliveredAt: !l.delivered ? nowTimestamp() : null }
      : l
    );
  };

  const markAllDelivered = (invoiceId) => {
    const ts = nowTimestamp();
    updateInvoiceItems(invoiceId, (l) => l.delivered ? l : { ...l, delivered: true, deliveredAt: ts });
    addActivity(`All items marked delivered for ${invoiceId}`, "delivery");
    showToast("All items marked delivered", "success");
  };

  const resetAllDelivered = (invoiceId) => {
    updateInvoiceItems(invoiceId, (l) => ({ ...l, delivered: false, deliveredAt: null }));
    addActivity(`Delivery reset for ${invoiceId}`, "delivery");
    showToast("Delivery status reset", "warning");
  };

  const printDeliveryChallan = (inv) => {
    // Escape any string interpolated into the printed HTML — user-supplied fields
    // (names, addresses, item names from Excel imports) could otherwise inject <script>.
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const c = inv.customerId != null ? customers.find((x) => String(x.id) === String(inv.customerId)) : null;
    const custName = esc(c?.name || inv.customerName || "Cash Customer");
    const custAddr = esc(c?.address || "");
    const custPhone = esc(c?.phone || "");
    const storeName = esc(storeInfo?.name || "Store");
    const storeAddr = esc(storeInfo?.address || "");
    const storePhone = esc(storeInfo?.phone || "");
    const storeEmail = esc(storeInfo?.email || "");
    const rows = inv.items.map((l, i) => `
      <tr>
        <td style="padding:6px;border:1px solid #ccc;text-align:center">${i + 1}</td>
        <td style="padding:6px;border:1px solid #ccc">${esc(l.name)}</td>
        <td style="padding:6px;border:1px solid #ccc;text-align:center">${esc(l.qty)}</td>
        <td style="padding:6px;border:1px solid #ccc;text-align:center">${l.delivered ? "✓ Delivered" : "✗ Pending"}</td>
        <td style="padding:6px;border:1px solid #ccc;text-align:center;font-size:11px">${l.deliveredAt ? esc(fmtDateTime(l.deliveredAt)) : "—"}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html><head><title>Delivery Challan ${inv.id}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#222}
        h1{margin:0 0 4px;font-size:22px}
        h2{margin:18px 0 8px;font-size:16px;border-bottom:2px solid #059669;padding-bottom:4px}
        .row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px}
        .right{text-align:right}
        table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
        th{background:#059669;color:#fff;padding:8px;border:1px solid #047857;text-align:left}
        .sig{margin-top:60px;display:flex;justify-content:space-between;font-size:13px}
        .sig div{border-top:1px solid #999;padding-top:6px;width:200px;text-align:center}
      </style></head><body>
      <div class="row">
        <div>
          <h1>${storeName}</h1>
          <div style="font-size:12px;color:#555">${storeAddr}</div>
          <div style="font-size:12px;color:#555">${storePhone}${storeEmail ? " · " + storeEmail : ""}</div>
        </div>
        <div class="right">
          <h1 style="color:#059669">DELIVERY CHALLAN</h1>
          <div style="font-size:13px"><strong>#${inv.id}</strong></div>
          <div style="font-size:12px;color:#555">${fmtDate(inv.date)}</div>
        </div>
      </div>
      <h2>Deliver To</h2>
      <div style="font-size:13px"><strong>${custName}</strong></div>
      ${custAddr ? `<div style="font-size:12px;color:#555">${custAddr}</div>` : ""}
      ${custPhone ? `<div style="font-size:12px;color:#555">📞 ${custPhone}</div>` : ""}
      <h2>Items</h2>
      <table>
        <thead><tr>
          <th style="text-align:center;width:40px">#</th>
          <th>Item</th>
          <th style="text-align:center;width:80px">Qty</th>
          <th style="text-align:center;width:120px">Status</th>
          <th style="text-align:center;width:160px">Delivered At</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="sig">
        <div>Delivered By</div>
        <div>Received By (Customer Signature)</div>
      </div>
      <script>window.onload=function(){setTimeout(function(){window.print();},250);}</script>
      </body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { showToast("Popup blocked — please allow popups", "error"); return; }
    w.document.write(html);
    w.document.close();
  };
  
  // Helper to extract date part from "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss" formats
  const getDatePart = (dateStr) => {
    if (!dateStr) return "";
    return dateStr.split(" ")[0].split("T")[0]; // Handle both space and T separators
  };
  
  const filteredInvoices = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    const todayDate = today();
    const thisMonth = todayDate.slice(0, 7);
    
    let dateFilteredInvoices = invoices;
    if (dateFilter === "today") {
      dateFilteredInvoices = invoices.filter((inv) => getDatePart(inv.date) === todayDate);
    } else if (dateFilter === "thisMonth") {
      dateFilteredInvoices = invoices.filter((inv) => getDatePart(inv.date).startsWith(thisMonth));
    } else if (dateFilter === "custom") {
      dateFilteredInvoices = invoices.filter((inv) => {
        const invDate = getDatePart(inv.date);
        if (customDateFrom && invDate < customDateFrom) return false;
        if (customDateTo && invDate > customDateTo) return false;
        return true;
      });
    }
    
    // Apply status filter
    let statusFilteredInvoices = dateFilteredInvoices;
    if (statusFilter !== "all") {
      statusFilteredInvoices = dateFilteredInvoices.filter((inv) => {
        if (statusFilter === "unpaid") return inv.status === "pending" || (inv.paidAmount || 0) === 0;
        if (statusFilter === "partial") return inv.status === "partial";
        if (statusFilter === "paid") return inv.status === "paid";
        if (statusFilter === "overdue") return isOverdue(inv);
        if (statusFilter === "pendingDelivery") return Array.isArray(inv.items) && inv.items.length > 0 && inv.items.some((l) => !l.delivered);
        return true;
      });
    }
    
    if (!q) return statusFilteredInvoices;
    
    return statusFilteredInvoices.filter((inv) => {
      const c = inv.customerId != null ? customers.find((x) => String(x.id) === String(inv.customerId)) : null;
      const custName = (c?.name || inv.customerName || "").toLowerCase();
      return inv.id.toLowerCase().includes(q) || custName.includes(q) || (inv.status || "").toLowerCase().includes(q) || (inv.date || "").includes(q);
    });
  }, [invoices, customers, debouncedSearch, dateFilter, statusFilter, customDateFrom, customDateTo]);

  // Date-scoped invoices (without status filter) — used for live status chip counts
  const dateScopedInvoices = useMemo(() => {
    const todayDate = today();
    const thisMonth = todayDate.slice(0, 7);
    if (dateFilter === "today") return invoices.filter((inv) => getDatePart(inv.date) === todayDate);
    if (dateFilter === "thisMonth") return invoices.filter((inv) => getDatePart(inv.date).startsWith(thisMonth));
    if (dateFilter === "custom") {
      return invoices.filter((inv) => {
        const invDate = getDatePart(inv.date);
        if (customDateFrom && invDate < customDateFrom) return false;
        if (customDateTo && invDate > customDateTo) return false;
        return true;
      });
    }
    return invoices;
  }, [invoices, dateFilter, customDateFrom, customDateTo]);

  const statusCounts = useMemo(() => {
    const counts = { all: dateScopedInvoices.length, unpaid: 0, partial: 0, paid: 0, overdue: 0, pendingDelivery: 0 };
    dateScopedInvoices.forEach((inv) => {
      if (inv.status === "pending" || (inv.paidAmount || 0) === 0) counts.unpaid++;
      if (inv.status === "partial") counts.partial++;
      if (inv.status === "paid") counts.paid++;
      if (isOverdue(inv)) counts.overdue++;
      if (Array.isArray(inv.items) && inv.items.length > 0 && inv.items.some((l) => !l.delivered)) counts.pendingDelivery++;
    });
    return counts;
  }, [dateScopedInvoices]);
  
  const pagination = usePagination(filteredInvoices, pageSize);
  
  const invoiceTotals = useMemo(() => ({
    totalAmount: filteredInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0),
    totalPaid: filteredInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0),
    totalBalance: filteredInvoices.reduce((sum, inv) => sum + ((inv.total || 0) - (inv.paidAmount || 0)), 0),
  }), [filteredInvoices]);

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const deleteInvoice = (inv) => {
    setItems((prev) => prev.map((item) => {
      const line = inv.items.find((l) => String(l.itemId) === String(item.id));
      if (!line) return item;
      const restored = item.stock + line.qty;
      addActivity(`Stock restored: ${item.name} +${line.qty} → ${restored} (Invoice ${inv.id} deleted)`, "stock");
      return { ...item, stock: restored };
    }));
    setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
    addActivity(`Invoice ${inv.id} deleted by ${user.name}`, "invoice");
    showToast(`Invoice ${inv.id} deleted`, "warning");
    if (selected?.id === inv.id) setInvoiceState((s) => ({ ...s, view: "list", selected: null }));
    setDeleteConfirm(null);
  };

  const invXlsxRef = useRef(null);
  const [invXlsxPreview, setInvXlsxPreview] = useState(null);
  const handleInvExcel = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const keys = raw.length > 0 ? Object.keys(raw[0]) : [];
        const find = (terms) => keys.find((k) => terms.some((t) => k.toLowerCase().includes(t))) || "";
        const colCust = find(["customer", "name", "party", "buyer"]);
        const colDate = find(["date", "invoice date"]);
        const colTotal = find(["total", "amount", "grand total", "invoice total"]);
        const colPaid = find(["paid", "received", "payment"]);
        const colItems = find(["items", "products", "description", "particulars"]);
        const colNotes = find(["notes", "remark", "note"]);

        const rows = [];
        raw.forEach((r) => {
          const custName = String(r[colCust] || "").trim();
          if (!custName || custName.toLowerCase() === "grand total" || custName.toLowerCase() === "total") return;
          const total = Math.abs(Number(String(r[colTotal] || "0").replace(/[₹,]/g, "")) || 0);
          const paid = Math.abs(Number(String(r[colPaid] || "0").replace(/[₹,]/g, "")) || 0);
          let dateStr = String(r[colDate] || "").trim();
          if (dateStr) {
            const parts = dateStr.split(/[\/.\-]/);
            if (parts.length === 3) {
              let [a, b, c] = parts.map((s) => s.trim());
              if (c && c.length === 2) c = "20" + c;
              if (Number(a) > 12) dateStr = `${c}-${b.padStart(2,"0")}-${a.padStart(2,"0")}`;
              else dateStr = `${c}-${a.padStart(2,"0")}-${b.padStart(2,"0")}`;
            }
          }
          if (!dateStr) dateStr = today();
          rows.push({
            custName,
            date: dateStr,
            total,
            paid: Math.min(paid, total),
            items: String(r[colItems] || "").trim(),
            notes: String(r[colNotes] || "").trim(),
            _selected: true,
          });
        });
        setInvXlsxPreview({ rows, colMap: { colCust, colDate, colTotal, colPaid, colItems, colNotes } });
      } catch (err) {
        alert("Error reading Excel file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file); e.target.value = "";
  };
  const toggleInvXlsxRow = (idx) => {
    setInvXlsxPreview((p) => { const rows = [...p.rows]; rows[idx] = { ...rows[idx], _selected: !rows[idx]._selected }; return { ...p, rows }; });
  };
  const toggleAllInvXlsx = () => {
    setInvXlsxPreview((p) => { const all = p.rows.every((r) => r._selected); return { ...p, rows: p.rows.map((r) => ({ ...r, _selected: !all })) }; });
  };
  const confirmInvExcelImport = () => {
    const toImport = invXlsxPreview.rows.filter((r) => r._selected);
    let nextId = invoices.length > 0 ? Math.max(...invoices.map((i) => parseInt(i.id.replace("INV-", ""), 10))) + 1 : 1;
    const imported = toImport.map((r) => {
      const cust = customers.find((c) => c.name.toLowerCase() === r.custName.toLowerCase());
      const status = r.paid >= r.total && r.total > 0 ? "paid" : r.paid > 0 ? "partial" : "pending";
      const invId = `INV-${String(nextId++).padStart(3, "0")}`;
      return {
        id: invId,
        customerId: cust ? cust.id : null,
        customerName: r.custName,
        date: r.date,
        status,
        paidAmount: r.paid,
        payments: r.paid > 0 ? [{ date: r.date, amount: r.paid, note: "Imported payment", recordedBy: user.name }] : [],
        items: r.items ? [{ itemId: 0, name: r.items, qty: 1, price: r.total, discount: 0, cgst: 0, sgst: 0, delivered: false }] : [{ itemId: 0, name: "Imported entry", qty: 1, price: r.total, discount: 0, cgst: 0, sgst: 0, delivered: false }],
        subtotal: r.total,
        totalTax: 0,
        total: r.total,
        createdBy: user.name + " (imported)",
      };
    });
    setInvoices((p) => [...p, ...imported]);
    addActivity(`${imported.length} invoices imported from Excel`, "invoice");
    setInvXlsxPreview(null);
  };

  // ── Create Invoice View ──
  if (view === "create") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("list")} className="text-emerald-500/50 hover:text-emerald-300 font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-emerald-900/40">← Back</button>
          <h1 className="text-2xl font-bold page-title flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
            Create Invoice
          </h1>
        </div>
        <div className="card p-6 space-y-5">
          <CustomerCombobox customers={customers} value={custId} onChange={setCustId} onAddCustomer={handleAddCustomer} />
          {custId && (() => { const c = customers.find((x) => x.id === custId); return c ? <div className="text-xs text-emerald-400 bg-emerald-900/20 p-3 rounded-xl border border-emerald-700/20">📍 {c.address}{c.aadhar ? ` · Aadhar: ${c.aadhar}` : ""}</div> : null; })()}
          
          {custId && selectedCustomerDue > 0 && (
            <Alert variant="warning" title="This customer has pending dues!">
              <div className="flex items-center gap-3">
                <span>Outstanding balance: <span className="font-bold">{fmtCurrency(selectedCustomerDue)}</span></span>
                <button
                  onClick={() => { setView("list"); setInvSearch(customers.find((c) => String(c.id) === String(custId))?.name || ""); }}
                  className="ml-auto px-3 py-1 text-xs font-semibold rounded-lg bg-amber-600/20 hover:bg-amber-600/30 transition-colors"
                >
                  View Invoices
                </button>
              </div>
            </Alert>
          )}
          
          <div className="border-t border-emerald-800/30 pt-5">
            <h3 className="font-bold text-emerald-200 mb-3">Add Items</h3>
            <div className="flex gap-2 mb-2">
              <ItemCombobox items={items} value={addItemId} onChange={(v) => { setAddItemId(v); setLineError(""); }} />
              <input type="number" min={1} value={addQty} onChange={(e) => { setAddQty(e.target.value); setLineError(""); }} className="w-24 border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/20" placeholder="Qty" />
              <Btn onClick={addLine} disabled={!addItemId}>Add</Btn>
            </div>
            {lineError && (
              <div className="alert-error border rounded-xl px-3 py-2 mb-3 inline-flex items-center gap-2 text-xs font-semibold">
                <Icon name="warning" size={14} />
                {lineError}
              </div>
            )}
            {invItems.length > 0 && (
              <div className="card overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="thead-sticky"><tr>{["Item", "Qty", "Price", "Disc%", "Base", "Tax", "Total", "Delivery", ""].map((h) => <th key={h} className="text-left px-3 py-2 text-xs font-bold text-emerald-500/50">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-emerald-800/30">
                    {invItems.map((l, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2.5">{l.name}</td>
                        <td className="px-3 py-2.5">
                          <div className="inline-flex items-center gap-1">
                            <button type="button" aria-label="Decrease quantity" onClick={() => updateLineQty(i, l.qty - 1)} disabled={l.qty <= 1}
                              className="w-7 h-7 rounded-lg border border-emerald-700/30 bg-emerald-900/20 text-emerald-300 font-bold leading-none disabled:opacity-40 hover:bg-emerald-800/30">−</button>
                            <input type="number" min={1} value={l.qty}
                              onChange={(e) => updateLineQty(i, e.target.value)}
                              className="w-14 text-center border border-emerald-700/30 rounded-lg px-1 py-1 text-sm bg-emerald-900/20 focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                            <button type="button" aria-label="Increase quantity" onClick={() => updateLineQty(i, l.qty + 1)}
                              className="w-7 h-7 rounded-lg border border-emerald-700/30 bg-emerald-900/20 text-emerald-300 font-bold leading-none hover:bg-emerald-800/30">+</button>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">{fmtCurrency(l.price)}</td>
                        <td className="px-3 py-2.5">{l.discount}%</td>
                        <td className="px-3 py-2.5">{fmtCurrency(lineBase(l))}</td>
                        <td className="px-3 py-2.5 text-xs text-emerald-500/50">C:{l.cgst}%+S:{l.sgst}%</td>
                        <td className="px-3 py-2.5 font-bold text-emerald-400">{fmtCurrency(lineTotal(l))}</td>
                        <td className="px-3 py-2.5">
                          <button onClick={() => setInvItems((p) => p.map((item, idx) => idx === i ? { ...item, delivered: !item.delivered } : item))}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${l.delivered ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30" : "bg-amber-900/20 text-amber-400 border border-amber-700/30"}`}>
                            {l.delivered ? "✓ Delivered" : "Pending"}
                          </button>
                        </td>
                        <td className="px-3 py-2.5"><button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-400">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="flex-1 min-w-56 space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide">Amount Received (₹)</label>
                  <input type="number" min={0} max={grandTotal} value={paidAmountInput} onChange={(e) => setPaidAmountInput(e.target.value)}
                    className="w-full border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30"
                    placeholder="0 — leave blank for unpaid" />
                  {(() => {
                    const paid = Number(paidAmountInput) || 0;
                    if (!paidAmountInput) return <p className="text-xs text-emerald-500/50">No payment entered → status: <strong>Pending</strong></p>;
                    // Overpayment: flag it instead of silently capping to the total.
                    if (paid > grandTotal + 0.005) return <p className="text-xs text-red-400 font-semibold">⚠ Amount exceeds Grand Total by <strong>{fmtCurrency(paid - grandTotal)}</strong>. It will be capped to {fmtCurrency(grandTotal)}.</p>;
                    if (paid + 0.005 >= grandTotal) return <p className="text-xs text-emerald-600 font-semibold">✓ Fully paid → status: <strong>Paid</strong></p>;
                    return <p className="text-xs text-amber-400 font-semibold">Partial — Balance due: <strong>{fmtCurrency(grandTotal - paid)}</strong> → status: <strong>Partial</strong></p>;
                  })()}
                </div>
                
                {(Number(paidAmountInput) || 0) > 0 && (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide">Payment Method</label>
                    <div className="flex gap-2">
                      {[
                        { key: "cash", label: "💵 Cash", color: "#059669" },
                        { key: "upi", label: "📱 UPI", color: "#9333ea" },
                      ].map(({ key, label, color }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setInvoicePaymentMethod(key)}
                          className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                            invoicePaymentMethod === key
                              ? "text-white shadow-md"
                              : "bg-emerald-900/30 text-emerald-400 border border-emerald-700/30 hover:bg-emerald-900/50"
                          }`}
                          style={invoicePaymentMethod === key ? { background: color } : {}}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-5 py-4 rounded-xl border border-emerald-700/30 space-y-1 text-sm min-w-52" style={{ background: "linear-gradient(135deg,rgba(16,185,129,.08),rgba(99,102,241,.06))" }}>
                <div className="flex justify-between text-emerald-400/70"><span>Subtotal</span><span>{fmtCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-emerald-400/70"><span>Tax (CGST+SGST)</span><span>{fmtCurrency(totalTax)}</span></div>
                <div className="flex justify-between font-bold text-base border-t border-emerald-700/30 pt-2 page-title"><span>Grand Total</span><span>{fmtCurrency(grandTotal)}</span></div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2"><Btn onClick={saveInvoice} disabled={!custId || invItems.length === 0}>Create Invoice</Btn><Btn variant="secondary" onClick={() => setView("list")}>Cancel</Btn></div>
        </div>
      </div>
    );
  }

  // ── Invoice Detail View ──
  if (view === "detail" && selected) {
    const liveInv = invoices.find((inv) => inv.id === selected.id) || selected;
    const sel = liveInv;
    const cust = sel.customerId != null ? customers.find((c) => String(c.id) === String(sel.customerId)) : null;
    const dSubtotal = sel.items.reduce((s, l) => s + lineBase(l), 0);
    const dTax = sel.items.reduce((s, l) => s + lineTax(l), 0);
    const dCgstTotal = sel.items.reduce((s, l) => s + lineBase(l) * (num(l.cgst) / 100), 0);
    const dSgstTotal = sel.items.reduce((s, l) => s + lineBase(l) * (num(l.sgst) / 100), 0);
    const dTotal = dSubtotal + dTax;
    const stateName = stateCodeToName[storeInfo.stateCode] || "Tamil Nadu";
    
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("list")} className="text-emerald-500/50 hover:text-emerald-300 font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-emerald-900/40">← Back</button>
            <h1 className="text-xl font-bold text-emerald-100">Invoice {sel.id}</h1>
            <Badge color={sel.status === "paid" ? "green" : sel.status === "partial" ? "yellow" : "red"}>{sel.status}</Badge>
          </div>
          <div className="flex gap-2 items-center">
            {/* Invoice Format Toggle */}
            <div className="flex rounded-lg border border-emerald-700/30 overflow-hidden">
              <button 
                onClick={() => setInvoiceFormat("simple")}
                className={`px-3 py-1.5 text-xs font-semibold ${invoiceFormat === "simple" ? "bg-emerald-600 text-white" : "bg-emerald-900/30 text-emerald-400"}`}
              >
                Simple
              </button>
              <button 
                onClick={() => setInvoiceFormat("gst")}
                className={`px-3 py-1.5 text-xs font-semibold ${invoiceFormat === "gst" ? "bg-emerald-600 text-white" : "bg-emerald-900/30 text-emerald-400"}`}
              >
                GST Tax Invoice
              </button>
            </div>
            {canEdit && <Btn variant="outline" size="sm" onClick={() => openEditInv(sel)}>✏️ Edit</Btn>}
            {canEdit && <button onClick={() => setDeleteConfirm(sel)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl text-red-400 border border-red-800/30 hover:bg-red-900/30 transition-colors"><Icon name="trash" size={14} /> Delete</button>}
            <Btn variant="outline" size="sm" onClick={printInvoice}>🖨 Print</Btn>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════════
            GST TAX INVOICE FORMAT 
        ═══════════════════════════════════════════════════════════════════════════ */}
        {invoiceFormat === "gst" && (
          <div id="invoice-print" className="bg-white text-black p-6 max-w-4xl mx-auto shadow-lg" style={{ fontFamily: "Arial, sans-serif" }}>
            {/* Header */}
            <div className="text-center border-b-2 border-black pb-2 mb-4">
              <h1 className="text-xl font-bold">TAX INVOICE</h1>
              <p className="text-xs text-gray-600">(Original for Recipient)</p>
            </div>
            
            {/* Seller & Buyer Details */}
            <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
              <div className="border border-gray-400 p-3">
                <p className="font-bold text-sm mb-1">SELLER DETAILS</p>
                <p className="font-bold">{storeInfo.name}</p>
                <p>{storeInfo.address || "—"}</p>
                <p>State: {stateName} | Code: {storeInfo.stateCode || "33"}</p>
                {storeInfo.gstNo && <p><strong>GSTIN:</strong> {storeInfo.gstNo}</p>}
                {storeInfo.phone && <p>Phone: {storeInfo.phone}</p>}
                {storeInfo.email && <p>Email: {storeInfo.email}</p>}
              </div>
              <div className="border border-gray-400 p-3">
                <p className="font-bold text-sm mb-1">BUYER DETAILS</p>
                <p className="font-bold">{cust?.name || sel.customerName || "Cash Customer"}</p>
                <p>{cust?.address || "—"}</p>
                <p>State: {stateName} | Code: {storeInfo.stateCode || "33"}</p>
                {cust?.gstin && <p><strong>GSTIN:</strong> {cust.gstin}</p>}
                {cust?.phone && <p>Phone: {cust.phone}</p>}
                <p><strong>Place of Supply:</strong> {stateName}</p>
              </div>
            </div>
            
            {/* Invoice Details */}
            <div className="grid grid-cols-4 gap-2 mb-4 text-xs border border-gray-400">
              <div className="p-2 border-r border-gray-400">
                <p className="text-gray-600">Invoice No.</p>
                <p className="font-bold">{sel.id}</p>
              </div>
              <div className="p-2 border-r border-gray-400">
                <p className="text-gray-600">Invoice Date</p>
                <p className="font-bold">{fmtDate(sel.date?.split(" ")[0] || sel.date)}</p>
              </div>
              <div className="p-2 border-r border-gray-400">
                <p className="text-gray-600">Due Date</p>
                <p className="font-bold">{sel.status === "paid" ? "Paid" : "On Receipt"}</p>
              </div>
              <div className="p-2">
                <p className="text-gray-600">Reverse Charge</p>
                <p className="font-bold">No</p>
              </div>
            </div>
            
            {/* Items Table */}
            <table className="w-full text-xs mb-4 border-collapse border border-gray-400">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-400 p-2 text-left">S.No</th>
                  <th className="border border-gray-400 p-2 text-left">Description</th>
                  <th className="border border-gray-400 p-2 text-center">HSN</th>
                  <th className="border border-gray-400 p-2 text-center">Qty</th>
                  <th className="border border-gray-400 p-2 text-center">Unit</th>
                  <th className="border border-gray-400 p-2 text-right">Rate</th>
                  <th className="border border-gray-400 p-2 text-center">Disc%</th>
                  <th className="border border-gray-400 p-2 text-right">Taxable</th>
                  <th className="border border-gray-400 p-2 text-center">CGST%</th>
                  <th className="border border-gray-400 p-2 text-right">CGST</th>
                  <th className="border border-gray-400 p-2 text-center">SGST%</th>
                  <th className="border border-gray-400 p-2 text-right">SGST</th>
                  <th className="border border-gray-400 p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {sel.items.map((l, i) => {
                  const item = items.find(it => String(it.id) === String(l.itemId));
                  const base = lineBase(l);
                  const cgstAmt = base * (num(l.cgst) / 100);
                  const sgstAmt = base * (num(l.sgst) / 100);
                  return (
                    <tr key={i}>
                      <td className="border border-gray-400 p-2 text-center">{i + 1}</td>
                      <td className="border border-gray-400 p-2">{l.name}</td>
                      <td className="border border-gray-400 p-2 text-center">{item?.hsnCode || "—"}</td>
                      <td className="border border-gray-400 p-2 text-center">{l.qty}</td>
                      <td className="border border-gray-400 p-2 text-center">{item?.unit || "Pcs"}</td>
                      <td className="border border-gray-400 p-2 text-right">₹{l.price.toFixed(2)}</td>
                      <td className="border border-gray-400 p-2 text-center">{l.discount}%</td>
                      <td className="border border-gray-400 p-2 text-right">₹{base.toFixed(2)}</td>
                      <td className="border border-gray-400 p-2 text-center">{l.cgst}%</td>
                      <td className="border border-gray-400 p-2 text-right">₹{cgstAmt.toFixed(2)}</td>
                      <td className="border border-gray-400 p-2 text-center">{l.sgst}%</td>
                      <td className="border border-gray-400 p-2 text-right">₹{sgstAmt.toFixed(2)}</td>
                      <td className="border border-gray-400 p-2 text-right font-bold">₹{(base + cgstAmt + sgstAmt).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan="7" className="border border-gray-400 p-2 text-right font-bold">Total</td>
                  <td className="border border-gray-400 p-2 text-right font-bold">₹{dSubtotal.toFixed(2)}</td>
                  <td className="border border-gray-400 p-2"></td>
                  <td className="border border-gray-400 p-2 text-right font-bold">₹{dCgstTotal.toFixed(2)}</td>
                  <td className="border border-gray-400 p-2"></td>
                  <td className="border border-gray-400 p-2 text-right font-bold">₹{dSgstTotal.toFixed(2)}</td>
                  <td className="border border-gray-400 p-2 text-right font-bold">₹{dTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            
            {/* Amount in Words */}
            <div className="border border-gray-400 p-3 mb-4">
              <p className="text-xs"><strong>Amount in Words:</strong> {amountInWords(dTotal)}</p>
            </div>
            
            {/* Bank Details & Terms */}
            <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
              <div className="border border-gray-400 p-3">
                <p className="font-bold mb-1">BANK DETAILS</p>
                {storeInfo.bankName && <p>Bank: {storeInfo.bankName}</p>}
                {storeInfo.bankAccount && <p>A/C No: {storeInfo.bankAccount}</p>}
                {storeInfo.ifscCode && <p>IFSC: {storeInfo.ifscCode}</p>}
                {storeInfo.bankBranch && <p>Branch: {storeInfo.bankBranch}</p>}
                {storeInfo.upiId && <p>UPI: {storeInfo.upiId}</p>}
                {!storeInfo.bankName && <p className="text-gray-500 italic">Bank details not configured</p>}
              </div>
              <div className="border border-gray-400 p-3">
                <p className="font-bold mb-1">TERMS & CONDITIONS</p>
                <p className="text-xs">1. Goods once sold will not be taken back.</p>
                <p className="text-xs">2. Interest @18% p.a. on overdue payments.</p>
                <p className="text-xs">3. Subject to local jurisdiction.</p>
                <p className="text-xs">4. E. & O.E.</p>
              </div>
            </div>
            
            {/* Signature */}
            <div className="flex justify-between items-end mt-8">
              <div className="text-xs">
                <p className="mb-8">Customer Signature</p>
                <p className="border-t border-gray-400 pt-1">_______________________</p>
              </div>
              <div className="text-xs text-right">
                <p className="font-bold">{storeInfo.name}</p>
                <p className="mb-6">Authorized Signatory</p>
                <p className="border-t border-gray-400 pt-1">_______________________</p>
              </div>
            </div>
            
            {/* Payment Status (no-print) */}
            <div className="mt-6 no-print p-4 rounded-xl border border-gray-300 bg-white shadow-sm">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-emerald-600">Paid: {fmtCurrency(sel.paidAmount || 0)}</p>
                  <p className="text-sm font-semibold text-emerald-700">Balance: {fmtCurrency(dTotal - (sel.paidAmount || 0))}</p>
                  {dTotal - (sel.paidAmount || 0) > 0 && isOverdue(sel) && (
                    <p className="text-xs text-red-500 mt-1">💰 Overdue — unpaid for <strong>{daysSinceInvoice(sel.date)} days</strong></p>
                  )}
                </div>
                {dTotal - (sel.paidAmount || 0) > 0 && (
                  <button onClick={() => setPayModal(sel)} className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm" style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}>
                    💵 Record Payment
                  </button>
                )}
              </div>
            </div>
            
            {/* Payment History (no-print) */}
            {(sel.payments || []).length > 0 && (
              <div className="mt-4 no-print">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">💳 Payment History</p>
                <div className="rounded-xl border border-gray-300 overflow-hidden bg-white">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-gray-100">{["Date", "Method", "Amount", "Note"].map((h) => <th key={h} className="text-left px-3 py-2 text-gray-600">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-200">
                      {(sel.payments || []).map((p, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-gray-700">{fmtDateTime(p.date)}</td>
                          <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${p.method === "upi" ? "bg-purple-100 text-purple-600" : "bg-emerald-100 text-emerald-600"}`}>{p.method === "upi" ? "UPI" : "Cash"}</span></td>
                          <td className="px-3 py-2 font-bold text-emerald-600">{fmtCurrency(p.amount)}</td>
                          <td className="px-3 py-2 text-gray-500">{p.note || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {/* Delivery Status (no-print) */}
            <div className="mt-4 no-print">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">📦 Delivery Status</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {sel.items.map((l, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg border border-gray-300 bg-white">
                    <span className="text-xs text-gray-700 truncate flex-1">{l.name}</span>
                    <button 
                      onClick={() => { 
                        const updatedItems = sel.items.map((item, idx) => idx === i ? { ...item, delivered: !item.delivered } : item); 
                        setInvoices((prev) => prev.map((inv) => inv.id === sel.id ? { ...inv, items: updatedItems } : inv)); 
                      }}
                      className={`ml-2 px-2 py-1 rounded text-xs font-bold ${l.delivered ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}
                    >
                      {l.delivered ? "✓" : "⏳"}
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                {sel.items.filter(l => l.delivered).length} of {sel.items.length} items delivered
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════════
            SIMPLE INVOICE FORMAT (Original)
        ═══════════════════════════════════════════════════════════════════════════ */}
        {invoiceFormat === "simple" && (
        <div id="invoice-print" className="card p-8 max-w-3xl">
          <div className="flex items-start justify-between mb-6 pb-6 border-b border-emerald-800/30">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/95 shadow-md p-1"><img src={riceIcon} alt="" className="w-full h-full object-contain" /></div>
                <span className="font-bold text-xl text-emerald-100">{storeInfo.name}</span>
              </div>
              {storeInfo.address && <p className="text-sm text-emerald-500/50">📍 {storeInfo.address}</p>}
              {storeInfo.phone && <p className="text-sm text-emerald-500/50">📞 {storeInfo.phone}</p>}
              {storeInfo.email && <p className="text-sm text-emerald-500/50">✉ {storeInfo.email}</p>}
              {(storeInfo.gstNo || storeInfo.pesticidesLicense || storeInfo.fertilizersLicense) && (
                <div className="mt-2 pt-2 border-t border-emerald-800/20 space-y-0.5">
                  {storeInfo.gstNo && <p className="text-xs text-emerald-500/70"><span className="font-semibold">GST No:</span> {storeInfo.gstNo}</p>}
                  {storeInfo.pesticidesLicense && <p className="text-xs text-emerald-500/70"><span className="font-semibold">Pesticides Lic:</span> {storeInfo.pesticidesLicense}</p>}
                  {storeInfo.fertilizersLicense && <p className="text-xs text-emerald-500/70"><span className="font-semibold">Fertilizers Lic:</span> {storeInfo.fertilizersLicense}</p>}
                </div>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-emerald-100">INVOICE</p>
              <p className="text-sm text-emerald-500/50 font-mono mt-1">#{sel.id}</p>
              <p className="text-sm text-emerald-500/50">Date: {fmtDateTime(sel.date)}</p>
              <div className="mt-2"><Badge color={sel.status === "paid" ? "green" : sel.status === "partial" ? "yellow" : "red"}>{sel.status}</Badge></div>
            </div>
          </div>
          <div className="mb-6 p-4 rounded-xl border border-emerald-700/20" style={{ background: "linear-gradient(135deg,rgba(16,185,129,.05),rgba(99,102,241,.03))" }}>
            <p className="text-xs font-bold text-emerald-500/50 uppercase tracking-wide mb-2">Bill To</p>
            <p className="font-bold text-emerald-100">{cust?.name || sel.customerName || "Unknown"}</p>
            {cust?.address && <p className="text-sm text-emerald-400/70">{cust.address}</p>}
            {cust?.phone && <p className="text-sm text-emerald-400/70">📞 {cust.phone}</p>}
            {cust?.aadhar && <p className="text-sm text-emerald-400/70">Aadhar: {cust.aadhar}</p>}
          </div>
          <table className="w-full text-sm mb-6">
            <thead className="thead-sticky">
              <tr>{["Item", "Qty", "Price", "Disc", "CGST", "SGST", "Amount", "Delivery"].map((h) => <th key={h} className={`text-left px-3 py-2.5 text-xs font-bold text-emerald-400/70 uppercase ${h === "Delivery" ? "no-print" : ""}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-emerald-800/30">
              {sel.items.map((l, i) => {
                const base = lineBase(l);
                const cgstAmt = base * (num(l.cgst) / 100); const sgstAmt = base * (num(l.sgst) / 100);
                return (
                  <tr key={i}>
                    <td className="px-3 py-3">{l.name}</td><td className="px-3 py-3">{l.qty}</td>
                    <td className="px-3 py-3">{fmtCurrency(l.price)}</td><td className="px-3 py-3">{l.discount}%</td>
                    <td className="px-3 py-3 text-xs">{l.cgst}%<br /><span className="text-emerald-500/50">{fmtCurrency(cgstAmt)}</span></td>
                    <td className="px-3 py-3 text-xs">{l.sgst}%<br /><span className="text-emerald-500/50">{fmtCurrency(sgstAmt)}</span></td>
                    <td className="px-3 py-3 font-bold">{fmtCurrency(base + cgstAmt + sgstAmt)}</td>
                    <td className="px-3 py-3 no-print">
                      <button onClick={() => { const updatedItems = sel.items.map((item, idx) => idx === i ? { ...item, delivered: !item.delivered } : item); setInvoices((prev) => prev.map((inv) => inv.id === sel.id ? { ...inv, items: updatedItems } : inv)); }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${l.delivered ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30" : "bg-amber-900/20 text-amber-400 border border-amber-700/30"}`}>
                        {l.delivered ? "✓ Delivered" : "Pending"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            {(() => {
              const paid = sel.paidAmount || 0;
              const balance = dTotal - paid;
              return (
                <div className="flex-1 min-w-48 p-4 rounded-xl border space-y-2 text-sm" style={{ background: "linear-gradient(135deg,rgba(251,191,36,.08),rgba(245,158,11,.05))", borderColor: "rgba(245,158,11,.25)" }}>
                  <p className="text-xs font-bold text-emerald-500/50 uppercase tracking-wide mb-1">Payment Summary</p>
                  <div className="flex justify-between text-emerald-300"><span>Total Amount</span><span className="font-bold">{fmtCurrency(dTotal)}</span></div>
                  <div className="flex justify-between text-emerald-400"><span>Amount Paid</span><span className="font-bold">{fmtCurrency(paid)}</span></div>
                  <div className={`flex justify-between font-bold text-base border-t pt-2 ${balance > 0 ? "text-red-400" : "text-emerald-400"}`} style={{ borderColor: "rgba(245,158,11,.2)" }}>
                    <span>Balance Due</span><span>{fmtCurrency(balance)}</span>
                  </div>
                  {balance > 0 && isOverdue(sel) && (
                    <div className="flex items-center gap-1.5 bg-purple-900/20 border border-purple-800/30 rounded-xl px-3 py-2 text-xs font-semibold text-purple-400">
                      💰 Overdue — unpaid for <strong>{daysSinceInvoice(sel.date)} days</strong>
                    </div>
                  )}
                  {balance > 0 && (
                    <button onClick={() => setPayModal(sel)} className="no-print mt-1 w-full py-2 rounded-xl text-xs font-bold text-white shadow-sm" style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}>
                      💵 Record Payment
                    </button>
                  )}
                </div>
              );
            })()}
            <div className="w-64 p-4 rounded-xl border border-emerald-700/30 space-y-2 text-sm" style={{ background: "linear-gradient(135deg,rgba(16,185,129,.07),rgba(99,102,241,.05))" }}>
              <div className="flex justify-between text-emerald-400/70"><span>Subtotal</span><span>{fmtCurrency(dSubtotal)}</span></div>
              <div className="flex justify-between text-emerald-400/70"><span>Tax (CGST+SGST)</span><span>{fmtCurrency(dTax)}</span></div>
              <div className="flex justify-between font-bold text-base border-t border-emerald-700/30 pt-2 page-title"><span>Total</span><span>{fmtCurrency(dTotal)}</span></div>
            </div>
          </div>
          {(sel.payments || []).length > 0 && (
            <div className="mt-6 no-print">
              <p className="text-xs font-bold text-emerald-500/50 uppercase tracking-wide mb-3">💳 Payment History</p>
              <div className="rounded-xl border border-emerald-700/30 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="thead-sticky">
                    <tr>{["#", "Date", "Method", "Amount", "Note", "Recorded By"].map((h) => <th key={h} className="text-left px-4 py-2.5 text-xs font-bold text-emerald-400/70 uppercase">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-800/30">
                    {(sel.payments || []).map((p, i) => (
                      <tr key={i} className="hover:bg-emerald-800/20">
                        <td className="px-4 py-2.5 text-emerald-500/50 text-xs">{i + 1}</td>
                        <td className="px-4 py-2.5 text-emerald-300">{fmtDateTime(p.date)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.method === "upi" ? "bg-purple-900/30 text-purple-400" : "bg-emerald-900/30 text-emerald-400"}`}>
                            {p.method === "upi" ? "📱 UPI" : "💵 Cash"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-emerald-400">{fmtCurrency(p.amount)}</td>
                        <td className="px-4 py-2.5 text-emerald-500/50 text-xs">{p.note || "—"}</td>
                        <td className="px-4 py-2.5 text-emerald-400/70 text-xs">{p.recordedBy || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="mt-6 no-print">
            <p className="text-xs font-bold text-emerald-500/50 uppercase tracking-wide mb-3">📦 Delivery Status</p>
            <div className="p-4 rounded-xl border border-emerald-700/30" style={{ background: "linear-gradient(135deg,rgba(16,185,129,.05),rgba(99,102,241,.03))" }}>
              {(() => {
                const total = sel.items.length;
                const delivered = sel.items.filter((l) => l.delivered).length;
                const pending = total - delivered;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between"><span className="text-sm text-emerald-400/70">Total Items</span><span className="font-bold text-emerald-200">{total}</span></div>
                    <div className="flex items-center justify-between"><span className="text-sm text-emerald-400">Delivered</span><span className="font-bold text-emerald-400">{delivered}</span></div>
                    <div className="flex items-center justify-between"><span className="text-sm text-amber-400">Pending</span><span className="font-bold text-amber-400">{pending}</span></div>
                    <div className="w-full bg-emerald-900/30 rounded-full h-2 mt-2">
                      <div className="h-2 rounded-full transition-all" style={{ width: `${total > 0 ? (delivered / total) * 100 : 0}%`, background: "linear-gradient(90deg,#059669,#10b981)" }} />
                    </div>
                    <p className="text-xs text-center text-emerald-500/50 mt-1">
                      {delivered === total && total > 0 ? "All items delivered" : delivered === 0 ? "No items delivered yet" : `${delivered} of ${total} items delivered`}
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="mt-8 pt-4 border-t border-emerald-800/30 text-xs text-emerald-500/50">Created by {sel.createdBy} · {sel.date}</div>
        </div>
        )}
        
        {payModal && <RecordPaymentModal invoice={payModal} onRecord={recordPayment} onClose={() => setPayModal(null)} />}
        {deleteConfirm && (
          <Modal title="Delete Invoice" onClose={() => setDeleteConfirm(null)}>
            <div className="space-y-4">
              <Alert variant="error" title={`Delete Invoice #${deleteConfirm.id}?`}>
                <p className="mb-2">This will permanently remove this invoice and <strong>restore the stock</strong> for all items.</p>
                <ul className="space-y-1 text-xs opacity-90">
                  {deleteConfirm.items.map((l, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <Icon name="package" size={12} />
                      {l.name} — +{l.qty} units restored
                    </li>
                  ))}
                </ul>
              </Alert>
              <div className="flex gap-2 justify-end">
                <Btn variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
                <button onClick={() => deleteInvoice(deleteConfirm)} className="px-4 py-2 text-sm font-bold rounded-xl text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md">Yes, Delete Invoice</button>
              </div>
            </div>
          </Modal>
        )}
        {editInv && (
          <Modal title={`✏️ Edit Invoice — ${editInv.id}`} onClose={() => setEditInv(null)}>
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/30 text-xs text-emerald-400 font-semibold">
                ✏️ Edit the invoice date or update the paid amount.
              </div>
              <Input label="Invoice Date" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide">Total Amount Paid (₹)</label>
                <input type="number" min={0} max={editInv.total} value={editPaid} onChange={(e) => setEditPaid(e.target.value)}
                  className="w-full border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30" />
                <div className="flex justify-between text-xs text-emerald-400/70 pt-1">
                  <span>Invoice Total: <strong>₹{editInv.total.toLocaleString("en-IN")}</strong></span>
                  <span className={`font-bold ${(editInv.total - (Number(editPaid) || 0)) > 0 ? "text-red-400" : "text-emerald-600"}`}>
                    Balance: ₹{Math.max(0, editInv.total - (Number(editPaid) || 0)).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Btn onClick={saveEditInvoice}>Save Changes</Btn>
                <Btn variant="secondary" onClick={() => setEditInv(null)}>Cancel</Btn>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ── Invoice List View ──
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold page-title flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Invoices
        </h1>
        <div className="flex gap-2 flex-wrap">
          {canEdit && <><input ref={invXlsxRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleInvExcel} /><Btn variant="outline" size="sm" onClick={() => invXlsxRef.current?.click()}>📊 Import Excel</Btn></>}
          <Btn variant="outline" size="sm" onClick={() => exportCSV("invoices.csv", ["Invoice#","Customer","Date","Status","Subtotal","Tax","Total","Paid","Balance","CreatedBy"], invoices.map((inv) => { const c = inv.customerId != null ? customers.find((x) => String(x.id) === String(inv.customerId)) : null; return [inv.id, c?.name || inv.customerName || "", inv.date, inv.status, inv.subtotal, inv.totalTax, inv.total, inv.paidAmount || 0, inv.total - (inv.paidAmount || 0), inv.createdBy || ""]; }))}>⬇ Export CSV</Btn>
          <Btn size="sm" onClick={() => setInvoiceState({ view: "create", custId: "", invItems: [], selected: null })}>+ Create Invoice</Btn>
        </div>
      </div>
      
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-emerald-500/60 uppercase">Filter:</span>
        {[
          { key: "today", label: "Today", icon: "📅" },
          { key: "thisMonth", label: "This Month", icon: "🗓" },
          { key: "custom", label: "Custom", icon: "📆" },
          { key: "all", label: "All Time", icon: "📊" },
        ].map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setDateFilter(key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              dateFilter === key ? "bg-emerald-600 text-white shadow-md" : "bg-emerald-900/30 text-emerald-400 border border-emerald-700/30 hover:bg-emerald-900/50"
            }`}
          >
            {icon} {label}
          </button>
        ))}
      </div>
      
      {dateFilter === "custom" && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
          <span className="text-xs font-semibold text-emerald-500/70">From:</span>
          <input type="date" value={customDateFrom} onChange={(e) => setCustomDateFrom(e.target.value)} className="border border-emerald-700/30 rounded-lg px-3 py-1.5 text-sm bg-emerald-900/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/40" />
          <span className="text-xs font-semibold text-emerald-500/70">To:</span>
          <input type="date" value={customDateTo} onChange={(e) => setCustomDateTo(e.target.value)} className="border border-emerald-700/30 rounded-lg px-3 py-1.5 text-sm bg-emerald-900/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/40" />
          {(customDateFrom || customDateTo) && (
            <button onClick={() => { setCustomDateFrom(""); setCustomDateTo(""); }} className="text-xs text-emerald-500/50 hover:text-emerald-400">✕ Clear</button>
          )}
        </div>
      )}

      {/* Status filter chips with live counts */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        <span className="text-xs font-semibold text-emerald-500/60 uppercase">Status:</span>
        {[
          { key: "all", label: "All", icon: "📋", activeBg: "bg-emerald-600", activeText: "text-white" },
          { key: "unpaid", label: "Unpaid", icon: "⏳", activeBg: "bg-red-600", activeText: "text-white" },
          { key: "partial", label: "Partial", icon: "💵", activeBg: "bg-amber-600", activeText: "text-white" },
          { key: "paid", label: "Paid", icon: "💰", activeBg: "bg-green-600", activeText: "text-white" },
          { key: "overdue", label: "Overdue", icon: "🔴", activeBg: "bg-purple-600", activeText: "text-white" },
          { key: "pendingDelivery", label: "Pending Delivery", icon: "🚚", activeBg: "bg-blue-600", activeText: "text-white" },
        ].map(({ key, label, icon, activeBg, activeText }) => {
          const count = statusCounts[key] || 0;
          const active = statusFilter === key;
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 ${
                active
                  ? `${activeBg} ${activeText} shadow-md`
                  : "bg-emerald-900/30 text-emerald-400 border border-emerald-700/30 hover:bg-emerald-900/50"
              }`}
              aria-pressed={active}
            >
              <span aria-hidden="true">{icon}</span>
              <span>{label}</span>
              <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${active ? "bg-white/25" : "bg-emerald-800/50 text-emerald-300"}`}>{count}</span>
            </button>
          );
        })}
      </div>
      
      <input className="w-full border border-emerald-700/30 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-emerald-900/30 shadow-sm" placeholder="Search by invoice #, customer name or status…" value={invSearch} onChange={(e) => setInvSearch(e.target.value)} />
      
      <div className="card overflow-hidden overflow-x-auto">
        <div className="section-header flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-emerald-300">
            {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""}
            {(debouncedSearch || dateFilter !== "all") && ` (filtered from ${invoices.length})`}
          </h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-emerald-500/60">Total: <strong className="text-emerald-300">{fmtCurrency(invoiceTotals.totalAmount)}</strong></span>
            <span className="text-emerald-500/60">Paid: <strong className="text-emerald-400">{fmtCurrency(invoiceTotals.totalPaid)}</strong></span>
            <span className="text-emerald-500/60">Balance: <strong className={invoiceTotals.totalBalance > 0 ? "text-red-400" : "text-emerald-400"}>{fmtCurrency(invoiceTotals.totalBalance)}</strong></span>
          </div>
        </div>
        
        {filteredInvoices.length > 10 && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-emerald-800/30">
            <span className="text-xs text-emerald-500/60">Show:</span>
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="px-2 py-1 rounded-lg text-xs bg-emerald-900/40 border border-emerald-700/30 text-emerald-200 focus:outline-none">
              {[10, 25, 50, 100].map((size) => (<option key={size} value={size}>{size} per page</option>))}
            </select>
          </div>
        )}
        
        <div className="overflow-y-auto max-h-[calc(100vh-400px)]">
        <table className="w-full text-sm">
          <thead className="thead-sticky">
            <tr>{["Invoice #", "Customer", "Date", "Total", "Paid", "Balance", "Status", "Actions"].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-bold text-emerald-500/50 uppercase tracking-wide">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-emerald-800/30">
            {pagination.paginatedItems.map((inv) => {
              const c = inv.customerId != null ? customers.find((x) => String(x.id) === String(inv.customerId)) : null;
              const paid = inv.paidAmount || 0;
              const balance = inv.total - paid;
              const statusColor = inv.status === "paid" ? "green" : inv.status === "partial" ? "yellow" : "red";
              const overdue = isOverdue(inv);
              const daysPast = overdue ? daysSinceInvoice(inv.date) : 0;
              return (
                <tr key={inv.id} className={`transition-colors ${overdue ? "bg-purple-900/20 hover:bg-purple-900/30" : "hover:bg-emerald-800/20"}`}>
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-emerald-400">{inv.id}</span>
                    {overdue && <p className="text-xs font-bold text-purple-400 mt-0.5">💰 {daysPast}d overdue</p>}
                  </td>
                  <td className="px-4 py-3 font-medium text-emerald-200">{c?.name || inv.customerName || "—"}</td>
                  <td className="px-4 py-3 text-emerald-400/70">{fmtDateTime(inv.date)}</td>
                  <td className="px-4 py-3 font-bold text-emerald-100">{fmtCurrency(inv.total)}</td>
                  <td className="px-4 py-3 text-emerald-400 font-semibold">{fmtCurrency(paid)}</td>
                  <td className="px-4 py-3"><span className={`font-bold ${balance > 0 ? "text-red-400" : "text-emerald-600"}`}>{fmtCurrency(balance)}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <Badge color={statusColor}>{inv.status === "paid" ? "✓ Paid" : inv.status === "partial" ? "◐ Partial" : "✗ Unpaid"}</Badge>
                      {overdue && <Badge color="indigo">⏰ Overdue</Badge>}
                      {(() => { const total = inv.items.length; const delivered = inv.items.filter((l) => l.delivered).length; return delivered === total && total > 0 ? <Badge color="green">📦 Delivered</Badge> : delivered > 0 ? <Badge color="yellow">📦 Partial</Badge> : <Badge color="red">📦 Pending</Badge>; })()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      <Btn size="sm" variant="secondary" onClick={() => setInvoiceState((s) => ({ ...s, view: "detail", selected: inv }))}>View</Btn>
                      {balance > 0 && <Btn size="sm" variant="outline" onClick={() => setPayModal(inv)}>💵 Pay</Btn>}
                      {inv.items.length > 0 && inv.items.some((l) => !l.delivered) && (
                        <Btn size="sm" variant="outline" onClick={() => setDeliveryModal(inv)}>🚚 Deliver</Btn>
                      )}
                      {canEdit && <Btn size="sm" variant="outline" onClick={() => openEditInv(inv)}>✏️ Edit</Btn>}
                      {canEdit && <button onClick={() => setDeleteConfirm(inv)} aria-label="Delete invoice" className="inline-flex items-center justify-center px-2.5 py-1.5 text-xs font-semibold rounded-xl text-red-400 border border-red-800/30 hover:bg-red-900/30 transition-colors"><Icon name="trash" size={14} /></button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredInvoices.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-16 text-center">
                <EmptyState
                  icon="📋"
                  title={invoices.length === 0 ? "No invoices yet" : "No invoices match"}
                  description={
                    invoices.length === 0 ? "Create your first invoice to get started"
                    : debouncedSearch ? `No invoices match "${invSearch.trim()}"`
                    : statusFilter !== "all" ? `No invoices with status "${statusFilter}" in selected date range`
                    : dateFilter !== "all" ? "No invoices in selected date range"
                    : "Try adjusting your filters"
                  }
                  action={() => setView("create")}
                  actionLabel="+ Create Invoice"
                />
              </td></tr>
            )}
          </tbody>
          {filteredInvoices.length > 0 && (
            <tfoot className="sticky bottom-0 bg-emerald-950/95 backdrop-blur border-t-2 border-emerald-700/40 z-10">
              <tr className="text-xs font-bold">
                <td colSpan={3} className="px-4 py-2.5 text-emerald-300 uppercase tracking-wide">
                  Totals · {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""}
                </td>
                <td className="px-4 py-2.5 text-emerald-100">{fmtCurrency(invoiceTotals.totalAmount)}</td>
                <td className="px-4 py-2.5 text-emerald-400">{fmtCurrency(invoiceTotals.totalPaid)}</td>
                <td className={`px-4 py-2.5 ${invoiceTotals.totalBalance > 0 ? "text-red-400" : "text-emerald-500"}`}>{fmtCurrency(invoiceTotals.totalBalance)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
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
      </div>
      
      {payModal && <RecordPaymentModal invoice={payModal} onRecord={recordPayment} onClose={() => setPayModal(null)} />}

      {/* Delivery Management Modal */}
      {deliveryModal && (() => {
        const dm = deliveryModal;
        const dc = dm.customerId != null ? customers.find((x) => String(x.id) === String(dm.customerId)) : null;
        const totalLines = dm.items.length;
        const deliveredCount = dm.items.filter((l) => l.delivered).length;
        const allDelivered = totalLines > 0 && deliveredCount === totalLines;
        const noneDelivered = deliveredCount === 0;
        return (
          <Modal title={`🚚 Delivery — ${dm.id}`} onClose={() => setDeliveryModal(null)} wide>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-xl" style={{ background:"rgba(16,185,129,.08)", border:"1px solid rgba(34,197,94,.15)" }}>
                <div>
                  <p className="text-xs text-emerald-500/60 uppercase">Customer</p>
                  <p className="font-bold text-emerald-200">{dc?.name || dm.customerName || "Cash Customer"}</p>
                </div>
                <div>
                  <p className="text-xs text-emerald-500/60 uppercase">Phone</p>
                  <p className="text-emerald-300">{dc?.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-emerald-500/60 uppercase">Date</p>
                  <p className="text-emerald-300">{fmtDate(dm.date)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl" style={{ background:"rgba(59,130,246,.06)", border:"1px solid rgba(59,130,246,.2)" }}>
                <div>
                  <p className="text-xs text-blue-300/70 uppercase">Delivery Progress</p>
                  <p className="text-base font-bold text-blue-300">{deliveredCount} / {totalLines} items delivered</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Btn size="sm" variant="outline" onClick={() => markAllDelivered(dm.id)} disabled={allDelivered}>✓ Mark all delivered</Btn>
                  <Btn size="sm" variant="outline" onClick={() => resetAllDelivered(dm.id)} disabled={noneDelivered}>↺ Reset all</Btn>
                  <button onClick={() => printDeliveryChallan(dm)} className="px-3 py-1.5 text-xs font-bold rounded-xl text-white shadow-md inline-flex items-center gap-1.5" style={{ background:"linear-gradient(135deg,#3b82f6,#2563eb)" }}>🖨 Print Delivery Challan</button>
                </div>
              </div>

              <div className="rounded-xl overflow-hidden" style={{ border:"1px solid rgba(34,197,94,.2)" }}>
                <table className="w-full text-sm">
                  <thead className="thead-sticky">
                    <tr>
                      {["✓", "Item", "Qty", "Status", "Delivered At"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-bold text-emerald-500/60 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-800/30">
                    {dm.items.map((l, i) => (
                      <tr key={i} className={l.delivered ? "bg-emerald-900/20" : "hover:bg-emerald-900/10"}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={!!l.delivered} onChange={() => toggleLineDelivered(dm.id, i)} className="w-4 h-4 accent-emerald-500" aria-label={`Mark ${l.name} as ${l.delivered ? "not delivered" : "delivered"}`} />
                        </td>
                        <td className="px-3 py-2 font-medium text-emerald-200">{l.name}</td>
                        <td className="px-3 py-2 text-emerald-300">{l.qty}</td>
                        <td className="px-3 py-2">
                          {l.delivered ? <Badge color="green">✓ Delivered</Badge> : <Badge color="red">⏳ Pending</Badge>}
                        </td>
                        <td className="px-3 py-2 text-xs text-emerald-400/70">
                          {l.deliveredAt ? fmtDateTime(l.deliveredAt) : <span className="text-emerald-600/40">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2 pt-1">
                <Btn variant="secondary" onClick={() => setDeliveryModal(null)}>Close</Btn>
              </div>
            </div>
          </Modal>
        );
      })()}

      {deleteConfirm && (
        <Modal title="Delete Invoice" onClose={() => setDeleteConfirm(null)}>
          <div className="space-y-4">
            <Alert variant="error" title={`Delete Invoice #${deleteConfirm.id}?`}>
              <p className="mb-2">This will permanently remove this invoice and <strong>restore the stock</strong> for all items in this invoice.</p>
              <ul className="space-y-1 text-xs opacity-90">
                {deleteConfirm.items.map((l, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <Icon name="package" size={12} />
                    {l.name} — +{l.qty} units restored
                  </li>
                ))}
              </ul>
            </Alert>
            <div className="flex gap-2 justify-end">
              <Btn variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
              <button onClick={() => deleteInvoice(deleteConfirm)} className="px-4 py-2 text-sm font-bold rounded-xl text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md">Yes, Delete Invoice</button>
            </div>
          </div>
        </Modal>
      )}

      {invXlsxPreview && (
        <Modal title="📊 Import Invoices from Excel" onClose={() => setInvXlsxPreview(null)} wide>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-emerald-400 font-semibold">{invXlsxPreview.rows.filter((r) => r._selected).length} of {invXlsxPreview.rows.length} selected</span>
            </div>
            <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-emerald-700/30">
              <table className="w-full text-xs">
                <thead className="thead-sticky">
                  <tr>
                    <th className="px-2 py-2 text-left"><input type="checkbox" checked={invXlsxPreview.rows.every((r) => r._selected)} onChange={toggleAllInvXlsx} /></th>
                    <th className="px-2 py-2 text-left text-emerald-500/60 uppercase font-bold">Customer</th>
                    <th className="px-2 py-2 text-left text-emerald-500/60 uppercase font-bold">Date</th>
                    <th className="px-2 py-2 text-left text-emerald-500/60 uppercase font-bold">Total</th>
                    <th className="px-2 py-2 text-left text-emerald-500/60 uppercase font-bold">Paid</th>
                    <th className="px-2 py-2 text-left text-emerald-500/60 uppercase font-bold">Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-800/20">
                  {invXlsxPreview.rows.map((r, i) => (
                    <tr key={i} className={`${r._selected ? "" : "opacity-40"} hover:bg-emerald-900/20`}>
                      <td className="px-2 py-1.5"><input type="checkbox" checked={r._selected} onChange={() => toggleInvXlsxRow(i)} /></td>
                      <td className="px-2 py-1.5 text-emerald-200 font-medium">{r.custName}</td>
                      <td className="px-2 py-1.5 text-emerald-400/70">{r.date}</td>
                      <td className="px-2 py-1.5 font-bold text-emerald-300">{r.total > 0 ? `₹${r.total.toLocaleString("en-IN")}` : "—"}</td>
                      <td className="px-2 py-1.5 text-emerald-400">{r.paid > 0 ? `₹${r.paid.toLocaleString("en-IN")}` : "—"}</td>
                      <td className="px-2 py-1.5 text-emerald-500/50 max-w-48 truncate">{r.items || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 pt-1">
              <Btn onClick={confirmInvExcelImport} disabled={!invXlsxPreview.rows.some((r) => r._selected)}>Import {invXlsxPreview.rows.filter((r) => r._selected).length} Invoices</Btn>
              <Btn variant="secondary" onClick={() => setInvXlsxPreview(null)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {editInv && (
        <Modal title={`✏️ Edit Invoice — ${editInv.id}`} onClose={() => setEditInv(null)}>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/30 text-xs text-emerald-400 font-semibold">
              ✏️ Edit the invoice date or update the paid amount.
            </div>
            <Input label="Invoice Date" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide">Total Amount Paid (₹)</label>
              <input type="number" min={0} max={editInv.total} value={editPaid} onChange={(e) => setEditPaid(e.target.value)}
                className="w-full border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30" />
              <div className="flex justify-between text-xs text-emerald-400/70 pt-1">
                <span>Invoice Total: <strong>₹{editInv.total.toLocaleString("en-IN")}</strong></span>
                <span className={`font-bold ${(editInv.total - (Number(editPaid) || 0)) > 0 ? "text-red-400" : "text-emerald-600"}`}>
                  Balance: ₹{Math.max(0, editInv.total - (Number(editPaid) || 0)).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Btn onClick={saveEditInvoice}>Save Changes</Btn>
              <Btn variant="secondary" onClick={() => setEditInv(null)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
