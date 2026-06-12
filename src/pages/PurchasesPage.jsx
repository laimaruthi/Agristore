/**
 * Purchases Page - Purchase orders, company management
 */
import { useState } from "react";
import { 
  Modal, Input, Btn, Badge, useToast,
  CompanyCombobox, PurchaseItemCombobox, RecordPaymentModal
} from "../components/UIComponents";
import { CategoryField, ManageCategoriesModal } from "../components/FormComponents";
import { fmtCurrency, fmtDate, fmtDateTime, today, nowTimestamp, newId, exportCSV, num, round2, lineBase, lineTax, lineTotal } from "../utils/helpers";
import { createBatch } from "../services/batchTracking";

// Blank item template
const BLANK_ITEM = () => ({ name: "", category: "", price: "", discount: "0", stock: "", minStock: "", cgst: "0", sgst: "0" });

// Generate purchase ID
const newPurId = (arr) => {
  const max = arr.reduce((m, p) => {
    const n = parseInt((p.id || "").replace("PUR-", ""), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `PUR-${String(max + 1).padStart(3, "0")}`;
};

export default function PurchasesPage({ 
  purchases, setPurchases, companies, setCompanies, 
  purchaseItems, setPurchaseItems, user, addActivity, storeInfo, 
  purchaseState, setPurchaseState, purchaseCategories, setPurchaseCategories,
  debitNotes, setShowDebitNoteModal
}) {
  const { view, compId, purItems, selected } = purchaseState;
  const setView = (v) => setPurchaseState((s) => ({ ...s, view: v }));
  const setCompId = (v) => setPurchaseState((s) => ({ ...s, compId: v }));
  const setPurItems = (fn) => setPurchaseState((s) => ({ ...s, purItems: typeof fn === "function" ? fn(s.purItems) : fn }));
  const setSelected = (v) => setPurchaseState((s) => ({ ...s, selected: v }));
  const showToast = useToast();

  const [addItemId, setAddItemId] = useState("");
  const [addQty, setAddQty] = useState(1);
  const [addPurPrice, setAddPurPrice] = useState("");
  const [addPurName, setAddPurName] = useState("");
  const [addBatchNumber, setAddBatchNumber] = useState("");
  const [addExpiryDate, setAddExpiryDate] = useState("");
  const [lineError, setLineError] = useState("");
  const [paidAmountInput, setPaidAmountInput] = useState("");
  const [payModal, setPayModal] = useState(null);
  const [editInv, setEditInv] = useState(null);
  const [editDate, setEditDate] = useState("");
  const [editPaid, setEditPaid] = useState("");
  const [purSearch, setPurSearch] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemForm, setNewItemForm] = useState(BLANK_ITEM());
  const [editPurItem, setEditPurItem] = useState(null);
  const [editPurItemForm, setEditPurItemForm] = useState({ name: "", category: "", price: "", discount: "0", cgst: "0", sgst: "0" });
  const canEdit = true;

  const safePurchaseCategories = Array.isArray(purchaseCategories) ? purchaseCategories : [];
  const onAddPurchaseCategory = (cat) => { if (cat && !safePurchaseCategories.includes(cat)) setPurchaseCategories([...safePurchaseCategories, cat]); };
  const onRemovePurchaseCategory = (cat) => { setPurchaseCategories(safePurchaseCategories.filter((c) => c !== cat)); setPurchaseItems((p) => (p || []).map((i) => i.category === cat ? { ...i, category: "Other" } : i)); };
  const [showPurCatManager, setShowPurCatManager] = useState(false);

  const saveNewItem = () => {
    if (!newItemForm.name.trim()) return;
    const item = { ...newItemForm, id: newId(purchaseItems || []), price: Number(newItemForm.price) || 0, discount: Number(newItemForm.discount) || 0, stock: 0, minStock: 0, cgst: Number(newItemForm.cgst) || 0, sgst: Number(newItemForm.sgst) || 0 };
    setPurchaseItems((p) => [...(p || []), item]);
    addActivity(`New purchase item added: ${item.name}`, "purchase");
    showToast(`Purchase item "${item.name}" added`, "success");
    setNewItemForm(BLANK_ITEM());
    setShowAddItem(false);
  };

  const openEditInv = (inv) => { setEditInv(inv); setEditDate(inv.date); setEditPaid(String(inv.paidAmount || 0)); };
  const saveEditPurchase = () => {
    if (!editInv) return;
    // ✅ FP-safe rounding + tolerance
    const total = Math.round((editInv.total || 0) * 100) / 100;
    const paidRaw = Math.min(Number(editPaid) || 0, total);
    const paid = Math.round(paidRaw * 100) / 100;
    const status = paid + 0.005 >= total ? "paid" : paid > 0 ? "partial" : "pending";
    setPurchases((prev) => prev.map((inv) => {
      if (inv.id !== editInv.id) return inv;
      const updated = { ...inv, date: editDate, paidAmount: paid, status };
      setPurchaseState((s) => s.selected?.id === editInv.id ? { ...s, selected: updated } : s);
      return updated;
    }));
    addActivity(`Purchase ${editInv.id} edited`, "purchase");
    showToast(`Purchase ${editInv.id} updated`, "success");
    setEditInv(null);
  };

  const handleAddCompany = (form) => {
    const newComp = { ...form, id: newId(companies) };
    setCompanies((p) => [...p, newComp]);
    addActivity(`New company added: ${newComp.name}`, "purchase");
    showToast(`Company "${newComp.name}" added`, "success");
    return newComp;
  };

  const addLine = () => {
    const item = (purchaseItems || []).find((i) => String(i.id) === String(addItemId));
    if (!item) return;
    const qty = Number(addQty);
    if (qty <= 0) { setLineError("Quantity must be at least 1."); return; }
    const purPrice = addPurPrice !== "" ? Number(addPurPrice) : item.price;
    if (purPrice < 0) { setLineError("Price cannot be negative."); return; }
    const purName = addPurName.trim() || item.name;
    setLineError("");
    // Dedup check inside functional updater — prevents rapid double-click from adding the same item twice
    setPurItems((p) => {
      const existing = p.findIndex((l) => String(l.itemId) === String(item.id));
      if (existing >= 0) {
        const newQty = p[existing].qty + qty;
        return p.map((l, i) => i === existing ? { ...l, qty: newQty, price: purPrice, name: purName } : l);
      }
      return [...p, { itemId: item.id, name: purName, qty, price: purPrice, discount: item.discount, cgst: item.cgst ?? 0, sgst: item.sgst ?? 0, batchNumber: addBatchNumber.trim(), expiryDate: addExpiryDate }];
    });
    setAddItemId(""); setAddQty(1); setAddPurPrice(""); setAddPurName(""); setAddBatchNumber(""); setAddExpiryDate("");
  };

  const removeLine = (idx) => setPurItems((p) => p.filter((_, i) => i !== idx));
  // lineBase/lineTax/lineTotal now come from helpers (single source of truth).
  const subtotal = purItems.reduce((s, l) => s + lineBase(l), 0);
  const totalTax = purItems.reduce((s, l) => s + lineTax(l), 0);
  const grandTotal = subtotal + totalTax;

  const savePurchase = () => {
    if (!compId || purItems.length === 0) return;
    // FP-safe rounding + tolerance. Derive total from rounded base + tax so
    // subtotal + totalTax = total exactly.
    const sub = round2(subtotal);
    const tax = round2(totalTax);
    const gt = round2(sub + tax);
    const paidRaw = Math.min(Number(paidAmountInput) || 0, gt);
    const paid = round2(paidRaw);
    const status = paid + 0.005 >= gt ? "paid" : paid > 0 ? "partial" : "pending";
    const initPayments = paid > 0 ? [{ date: nowTimestamp(), amount: paid, note: "Initial payment", recordedBy: user.name }] : [];
    const pur = { id: newPurId(purchases), companyId: Number(compId), date: today(), status, paidAmount: paid, payments: initPayments, items: purItems, subtotal: sub, totalTax: tax, total: gt, createdBy: user.name };
    setPurchases((p) => [...p, pur]);
    const compName = companies.find((c) => String(c.id) === String(compId))?.name;
    // Create a batch for each purchase line so FIFO/expiry tracking stays in sync
    purItems.forEach((l) => {
      createBatch(l.itemId, {
        batchNumber: l.batchNumber || undefined,
        quantity: l.qty,
        purchasePrice: l.price,
        expiryDate: l.expiryDate || null,
        supplier: compName || "",
        purchaseDate: today(),
        notes: `From purchase ${pur.id}`,
      }).catch((err) => console.error("Batch create failed:", err));
    });
    addActivity(`Purchase ${pur.id} created for ${compName}`, "purchase");
    showToast(`Purchase ${pur.id} created for ${compName}`, "success");
    setPaidAmountInput("");
    setPurchaseState({ view: "detail", compId: "", purItems: [], selected: pur });
  };

  const recordPayment = (purchaseId, amount, method = "cash", note = "") => {
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) {
      showToast("Invalid payment amount", "error");
      return;
    }
    const target = purchases.find((p) => p.id === purchaseId);
    if (!target) {
      showToast("Purchase not found", "error");
      return;
    }
    const balance = Math.max(0, target.total - (target.paidAmount || 0));
    if (balance <= 0) {
      showToast("Already fully paid", "info");
      return;
    }
    // Cap at remaining balance so an over-entered amount can't create a negative balance
    const safeAmt = Math.min(amt, balance);

    setPurchases((prev) => prev.map((inv) => {
      if (inv.id !== purchaseId) return inv;
      // Round to 2 decimals to avoid float-precision "99.99 ≠ 100" misclassifying as partial
      const newPaid = Math.round(((inv.paidAmount || 0) + safeAmt) * 100) / 100;
      const newStatus = newPaid + 0.005 >= inv.total ? "paid" : newPaid > 0 ? "partial" : "pending";
      const newPayment = {
        date: nowTimestamp(),
        amount: safeAmt,
        method,
        note: (note || "").trim() || "Payment made",
        recordedBy: user.name,
      };
      const updated = { ...inv, paidAmount: newPaid, status: newStatus, payments: [...(inv.payments || []), newPayment] };
      setPurchaseState((s) => s.selected?.id === purchaseId ? { ...s, selected: updated } : s);
      addActivity(`Payment ₹${safeAmt.toLocaleString("en-IN")} (${method.toUpperCase()}) made for ${purchaseId}`, "purchase");
      return updated;
    }));
    showToast(`Payment ₹${safeAmt.toLocaleString("en-IN")} recorded`, "success");
  };

  const printPurchase = () => window.print();

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const deletePurchase = (inv) => {
    setPurchases((prev) => prev.filter((i) => i.id !== inv.id));
    addActivity(`Purchase ${inv.id} deleted by ${user.name}`, "purchase");
    showToast(`Purchase ${inv.id} deleted`, "warning");
    if (selected?.id === inv.id) setPurchaseState((s) => ({ ...s, view: "list", selected: null }));
    setDeleteConfirm(null);
  };

  // ── Create Purchase View ──
  if (view === "create") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("list")} className="text-emerald-500/50 hover:text-emerald-300 font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-emerald-900/40">← Back</button>
          <h1 className="text-2xl font-bold page-title flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            Create Purchase
          </h1>
        </div>
        <div className="card p-6 space-y-5">
          <CompanyCombobox companies={companies} value={compId} onChange={setCompId} onAddCompany={handleAddCompany} />
          {compId && (() => { const c = companies.find((x) => x.id === compId); return c ? <div className="text-xs text-emerald-400 bg-emerald-900/20 p-3 rounded-xl border border-emerald-700/20">📍 {c.address}{c.gstin ? ` · GSTIN: ${c.gstin}` : ""}</div> : null; })()}
          <div className="border-t border-emerald-800/30 pt-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-emerald-200">Add Items</h3>
              <Btn variant="outline" size="sm" onClick={() => { setNewItemForm({ ...BLANK_ITEM(), category: safePurchaseCategories[0] || "" }); setShowAddItem(true); }}>+ New Item</Btn>
            </div>
            {(purchaseItems || []).length === 0 && <div className="text-xs text-amber-400 bg-amber-900/20 px-3 py-2 rounded-xl border border-amber-700/20 mb-3">No purchase items yet. Click "+ New Item" to add your first purchase item.</div>}
            <div className="flex flex-wrap gap-2 mb-2">
              <PurchaseItemCombobox items={purchaseItems || []} value={addItemId} onChange={(v) => { setAddItemId(v); setLineError(""); const it = (purchaseItems || []).find((i) => String(i.id) === String(v)); if (it) { setAddPurPrice(String(it.price)); setAddPurName(it.name); } else { setAddPurPrice(""); setAddPurName(""); } }} />
              <input type="text" value={addPurName} onChange={(e) => { setAddPurName(e.target.value); setLineError(""); }} className="flex-1 min-w-[140px] border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/20" placeholder="Purchase Item Name" />
              <input type="number" min={0} step="0.01" value={addPurPrice} onChange={(e) => { setAddPurPrice(e.target.value); setLineError(""); }} className="w-28 border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/20" placeholder="Purchase ₹" />
              <input type="number" min={1} value={addQty} onChange={(e) => { setAddQty(e.target.value); setLineError(""); }} className="w-24 border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/20" placeholder="Qty" />
              <input type="text" value={addBatchNumber} onChange={(e) => setAddBatchNumber(e.target.value)} className="w-36 border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/20" placeholder="Batch # (optional)" />
              <input type="date" value={addExpiryDate} onChange={(e) => setAddExpiryDate(e.target.value)} className="w-40 border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/20" placeholder="Expiry" />
              <Btn onClick={addLine} disabled={!addItemId}>Add</Btn>
            </div>
            {addItemId && (() => { const it = (purchaseItems || []).find((i) => String(i.id) === String(addItemId)); return it ? <div className="text-xs text-emerald-500/60 mb-2 bg-emerald-900/20 px-3 py-1.5 rounded-lg border border-emerald-700/20">Default Price: <strong>{fmtCurrency(it.price)}</strong>{addPurName !== it.name ? <span className="ml-2 text-amber-400">Name changed from "{it.name}"</span> : ""}{addPurPrice !== "" && Number(addPurPrice) !== it.price ? <span className="ml-2 text-amber-400">Price differs from default</span> : ""}</div> : null; })()}
            {lineError && <div className="flex items-center gap-2 bg-red-900/20 border border-red-800/30 text-red-400 text-xs font-semibold px-3 py-2 rounded-xl mb-3">⚠️ {lineError}</div>}
            {purItems.length > 0 && (
              <div className="card overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="thead-sticky"><tr>{["Item", "Qty", "Price", "Disc%", "Base", "Tax", "Total", ""].map((h) => <th key={h} className="text-left px-3 py-2 text-xs font-bold text-emerald-500/50">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-emerald-800/30">
                    {purItems.map((l, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2.5">{l.name}</td>
                        <td className="px-3 py-2.5">{l.qty}</td>
                        <td className="px-3 py-2.5">{fmtCurrency(l.price)}</td>
                        <td className="px-3 py-2.5">{l.discount}%</td>
                        <td className="px-3 py-2.5">{fmtCurrency(lineBase(l))}</td>
                        <td className="px-3 py-2.5 text-xs text-emerald-500/50">C:{l.cgst}%+S:{l.sgst}%</td>
                        <td className="px-3 py-2.5 font-bold text-emerald-400">{fmtCurrency(lineTotal(l))}</td>
                        <td className="px-3 py-2.5"><button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-400">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="flex-1 min-w-56 space-y-2">
                <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide">Amount Paid (₹)</label>
                <input type="number" min={0} max={grandTotal} value={paidAmountInput} onChange={(e) => setPaidAmountInput(e.target.value)}
                  className="w-full border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30"
                  placeholder="0 — leave blank for unpaid" />
                {(() => {
                  const paid = Number(paidAmountInput) || 0;
                  if (!paidAmountInput) return <p className="text-xs text-emerald-500/50">No payment entered → status: <strong>Pending</strong></p>;
                  if (paid >= grandTotal) return <p className="text-xs text-emerald-600 font-semibold">✓ Fully paid → status: <strong>Paid</strong></p>;
                  return <p className="text-xs text-amber-400 font-semibold">Partial — Balance due: <strong>{fmtCurrency(grandTotal - paid)}</strong> → status: <strong>Partial</strong></p>;
                })()}
              </div>
              <div className="px-5 py-4 rounded-xl border border-emerald-700/30 space-y-1 text-sm min-w-52" style={{ background: "linear-gradient(135deg,rgba(16,185,129,.08),rgba(99,102,241,.06))" }}>
                <div className="flex justify-between text-emerald-400/70"><span>Subtotal</span><span>{fmtCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-emerald-400/70"><span>Tax (CGST+SGST)</span><span>{fmtCurrency(totalTax)}</span></div>
                <div className="flex justify-between font-bold text-base border-t border-emerald-700/30 pt-2 page-title"><span>Grand Total</span><span>{fmtCurrency(grandTotal)}</span></div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2"><Btn onClick={savePurchase} disabled={!compId || purItems.length === 0}>Create Purchase</Btn><Btn variant="secondary" onClick={() => setView("list")}>Cancel</Btn></div>
        </div>
        {/* Add New Purchase Item Modal */}
        {showAddItem && (
          <Modal title="+ Add New Purchase Item" onClose={() => setShowAddItem(false)}>
            <div className="space-y-3">
              <div className="text-xs text-cyan-400 bg-cyan-900/20 px-3 py-2 rounded-xl border border-cyan-700/20 mb-1">This item will be saved to Purchase Items only. It will NOT appear in Sales/Invoice items.</div>
              <Input label="Item Name *" value={newItemForm.name} onChange={(e) => setNewItemForm((p) => ({ ...p, name: e.target.value }))} placeholder="Purchase item name" />
              <CategoryField value={newItemForm.category} onChange={(v) => setNewItemForm((p) => ({ ...p, category: v }))} categories={safePurchaseCategories} onAddCategory={onAddPurchaseCategory} categoryGst={categoryGst} setCategoryGst={setCategoryGst} label="Category" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Purchase Price (₹)" type="number" value={newItemForm.price} onChange={(e) => setNewItemForm((p) => ({ ...p, price: e.target.value }))} placeholder="0" />
                <Input label="Discount %" type="number" value={newItemForm.discount} onChange={(e) => setNewItemForm((p) => ({ ...p, discount: e.target.value }))} placeholder="0" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="CGST %" type="number" value={newItemForm.cgst} onChange={(e) => setNewItemForm((p) => ({ ...p, cgst: e.target.value }))} placeholder="0" />
                <Input label="SGST %" type="number" value={newItemForm.sgst} onChange={(e) => setNewItemForm((p) => ({ ...p, sgst: e.target.value }))} placeholder="0" />
              </div>
              <div className="flex gap-2 pt-2"><Btn onClick={saveNewItem} disabled={!newItemForm.name.trim()}>Save Item</Btn><Btn variant="secondary" onClick={() => setShowAddItem(false)}>Cancel</Btn></div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ── Purchase Detail View ──
  if (view === "detail" && selected) {
    const liveInv = purchases.find((inv) => inv.id === selected.id) || selected;
    const sel = liveInv;
    const comp = sel.companyId != null ? companies.find((c) => String(c.id) === String(sel.companyId)) : null;
    const dSubtotal = sel.items.reduce((s, l) => s + lineBase(l), 0);
    const dTax = sel.items.reduce((s, l) => s + lineTax(l), 0);
    const dTotal = dSubtotal + dTax;
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("list")} className="text-emerald-500/50 hover:text-emerald-300 font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-emerald-900/40">← Back</button>
            <h1 className="text-xl font-bold text-emerald-100">Purchase {sel.id}</h1>
            <Badge color={sel.status === "paid" ? "green" : sel.status === "partial" ? "yellow" : "red"}>{sel.status}</Badge>
          </div>
          <div className="flex gap-2">
            {canEdit && <Btn variant="outline" size="sm" onClick={() => openEditInv(sel)}>✏️ Edit</Btn>}
            {canEdit && <button onClick={() => setDeleteConfirm(sel)} className="px-3 py-1.5 text-xs font-semibold rounded-xl text-red-400 border border-red-800/30 hover:bg-red-900/30 transition-colors">🗑 Delete</button>}
            <Btn variant="outline" size="sm" onClick={printPurchase}>🖨 Print</Btn>
          </div>
        </div>
        <div id="purchase-print" className="card p-8 max-w-3xl">
          <div className="flex items-start justify-between mb-6 pb-6 border-b border-emerald-800/30">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-md" style={{ background: "linear-gradient(135deg,#059669,#4f46e5)" }}>🌾</div>
                <span className="font-bold text-xl text-emerald-100">{storeInfo.name}</span>
              </div>
              {storeInfo.address && <p className="text-sm text-emerald-500/50">📍 {storeInfo.address}</p>}
              {storeInfo.phone && <p className="text-sm text-emerald-500/50">📞 {storeInfo.phone}</p>}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-emerald-100">PURCHASE</p>
              <p className="text-sm text-emerald-500/50 font-mono mt-1">#{sel.id}</p>
              <p className="text-sm text-emerald-500/50">Date: {sel.date}</p>
              <div className="mt-2"><Badge color={sel.status === "paid" ? "green" : sel.status === "partial" ? "yellow" : "red"}>{sel.status}</Badge></div>
            </div>
          </div>
          <div className="mb-6 p-4 rounded-xl border border-emerald-700/20" style={{ background: "linear-gradient(135deg,rgba(16,185,129,.05),rgba(99,102,241,.03))" }}>
            <p className="text-xs font-bold text-emerald-500/50 uppercase tracking-wide mb-2">Purchased From</p>
            <p className="font-bold text-emerald-100">{comp?.name || sel.companyName || "Unknown"}</p>
            {comp?.address && <p className="text-sm text-emerald-400/70">{comp.address}</p>}
            {comp?.phone && <p className="text-sm text-emerald-400/70">📞 {comp.phone}</p>}
            {comp?.gstin && <p className="text-sm text-emerald-400/70">GSTIN: {comp.gstin}</p>}
          </div>
          <table className="w-full text-sm mb-6">
            <thead className="thead-sticky">
              <tr>{["Item", "Qty", "Price", "Disc", "CGST", "SGST", "Amount"].map((h) => <th key={h} className="text-left px-3 py-2.5 text-xs font-bold text-emerald-400/70 uppercase">{h}</th>)}</tr>
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
          <div className="mt-8 pt-4 border-t border-emerald-800/30 text-xs text-emerald-500/50">Created by {sel.createdBy} · {sel.date}</div>
        </div>
        {payModal && <RecordPaymentModal invoice={payModal} onRecord={recordPayment} onClose={() => setPayModal(null)} />}
        {deleteConfirm && (
          <Modal title="🗑 Delete Purchase" onClose={() => setDeleteConfirm(null)}>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-red-900/20 border border-red-800/30">
                <p className="text-sm text-red-300 font-semibold mb-2">Are you sure you want to delete Purchase #{deleteConfirm.id}?</p>
                <p className="text-xs text-red-400/70">This will permanently remove this purchase record.</p>
              </div>
              <div className="flex gap-2 justify-end">
                <Btn variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
                <button onClick={() => deletePurchase(deleteConfirm)} className="px-4 py-2 text-sm font-bold rounded-xl text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md">Yes, Delete Purchase</button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ── Purchase Items Management View ──
  if (view === "manage-items") {
    const [itemSearch, setItemSearchState] = [purSearch, setPurSearch];
    const allPurItems = purchaseItems || [];
    const qItems = itemSearch.toLowerCase().trim();
    const filteredItems = qItems ? allPurItems.filter((i) => (i.name || "").toLowerCase().includes(qItems) || (i.category || "").toLowerCase().includes(qItems)) : allPurItems;
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("list")} className="text-emerald-500/50 hover:text-emerald-300 font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-emerald-900/40">← Back</button>
            <h1 className="text-2xl font-bold page-title flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
              </svg>
              Purchase Items
            </h1>
          </div>
          <div className="flex gap-2">
            <Btn variant="outline" size="sm" onClick={() => setShowPurCatManager(true)}>🏷 Manage Categories</Btn>
            <Btn size="sm" onClick={() => { setNewItemForm({ ...BLANK_ITEM(), category: safePurchaseCategories[0] || "" }); setShowAddItem(true); }}>+ New Purchase Item</Btn>
          </div>
        </div>
        <div className="text-xs text-cyan-400 bg-cyan-900/20 px-3 py-2 rounded-xl border border-cyan-700/20">These items are independent from Sales items. Changes here do NOT affect your Sales/Invoice item list.</div>
        <input className="w-full border border-emerald-700/30 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-emerald-900/30 shadow-sm" placeholder="Search purchase items…" value={itemSearch} onChange={(e) => setItemSearchState(e.target.value)} />
        <div className="card overflow-hidden">
          <div className="section-header"><h3 className="text-sm font-semibold text-emerald-300">{filteredItems.length} purchase item{filteredItems.length !== 1 ? "s" : ""}</h3></div>
          <table className="w-full text-sm">
            <thead className="thead-sticky"><tr>{["Name", "Category", "Price", "Disc%", "CGST%", "SGST%", "Actions"].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-bold text-emerald-500/50 uppercase">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-emerald-800/30">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-emerald-800/20">
                  <td className="px-4 py-3 font-semibold text-emerald-100">{item.name}</td>
                  <td className="px-4 py-3 text-emerald-400/70">{item.category || "—"}</td>
                  <td className="px-4 py-3 font-bold text-emerald-400">{fmtCurrency(item.price)}</td>
                  <td className="px-4 py-3">{item.discount || 0}%</td>
                  <td className="px-4 py-3">{item.cgst || 0}%</td>
                  <td className="px-4 py-3">{item.sgst || 0}%</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <Btn size="sm" variant="outline" onClick={() => { setEditPurItem(item); setEditPurItemForm({ name: item.name, category: item.category || "", price: String(item.price), discount: String(item.discount || 0), cgst: String(item.cgst || 0), sgst: String(item.sgst || 0) }); }}>✏️ Edit</Btn>
                      {canEdit && <button onClick={() => { if (confirm(`Delete purchase item "${item.name}"?`)) { setPurchaseItems((p) => (p || []).filter((i) => i.id !== item.id)); addActivity(`Purchase item deleted: ${item.name}`, "purchase"); } }} className="px-2.5 py-1.5 text-xs font-semibold rounded-xl text-red-400 border border-red-800/30 hover:bg-red-900/30">🗑</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-emerald-500/50">{qItems ? "No items found" : "No purchase items yet. Click '+ New Purchase Item' to add one."}</td></tr>}
            </tbody>
          </table>
        </div>
        {showAddItem && (
          <Modal title="+ Add New Purchase Item" onClose={() => setShowAddItem(false)}>
            <div className="space-y-3">
              <div className="text-xs text-cyan-400 bg-cyan-900/20 px-3 py-2 rounded-xl border border-cyan-700/20 mb-1">This item will be saved to Purchase Items only. It will NOT appear in Sales/Invoice items.</div>
              <Input label="Item Name *" value={newItemForm.name} onChange={(e) => setNewItemForm((p) => ({ ...p, name: e.target.value }))} placeholder="Purchase item name" />
              <CategoryField value={newItemForm.category} onChange={(v) => setNewItemForm((p) => ({ ...p, category: v }))} categories={safePurchaseCategories} onAddCategory={onAddPurchaseCategory} categoryGst={categoryGst} setCategoryGst={setCategoryGst} label="Category" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Purchase Price (₹)" type="number" value={newItemForm.price} onChange={(e) => setNewItemForm((p) => ({ ...p, price: e.target.value }))} placeholder="0" />
                <Input label="Discount %" type="number" value={newItemForm.discount} onChange={(e) => setNewItemForm((p) => ({ ...p, discount: e.target.value }))} placeholder="0" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="CGST %" type="number" value={newItemForm.cgst} onChange={(e) => setNewItemForm((p) => ({ ...p, cgst: e.target.value }))} placeholder="0" />
                <Input label="SGST %" type="number" value={newItemForm.sgst} onChange={(e) => setNewItemForm((p) => ({ ...p, sgst: e.target.value }))} placeholder="0" />
              </div>
              <div className="flex gap-2 pt-2"><Btn onClick={saveNewItem} disabled={!newItemForm.name.trim()}>Save Item</Btn><Btn variant="secondary" onClick={() => setShowAddItem(false)}>Cancel</Btn></div>
            </div>
          </Modal>
        )}
        {editPurItem && (
          <Modal title={`✏️ Edit Purchase Item — ${editPurItem.name}`} onClose={() => setEditPurItem(null)}>
            <div className="space-y-3">
              <Input label="Item Name *" value={editPurItemForm.name} onChange={(e) => setEditPurItemForm((p) => ({ ...p, name: e.target.value }))} />
              <CategoryField value={editPurItemForm.category} onChange={(v) => setEditPurItemForm((p) => ({ ...p, category: v }))} categories={safePurchaseCategories} onAddCategory={onAddPurchaseCategory} categoryGst={categoryGst} setCategoryGst={setCategoryGst} label="Category" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Purchase Price (₹)" type="number" value={editPurItemForm.price} onChange={(e) => setEditPurItemForm((p) => ({ ...p, price: e.target.value }))} />
                <Input label="Discount %" type="number" value={editPurItemForm.discount} onChange={(e) => setEditPurItemForm((p) => ({ ...p, discount: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="CGST %" type="number" value={editPurItemForm.cgst} onChange={(e) => setEditPurItemForm((p) => ({ ...p, cgst: e.target.value }))} />
                <Input label="SGST %" type="number" value={editPurItemForm.sgst} onChange={(e) => setEditPurItemForm((p) => ({ ...p, sgst: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-2">
                <Btn onClick={() => { if (!editPurItemForm.name.trim()) return; setPurchaseItems((p) => (p || []).map((i) => i.id === editPurItem.id ? { ...i, name: editPurItemForm.name.trim(), category: editPurItemForm.category, price: Number(editPurItemForm.price) || 0, discount: Number(editPurItemForm.discount) || 0, cgst: Number(editPurItemForm.cgst) || 0, sgst: Number(editPurItemForm.sgst) || 0 } : i)); addActivity(`Purchase item updated: ${editPurItemForm.name}`, "purchase"); setEditPurItem(null); }} disabled={!editPurItemForm.name.trim()}>Save Changes</Btn>
                <Btn variant="secondary" onClick={() => setEditPurItem(null)}>Cancel</Btn>
              </div>
            </div>
          </Modal>
        )}
        {showPurCatManager && <ManageCategoriesModal categories={safePurchaseCategories} onAddCategory={onAddPurchaseCategory} onRemoveCategory={onRemovePurchaseCategory} onClose={() => setShowPurCatManager(false)} />}
      </div>
    );
  }

  // ── Purchase List View ──
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold page-title flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            <polyline points="12 7 12 12 15 14"></polyline>
          </svg>
          Purchase History
        </h1>
        <div className="flex gap-2 flex-wrap">
          <Btn variant="outline" size="sm" onClick={() => { setPurSearch(""); setView("manage-items"); }}>📦 Purchase Items</Btn>
          <Btn variant="outline" size="sm" onClick={() => exportCSV("purchases.csv", ["Purchase#","Company","Date","Status","Subtotal","Tax","Total","Paid","Balance","CreatedBy"], purchases.map((inv) => { const c = inv.companyId != null ? companies.find((x) => String(x.id) === String(inv.companyId)) : null; return [inv.id, c?.name || inv.companyName || "", inv.date, inv.status, inv.subtotal, inv.totalTax, inv.total, inv.paidAmount || 0, inv.total - (inv.paidAmount || 0), inv.createdBy || ""]; }))}>⬇ Export CSV</Btn>
          <Btn size="sm" onClick={() => setPurchaseState({ view: "create", compId: "", purItems: [], selected: null })}>+ Create Purchase</Btn>
        </div>
      </div>
      <input className="w-full border border-emerald-700/30 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-emerald-900/30 shadow-sm mt-1 mb-3" placeholder="Search by purchase #, company name or status…" value={purSearch} onChange={(e) => setPurSearch(e.target.value)} />
      {(() => {
        const q = purSearch.toLowerCase().trim();
        const filteredPurchases = q ? purchases.filter((inv) => {
          const c = inv.companyId != null ? companies.find((x) => String(x.id) === String(inv.companyId)) : null;
          const compName = (c?.name || inv.companyName || "").toLowerCase();
          return inv.id.toLowerCase().includes(q) || compName.includes(q) || (inv.status || "").toLowerCase().includes(q) || (inv.date || "").includes(q);
        }) : purchases;
        return (
      <div className="card overflow-hidden overflow-x-auto">
        <div className="section-header"><h3 className="text-sm font-semibold text-emerald-300">{filteredPurchases.length} purchase{filteredPurchases.length !== 1 ? "s" : ""}{q && ` (filtered from ${purchases.length})`}</h3></div>
        <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
        <table className="w-full text-sm">
          <thead className="thead-sticky">
            <tr>{["Purchase #", "Company", "Date", "Total", "Paid", "Balance", "Status", "Actions"].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-bold text-emerald-500/50 uppercase tracking-wide">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-emerald-800/30">
            {filteredPurchases.map((inv) => {
              const c = inv.companyId != null ? companies.find((x) => String(x.id) === String(inv.companyId)) : null;
              const paid = inv.paidAmount || 0;
              const balance = inv.total - paid;
              const statusColor = inv.status === "paid" ? "green" : inv.status === "partial" ? "yellow" : "red";
              return (
                <tr key={inv.id} className="transition-colors hover:bg-emerald-800/20">
                  <td className="px-4 py-3"><span className="font-mono font-bold text-emerald-400">{inv.id}</span></td>
                  <td className="px-4 py-3 font-medium text-emerald-200">{c?.name || inv.companyName || "—"}</td>
                  <td className="px-4 py-3 text-emerald-400/70">{fmtDate(inv.date)}</td>
                  <td className="px-4 py-3 font-bold text-emerald-100">{fmtCurrency(inv.total)}</td>
                  <td className="px-4 py-3 text-emerald-400 font-semibold">{fmtCurrency(paid)}</td>
                  <td className="px-4 py-3"><span className={`font-bold ${balance > 0 ? "text-red-400" : "text-emerald-600"}`}>{fmtCurrency(balance)}</span></td>
                  <td className="px-4 py-3"><Badge color={statusColor}>{inv.status}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      <Btn size="sm" variant="secondary" onClick={() => setPurchaseState((s) => ({ ...s, view: "detail", selected: inv }))}>View</Btn>
                      {balance > 0 && <Btn size="sm" variant="outline" onClick={() => setPayModal(inv)}>💵 Pay</Btn>}
                      {canEdit && <Btn size="sm" variant="outline" onClick={() => openEditInv(inv)}>✏️ Edit</Btn>}
                      {canEdit && <button onClick={() => setDeleteConfirm(inv)} className="px-2.5 py-1.5 text-xs font-semibold rounded-xl text-red-400 border border-red-800/30 hover:bg-red-900/30 transition-colors">🗑</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredPurchases.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-emerald-500/50">{q ? "No purchases found" : "No purchases yet"}</td></tr>}
          </tbody>
        </table>
        </div>
      </div>
        );
      })()}
      {payModal && <RecordPaymentModal invoice={payModal} onRecord={recordPayment} onClose={() => setPayModal(null)} />}
      {deleteConfirm && (
        <Modal title="🗑 Delete Purchase" onClose={() => setDeleteConfirm(null)}>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-red-900/20 border border-red-800/30">
              <p className="text-sm text-red-300 font-semibold mb-2">Are you sure you want to delete Purchase #{deleteConfirm.id}?</p>
              <p className="text-xs text-red-400/70">This will permanently remove this purchase record.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Btn variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
              <button onClick={() => deletePurchase(deleteConfirm)} className="px-4 py-2 text-sm font-bold rounded-xl text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md">Yes, Delete Purchase</button>
            </div>
          </div>
        </Modal>
      )}
      {editInv && (
        <Modal title={`✏️ Edit Purchase — ${editInv.id}`} onClose={() => setEditInv(null)}>
          <div className="space-y-4">
            <Input label="Purchase Date" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide">Total Amount Paid (₹)</label>
              <input type="number" min={0} max={editInv.total} value={editPaid} onChange={(e) => setEditPaid(e.target.value)}
                className="w-full border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30" />
              <div className="flex justify-between text-xs text-emerald-400/70 pt-1">
                <span>Purchase Total: <strong>₹{editInv.total.toLocaleString("en-IN")}</strong></span>
                <span className={`font-bold ${(editInv.total - (Number(editPaid) || 0)) > 0 ? "text-red-400" : "text-emerald-600"}`}>
                  Balance: ₹{Math.max(0, editInv.total - (Number(editPaid) || 0)).toLocaleString("en-IN")}
                </span>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Btn onClick={saveEditPurchase}>Save Changes</Btn>
              <Btn variant="secondary" onClick={() => setEditInv(null)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
