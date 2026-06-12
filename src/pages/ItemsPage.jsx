// ── Items Page ────────────────────────────────────────────────────────────────
// Product inventory management with role-based access

import { useState, useMemo, useRef, useEffect } from "react";
import { useToast } from "../components/UIComponents";
import { Modal, Input, Btn, Badge } from "../components/UIComponents";
import { Pagination } from "../components/Pagination";
import { BatchList } from "../components/BatchComponents";
import { ManageCategoriesModal } from "../components/FormComponents";
import { usePagination } from "../hooks";
import { fmtCurrency, fmtDate, exportCSV, newId, expiryStatus, compressImage, num } from "../utils/helpers";

// Role-based permission check
const isManager = (user) => user?.role === "manager" || user?.role === "admin";

// ── Blank Item Template ───────────────────────────────────────────────────────
export const BLANK_ITEM = () => ({
  name: "",
  category: "Seeds",
  price: "0",
  discount: "0",
  stock: "0",
  minStock: "0",
  cgst: "0",
  sgst: "0",
  image: "",
  expiryDate: "",
  hsnCode: "",      // HSN code for GST
  unit: "Piece",    // Unit: Kg, Bag, Liter, Piece, etc.
  purchasePrice: "0", // Purchase price for profit calculation
});

// ── Category Field Component ──────────────────────────────────────────────────
function CategoryField({ label, value, onChange, categories, onAddCategory, onRemoveCategory }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newCat, setNewCat] = useState("");

  const addCat = () => {
    if (newCat.trim() && !categories.includes(newCat.trim())) {
      onAddCategory(newCat.trim());
      onChange(newCat.trim());
      setNewCat("");
      setShowAdd(false);
    }
  };

  return (
    <div>
      <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide mb-1">{label}</label>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === "__add__") setShowAdd(true);
            else onChange(e.target.value);
          }}
          className="flex-1 border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30"
        >
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value="__add__">+ Add new category...</option>
        </select>
      </div>
      {showAdd && (
        <div className="flex gap-2 mt-2 p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
          <input
            autoFocus
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCat()}
            className="flex-1 border border-emerald-700/30 rounded-lg px-3 py-2 text-sm bg-emerald-900/30 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
            placeholder="Category name..."
          />
          <Btn size="sm" onClick={addCat}>Add</Btn>
          <Btn size="sm" variant="secondary" onClick={() => setShowAdd(false)}>✕</Btn>
        </div>
      )}
    </div>
  );
}

// ── Restock Notify Modal ──────────────────────────────────────────────────────
function RestockNotifyModal({ item, customers, storeInfo, onClose }) {
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [notifyMode, setNotifyMode] = useState("sms"); // sms, whatsapp
  const showToast = useToast();

  const toggleCustomer = (id) => {
    setSelectedCustomers((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const sendNotification = () => {
    const selected = customers.filter((c) => selectedCustomers.includes(c.id));
    const message = `${storeInfo.name}: ${item.name} is now back in stock! Visit us to purchase.`;
    
    if (notifyMode === "sms") {
      // SMS via tel: link (opens SMS app)
      selected.forEach((c) => {
        if (c.phone) {
          window.open(`sms:${c.phone}?body=${encodeURIComponent(message)}`);
        }
      });
    } else {
      // WhatsApp
      selected.forEach((c) => {
        if (c.phone) {
          const phone = c.phone.replace(/\D/g, "").replace(/^0/, "91");
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
        }
      });
    }
    
    showToast(`Notification sent to ${selected.length} customer(s)`, "success");
    onClose();
  };

  return (
    <Modal title={`🔔 Notify Customers — ${item.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
          <p className="text-sm text-emerald-300">
            Notify customers that <strong>{item.name}</strong> is back in stock.
          </p>
          <p className="text-xs text-emerald-500/60 mt-1">
            Current stock: {item.stock} units
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setNotifyMode("sms")}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold ${
              notifyMode === "sms"
                ? "bg-emerald-600 text-white"
                : "bg-emerald-900/30 text-emerald-400 border border-emerald-700/30"
            }`}
          >
            📱 SMS
          </button>
          <button
            onClick={() => setNotifyMode("whatsapp")}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold ${
              notifyMode === "whatsapp"
                ? "bg-green-600 text-white"
                : "bg-emerald-900/30 text-emerald-400 border border-emerald-700/30"
            }`}
          >
            💬 WhatsApp
          </button>
        </div>

        <div className="max-h-48 overflow-y-auto space-y-1">
          {customers.filter((c) => c.phone).map((c) => (
            <label
              key={c.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                selectedCustomers.includes(c.id)
                  ? "bg-emerald-600/20 border border-emerald-600/40"
                  : "bg-emerald-900/20 border border-transparent hover:bg-emerald-900/30"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedCustomers.includes(c.id)}
                onChange={() => toggleCustomer(c.id)}
                className="rounded"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-200">{c.name}</p>
                <p className="text-xs text-emerald-500/60">{c.phone}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <Btn onClick={sendNotification} disabled={selectedCustomers.length === 0}>
            Send to {selectedCustomers.length || "—"} Customer(s)
          </Btn>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Items Page Component ─────────────────────────────────────────────────
export function ItemsPage({
  items,
  setItems,
  user,
  addActivity,
  categories,
  categoryGst,
  setCategoryGst,
  onAddCategory,
  onRemoveCategory,
  customers,
  storeInfo,
  itemsStockFilter,
  setItemsStockFilter,
  purchases,
}) {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [stockFilter, setStockFilter] = useState(itemsStockFilter || "all");
  const [expiryFilter, setExpiryFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(BLANK_ITEM());
  const [bulkRows, setBulkRows] = useState([BLANK_ITEM(), BLANK_ITEM(), BLANK_ITEM()]);
  const [bulkNewCat, setBulkNewCat] = useState(null);
  const [stockModal, setStockModal] = useState(null);
  const [batchModalItem, setBatchModalItem] = useState(null);
  const [stockDelta, setStockDelta] = useState("");
  const [stockDir, setStockDir] = useState("add");
  const [showCatManager, setShowCatManager] = useState(false);
  const [restockNotify, setRestockNotify] = useState(null);
  const [formError, setFormError] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [imgError, setImgError] = useState("");
  const [imgUploading, setImgUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const csvRef = useRef(null);
  const imgRef = useRef(null);
  const saveLockRef = useRef(false);
  const showToast = useToast();
  
  // Role-based permissions
  const canEditPrice = isManager(user);  // Only managers can edit prices
  const canDelete = isManager(user);     // Only managers can delete items
  const canEdit = true;                  // Both can edit other fields

  // Sync with external filter from Dashboard navigation
  useEffect(() => {
    if (itemsStockFilter) {
      setStockFilter(itemsStockFilter);
      setItemsStockFilter("all");
    }
  }, [itemsStockFilter, setItemsStockFilter]);

  // Merge categories (defensive: skip non-string / empty entries so stray data
  // from imports or older records can't crash the whole page)
  const allCategories = useMemo(() => {
    const seen = new Map();
    [...categories, ...items.map((i) => i.category)].forEach((c) => {
      if (typeof c !== "string") return;
      const key = c.toLowerCase();
      if (key && !seen.has(key)) seen.set(key, c);
    });
    return [...seen.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [categories, items]);

  // Filtered items
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const cat = (i.category || "").toLowerCase();
      const name = (i.name || "").toLowerCase();
      const catMatch = filterCat === "all" || cat === filterCat.toLowerCase();
      const searchMatch = !q || name.includes(q) || cat.includes(q);

      let stockMatch = true;
      if (stockFilter === "lowStock") stockMatch = (i.minStock || 0) > 0 && i.stock <= (i.minStock || 0);
      else if (stockFilter === "outOfStock") stockMatch = i.stock === 0;

      let expiryMatch = true;
      if (expiryFilter === "expired") {
        const es = expiryStatus(i.expiryDate);
        expiryMatch = es && es.days < 0;
      } else if (expiryFilter === "expiringWeek") {
        const es = expiryStatus(i.expiryDate);
        expiryMatch = es && es.days >= 0 && es.days <= 7;
      } else if (expiryFilter === "expiringSoon") {
        const es = expiryStatus(i.expiryDate);
        expiryMatch = es && es.days >= 0 && es.days <= 60;
      }

      return catMatch && searchMatch && stockMatch && expiryMatch;
    });
  }, [items, search, filterCat, stockFilter, expiryFilter]);

  // Weighted-average purchase cost per item, computed from purchase history.
  // Keyed primarily by itemId (robust to renames / duplicate names) with a
  // lowercased-name map as a fallback for purchase lines that predate item linking.
  const costMap = useMemo(() => {
    const byId = {}, byName = {};
    const add = (bucket, key, qty, price) => {
      if (!bucket[key]) bucket[key] = { totalQty: 0, totalCost: 0 };
      bucket[key].totalQty += qty;
      bucket[key].totalCost += qty * price;
    };
    (purchases || []).forEach((p) => {
      (p.items || []).forEach((it) => {
        const qty = num(it.qty);
        const price = num(it.price);
        if (it.itemId != null && it.itemId !== "") add(byId, String(it.itemId), qty, price);
        const name = (it.name || "").trim().toLowerCase();
        if (name) add(byName, name, qty, price);
      });
    });
    const avg = (bucket) => {
      const out = {};
      Object.entries(bucket).forEach(([k, v]) => { out[k] = v.totalQty > 0 ? v.totalCost / v.totalQty : 0; });
      return out;
    };
    return { byId: avg(byId), byName: avg(byName) };
  }, [purchases]);

  // Resolve an item's unit cost: purchase-history by id → by name → the item's
  // own recorded purchase price.
  const costForItem = (i) =>
    costMap.byId[String(i.id)] || costMap.byName[(i.name || "").trim().toLowerCase()] || num(i.purchasePrice);

  // Live filter counts (reflect search + category context)
  const filterCounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = items.filter((i) => {
      const cat = (i.category || "").toLowerCase();
      const name = (i.name || "").toLowerCase();
      const catMatch = filterCat === "all" || cat === filterCat.toLowerCase();
      const searchMatch = !q || name.includes(q) || cat.includes(q);
      return catMatch && searchMatch;
    });
    const counts = { all: base.length, lowStock: 0, outOfStock: 0, expiringWeek: 0, expiringSoon: 0, expired: 0 };
    base.forEach((i) => {
      if ((i.minStock || 0) > 0 && i.stock <= (i.minStock || 0)) counts.lowStock++;
      if (i.stock === 0) counts.outOfStock++;
      const es = expiryStatus(i.expiryDate);
      if (es) {
        if (es.days < 0) counts.expired++;
        else if (es.days <= 7) counts.expiringWeek++;
        if (es.days >= 0 && es.days <= 60) counts.expiringSoon++;
      }
    });
    return counts;
  }, [items, search, filterCat]);

  const pagination = usePagination(filtered, 50);

  const ff = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  // Image upload handler
  const handleImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImgError("");
    const validTypes = ["image/jpeg", "image/png"];
    if (!validTypes.includes(file.type)) {
      setImgError("Only JPG and PNG images are allowed.");
      e.target.value = "";
      return;
    }
    if (file.size > 1 * 1024 * 1024) {
      setImgError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 1MB.`);
      e.target.value = "";
      return;
    }
    try {
      setImgUploading(true);
      const compressed = await compressImage(file, 200, 0.5);
      setForm((p) => ({ ...p, image: compressed }));
    } catch (err) {
      setImgError("Image processing failed: " + err.message);
    } finally {
      setImgUploading(false);
    }
  };

  const openAdd = () => { setForm(BLANK_ITEM()); setFormError(""); setModal("add"); };
  const openBulk = () => { setBulkRows([BLANK_ITEM(), BLANK_ITEM(), BLANK_ITEM()]); setBulkNewCat(null); setModal("bulk"); };
  const openEdit = (item) => {
    setSelected(item);
    setForm({
      ...BLANK_ITEM(),
      ...item,
      price: String(item.price),
      discount: String(item.discount),
      stock: String(item.stock),
      minStock: String(item.minStock),
      cgst: String(item.cgst ?? 0),
      sgst: String(item.sgst ?? 0),
    });
    setFormError("");
    setModal("edit");
  };

  const save = () => {
    if (isSaving || saveLockRef.current) return;
    if (!form.name.trim()) { setFormError("Item name is required"); return; }

    const normalizedName = form.name.trim().toLowerCase();
    const normalizedCat = (form.category || "").trim().toLowerCase();
    const existingItem = items.find((i) =>
      i.name.trim().toLowerCase() === normalizedName &&
      (modal === "add" || i.id !== selected?.id)
    );

    if (existingItem) {
      const sameCat = (existingItem.category || "").trim().toLowerCase() === normalizedCat;
      const msg = sameCat
        ? `⚠ Duplicate: Item "${existingItem.name}" already exists in the SAME category "${existingItem.category}". Please use a unique name.`
        : `Item "${existingItem.name}" already exists in category "${existingItem.category || "—"}". Please use a unique name.`;
      setFormError(msg);
      saveLockRef.current = false;
      setIsSaving(false);
      return;
    }

    saveLockRef.current = true;
    setIsSaving(true);
    setFormError("");

    const item = {
      ...form,
      id: selected?.id || newId(items),
      price: Number(form.price),
      discount: Number(form.discount),
      stock: Number(form.stock),
      minStock: Number(form.minStock),
      cgst: Number(form.cgst),
      sgst: Number(form.sgst),
    };

    if (modal === "add") {
      setItems((p) => {
        // Synchronous double-check inside setter to defeat rapid double-clicks
        const dupId = p.some((x) => x.id === item.id);
        const dupName = p.some((x) => x.name.trim().toLowerCase() === normalizedName);
        if (dupId || dupName) return p;
        return [...p, item];
      });
      addActivity(`New item added: ${form.name}`, "stock");
      showToast(`Item "${form.name}" added successfully`, "success");
    } else {
      setItems((p) => p.map((i) => (i.id === selected.id ? item : i)));
      addActivity(`Item updated: ${form.name}`, "stock");
      showToast(`Item "${form.name}" updated successfully`, "success");
    }
    setModal(null);
    setIsSaving(false);
    saveLockRef.current = false;
  };

  const saveBulk = () => {
    const valid = bulkRows.filter((r) => r.name.trim());
    if (!valid.length) { setBulkError("Please add at least one item"); return; }

    const bulkNames = valid.map((r) => r.name.trim().toLowerCase());
    const uniqueBulkNames = new Set(bulkNames);
    if (bulkNames.length !== uniqueBulkNames.size) {
      setBulkError("Duplicate item names found in your bulk list. Please use unique names.");
      return;
    }

    const existingNames = new Set(items.map((i) => i.name.trim().toLowerCase()));
    const duplicates = valid.filter((r) => existingNames.has(r.name.trim().toLowerCase()));
    if (duplicates.length > 0) {
      setBulkError(`These items already exist: ${duplicates.map((d) => d.name).join(", ")}`);
      return;
    }

    setBulkError("");
    const base = newId(items);
    setItems((p) => [
      ...p,
      ...valid.map((r, i) => ({
        id: base + i,
        name: r.name.trim(),
        category: r.category || "Seeds",
        price: Number(r.price) || 0,
        discount: Number(r.discount) || 0,
        stock: Number(r.stock) || 0,
        minStock: Number(r.minStock) || 0,
        cgst: Number(r.cgst) || 0,
        sgst: Number(r.sgst) || 0,
        image: "",
      })),
    ]);
    addActivity(`${valid.length} items added in bulk`, "stock");
    showToast(`${valid.length} items added in bulk`, "success");
    setModal(null);
  };

  const del = () => {
    if (!deleteConfirm) return;
    const name = deleteConfirm.name;
    setItems((p) => p.filter((i) => i.id !== deleteConfirm.id));
    setDeleteConfirm(null);
    showToast(`Item "${name}" deleted`, "warning");
  };

  const applyStock = () => {
    const d = Number(stockDelta);
    if (!d) return;
    const wasZero = stockModal.stock === 0 && stockDir === "add";
    let updatedItem = null;
    setItems((p) =>
      p.map((i) => {
        if (i.id !== stockModal.id) return i;
        const ns = stockDir === "add" ? i.stock + d : Math.max(0, i.stock - d);
        addActivity(`Stock updated: ${i.name} → ${ns} units`, "stock");
        updatedItem = { ...i, stock: ns };
        return updatedItem;
      })
    );
    showToast(`Stock updated: ${stockModal.name} → ${stockDir === "add" ? "+" : "-"}${d} units`, "success");
    setStockModal(null);
    setStockDelta("");
    if (wasZero && updatedItem) {
      setTimeout(() => setRestockNotify(updatedItem), 150);
    }
  };

  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.trim().split("\n").slice(1);
      const imported = lines
        .map((l, i) => {
          const [name, category, price, discount, stock, minStock] = l.split(",").map((s) => s.trim());
          return {
            id: newId(items) + i,
            name: name || "",
            category: category || "Other",
            price: Number(price) || 0,
            discount: Number(discount) || 0,
            stock: Number(stock) || 0,
            minStock: Number(minStock) || 0,
            cgst: 0,
            sgst: 0,
            image: "",
          };
        })
        .filter((i) => i.name);
      setItems((p) => [...p, ...imported]);
      addActivity(`${imported.length} items imported`, "stock");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold page-title flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          Items
        </h1>
        <div className="flex gap-2 flex-wrap">
          {canEdit && (
            <>
              <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
              <Btn variant="outline" size="sm" onClick={() => csvRef.current?.click()}>⬆ CSV</Btn>
            </>
          )}
          <Btn
            variant="outline"
            size="sm"
            onClick={() =>
              exportCSV(
                "items.csv",
                ["Name", "Category", "Price", "Discount%", "Stock", "MinStock", "CGST%", "SGST%", "HSN Code", "Unit", "Purchase Price", "ExpiryDate"],
                items.map((i) => [i.name, i.category, i.price, i.discount, i.stock, i.minStock, i.cgst, i.sgst, i.hsnCode || "", i.unit || "Piece", i.purchasePrice || 0, i.expiryDate || ""])
              )
            }
          >
            ⬇ Export CSV
          </Btn>
          {canEdit && (
            <>
              <Btn variant="outline" size="sm" onClick={() => setShowCatManager(true)}>⚙ Categories</Btn>
              <Btn variant="outline" size="sm" onClick={openBulk}>+ Add Multiple</Btn>
              <Btn size="sm" onClick={openAdd}>+ Add Item</Btn>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-3 mt-1 mb-3">
        <input
          className="flex-1 border border-emerald-700/30 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30 shadow-sm"
          placeholder="Search items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm bg-emerald-900/30 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
        >
          <option value="all">All Categories</option>
          {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Stock & Expiry Filter Options */}
      <div className="flex flex-wrap items-center gap-2 mb-3" role="group" aria-label="Stock and expiry filters">
        <span className="text-xs font-semibold text-emerald-500/60 uppercase">Filter:</span>
        {[
          { key: "all",          label: "All Items",            icon: "📦", group: "stock",  activeBg: "bg-emerald-600", activeText: "text-white" },
          { key: "lowStock",     label: "Low Stock",            icon: "⚠️", group: "stock",  activeBg: "bg-red-600",     activeText: "text-white" },
          { key: "outOfStock",   label: "Out of Stock",         icon: "❌", group: "stock",  activeBg: "bg-red-700",     activeText: "text-white" },
          { key: "expiringWeek", label: "Expiring This Week",   icon: "🚨", group: "expiry", activeBg: "bg-red-600",     activeText: "text-white" },
          { key: "expiringSoon", label: "Expiring Soon 60d",    icon: "🕐", group: "expiry", activeBg: "bg-amber-600",   activeText: "text-white" },
          { key: "expired",      label: "Expired",              icon: "⛔", group: "expiry", activeBg: "bg-red-700",     activeText: "text-white" },
        ].map(({ key, label, icon, group, activeBg, activeText }) => {
          const isStock = group === "stock";
          const isActive = isStock ? stockFilter === key : expiryFilter === key;
          const handleClick = () => {
            if (isStock) {
              setStockFilter(key);
              if (key !== "all") setExpiryFilter("all");
            } else {
              setExpiryFilter(key);
              setStockFilter("all");
            }
          };
          const count = filterCounts[key] ?? 0;
          return (
            <button
              key={key}
              onClick={handleClick}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 ${
                isActive
                  ? `${activeBg} ${activeText} shadow-md`
                  : "bg-emerald-900/30 text-emerald-400 border border-emerald-700/30 hover:bg-emerald-900/50"
              }`}
              aria-pressed={isActive}
            >
              <span aria-hidden="true">{icon}</span>
              <span>{label}</span>
              <span className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${isActive ? "bg-white/25" : "bg-emerald-800/50 text-emerald-300"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="card overflow-hidden overflow-x-auto">
        <div className="section-header">
          <h3 className="text-sm font-semibold text-emerald-300">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}{pagination.totalPages > 1 ? ` · page ${pagination.currentPage}/${pagination.totalPages}` : ""}
          </h3>
        </div>
        <div className="overflow-y-auto max-h-[calc(100vh-260px)]">
          <table className="w-full text-sm">
            <thead className="thead-sticky">
              <tr>
                {["", "Item Name", "Category", "Price", "Profit", "Tax", "Stock", "Expiry", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold text-emerald-500/50 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-800/30">
              {pagination.paginatedItems.map((i) => {
                const avgCost = costForItem(i);
                const hasCost = avgCost > 0;
                const profit = hasCost ? num(i.price) - avgCost : 0;
                const margin = hasCost && num(i.price) > 0 ? (profit / num(i.price)) * 100 : 0;
                const profitColor = !hasCost ? "text-emerald-600/40"
                  : profit > 0 ? "text-emerald-400"
                  : profit === 0 ? "text-amber-400"
                  : "text-red-400";
                return (
                <tr key={i.id} className={`transition-colors ${i.stock <= i.minStock && (i.minStock || 0) > 0 ? "bg-red-900/20" : "hover:bg-emerald-800/20"}`}>
                  <td className="px-3 py-2">
                    {i.image ? (
                      <img src={i.image} alt={i.name} className="w-16 h-16 rounded-lg object-cover border border-emerald-700/30" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-emerald-900/40 flex items-center justify-center text-emerald-600/40 text-2xl">📦</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-emerald-100">{i.name}</td>
                  <td className="px-4 py-3"><Badge color="green">{i.category}</Badge></td>
                  <td className="px-4 py-3 text-emerald-200 font-medium">
                    {fmtCurrency(i.price)}
                    {i.discount > 0 && <span className="ml-1 text-xs text-emerald-600">-{i.discount}%</span>}
                  </td>
                  <td className="px-4 py-3">
                    {hasCost ? (
                      <div>
                        <p className={`font-bold ${profitColor}`}>{fmtCurrency(profit)}</p>
                        <p className={`text-xs ${profitColor} opacity-80`}>{margin >= 0 ? "+" : ""}{margin.toFixed(1)}%</p>
                      </div>
                    ) : (
                      <span className="text-xs text-emerald-600/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-emerald-400/70">C:{i.cgst ?? 0}% S:{i.sgst ?? 0}%</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${i.stock === 0 ? "text-red-400" : (i.minStock || 0) > 0 && i.stock <= i.minStock ? "text-amber-400" : "text-emerald-100"}`}>
                      {i.stock}
                    </span>
                    {(i.minStock || 0) > 0 && i.stock <= i.minStock && <span className="ml-1 text-xs text-red-400">⚠</span>}
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const es = expiryStatus(i.expiryDate);
                      if (!es) return <span className="text-xs text-emerald-600/40">—</span>;
                      return (
                        <div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${es.bg} ${es.text}`}>
                            {es.days < 0 ? "⛔ Expired" : es.days <= 60 ? `⚠️ ${es.label}` : `✓ ${es.label}`}
                          </span>
                          <p className="text-xs text-emerald-500/50 mt-0.5">{fmtDate(i.expiryDate)}</p>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 flex-wrap">
                      <Btn size="sm" variant="secondary" onClick={() => { setStockModal(i); setStockDelta(""); setStockDir("add"); }}>Stock</Btn>
                      {storeInfo?.features?.batch_tracking !== false && <Btn size="sm" variant="outline" onClick={() => setBatchModalItem(i)}>📦 Batches</Btn>}
                      <Btn size="sm" variant="outline" onClick={() => setRestockNotify(i)}>🔔 Notify</Btn>
                      {canEdit && <Btn size="sm" variant="outline" onClick={() => openEdit(i)}>Edit</Btn>}
                      {canDelete && <Btn size="sm" variant="danger" onClick={() => setDeleteConfirm(i)}>Delete</Btn>}
                    </div>
                  </td>
                </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-emerald-500/50">No items found</td></tr>
              )}
            </tbody>
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

      {/* Add / Edit Modal */}
      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "Add Item" : "Edit Item"} onClose={() => setModal(null)}>
          <div className="space-y-3">
            {/* Image upload */}
            <div>
              <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide mb-1">Item Image</label>
              <div className="flex items-center gap-3">
                {form.image ? (
                  <img src={form.image} alt="preview" className="w-16 h-16 rounded-xl object-cover border border-emerald-700/30 shadow-sm" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-emerald-900/40 flex items-center justify-center text-emerald-600/40 text-2xl border border-dashed border-emerald-700/30">📷</div>
                )}
                <div>
                  <input ref={imgRef} type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={handleImage} />
                  <Btn size="sm" variant="outline" onClick={() => imgRef.current?.click()} disabled={imgUploading}>
                    {imgUploading ? "Uploading…" : "Upload Image"}
                  </Btn>
                  {form.image && (
                    <button onClick={() => setForm((p) => ({ ...p, image: "" }))} className="ml-2 text-xs text-red-400 hover:text-red-400">
                      Remove
                    </button>
                  )}
                  <p className="text-xs text-emerald-500/50 mt-1">JPG/PNG only · Max 1MB</p>
                </div>
              </div>
              {imgError && <p className="text-xs text-red-400 bg-red-900/20 px-3 py-2 rounded-xl border border-red-800/30">⚠️ {imgError}</p>}
            </div>
            <Input label="Item Name *" value={form.name} onChange={(e) => { ff("name")(e); setFormError(""); }} placeholder="e.g. Wheat Seeds 50kg" />
            <CategoryField label="Category" value={form.category} onChange={(v) => {
              const gst = Number(categoryGst?.[v]);
              setForm((p) => {
                const next = { ...p, category: v };
                if (Number.isFinite(gst) && gst >= 0) {
                  const half = gst / 2;
                  next.cgst = String(half);
                  next.sgst = String(half);
                }
                return next;
              });
            }} categories={categories} onAddCategory={onAddCategory} onRemoveCategory={onRemoveCategory} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Sales Price (₹)" type="number" value={form.price} onChange={ff("price")} placeholder="0" />
              <Input label="Discount (%)" type="number" value={form.discount} onChange={ff("discount")} placeholder="0" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Current Stock" type="number" value={form.stock} onChange={ff("stock")} placeholder="0" />
              <Input label="Min Stock Limit" type="number" value={form.minStock} onChange={ff("minStock")} placeholder="0" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="CGST (%)" type="number" value={form.cgst} onChange={ff("cgst")} placeholder="0" hint="e.g. 9 for 9%" />
              <Input label="SGST (%)" type="number" value={form.sgst} onChange={ff("sgst")} placeholder="0" hint="e.g. 9 for 9%" />
            </div>
            {/* HSN Code and Unit for GST */}
            <div className="grid grid-cols-2 gap-3">
              <Input 
                label="HSN Code" 
                value={form.hsnCode || ""} 
                onChange={(e) => setForm((p) => ({ ...p, hsnCode: e.target.value }))} 
                placeholder="e.g. 3102" 
                hint="GST HSN code"
              />
              <div>
                <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide mb-1">Unit</label>
                <select
                  value={form.unit || "Piece"}
                  onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                  className="w-full border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30"
                >
                  <option value="Piece">Piece</option>
                  <option value="Kg">Kg</option>
                  <option value="Gram">Gram</option>
                  <option value="Liter">Liter</option>
                  <option value="ML">ML</option>
                  <option value="Bag">Bag</option>
                  <option value="Bottle">Bottle</option>
                  <option value="Packet">Packet</option>
                  <option value="Box">Box</option>
                  <option value="Dozen">Dozen</option>
                </select>
              </div>
            </div>
            {/* Purchase Price for profit tracking */}
            <Input 
              label="Purchase Price" 
              type="number" 
              value={form.purchasePrice || ""} 
              onChange={(e) => setForm((p) => ({ ...p, purchasePrice: e.target.value }))} 
              placeholder="0" 
              hint="Cost price for profit calculation"
            />
            {/* Expiry Date */}
            <div>
              <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide mb-1">
                Expiry Date <span className="text-emerald-600/40 font-normal normal-case">(optional)</span>
              </label>
              <input
                type="date"
                value={form.expiryDate || ""}
                onChange={(e) => setForm((p) => ({ ...p, expiryDate: e.target.value }))}
                className="w-full border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30"
              />
              {form.expiryDate && (() => {
                const es = expiryStatus(form.expiryDate);
                if (!es) return null;
                return (
                  <p className={`text-xs mt-1 font-semibold ${es.text}`}>
                    {es.days < 0 ? "⛔ Already expired!" : es.days <= 60 ? `⚠️ Expires in ${es.days} days` : `✓ ${es.days} remaining`}
                  </p>
                );
              })()}
            </div>
            {/* Error Message */}
            {formError && (
              <div className="p-3 rounded-xl bg-red-900/20 border border-red-700/30">
                <p className="text-sm text-red-400 font-semibold">⚠️ {formError}</p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Btn onClick={save} disabled={isSaving}>{isSaving ? "Saving..." : "Save"}</Btn>
              <Btn variant="secondary" onClick={() => setModal(null)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Modal */}
      {modal === "bulk" && (
        <Modal title="Add Multiple Items" onClose={() => setModal(null)} extraWide>
          <div className="space-y-4">
            <p className="text-sm text-emerald-500/50">Fill rows below. Empty rows skipped.</p>
            {bulkNewCat !== null && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-900/30 border border-emerald-500/30">
                <span className="text-xs font-semibold text-emerald-400">New Category:</span>
                <input
                  autoFocus
                  value={bulkNewCat}
                  onChange={(e) => setBulkNewCat(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && bulkNewCat.trim()) {
                      onAddCategory(bulkNewCat.trim());
                      showToast(`Category "${bulkNewCat.trim()}" added`, "success");
                      setBulkNewCat(null);
                    } else if (e.key === "Escape") {
                      setBulkNewCat(null);
                    }
                  }}
                  className="flex-1 max-w-48 border border-emerald-700/30 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="New category name…"
                />
                <Btn
                  size="sm"
                  onClick={() => {
                    if (bulkNewCat.trim()) {
                      onAddCategory(bulkNewCat.trim());
                      showToast(`Category "${bulkNewCat.trim()}" added`, "success");
                      setBulkNewCat(null);
                    }
                  }}
                  disabled={!bulkNewCat.trim()}
                >
                  Add
                </Btn>
                <Btn size="sm" variant="secondary" onClick={() => setBulkNewCat(null)}>✕</Btn>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="thead-sticky">
                  <tr>
                    {["Name *", "Category", "Price", "Disc%", "Stock", "Min", "CGST%", "SGST%", ""].map((h) => (
                      <th key={h} className="text-left px-2 py-2 text-xs font-bold text-emerald-500/50">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {bulkRows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-1 py-1.5">
                        <input
                          value={row.name}
                          onChange={(e) => setBulkRows((p) => p.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))}
                          className="w-36 border border-emerald-700/30 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                          placeholder="Item name"
                        />
                      </td>
                      <td className="px-1 py-1.5">
                        <select
                          value={row.category}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "__add__") {
                              setBulkNewCat("");
                            } else {
                              const gst = Number(categoryGst?.[v]);
                              const half = Number.isFinite(gst) && gst >= 0 ? gst / 2 : null;
                              setBulkRows((p) => p.map((r, i) => i === idx ? {
                                ...r,
                                category: v,
                                ...(half !== null ? { cgst: String(half), sgst: String(half) } : {}),
                              } : r));
                            }
                          }}
                          className="w-28 border border-emerald-700/30 rounded-lg px-2 py-1.5 text-sm bg-emerald-900/30 focus:outline-none"
                        >
                          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                          <option value="__add__">+ Add new category...</option>
                        </select>
                      </td>
                      {["price", "discount", "stock", "minStock", "cgst", "sgst"].map((k) => {
                        const w = k === "price" ? "w-20" : (k === "cgst" || k === "sgst") ? "w-14" : "w-16";
                        return (
                          <td key={k} className="px-1 py-1.5">
                            <input
                              type="number"
                              value={row[k]}
                              onChange={(e) => setBulkRows((p) => p.map((r, i) => i === idx ? { ...r, [k]: e.target.value } : r))}
                              className={`${w} border border-emerald-700/30 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/30`}
                              placeholder="0"
                            />
                          </td>
                        );
                      })}
                      <td className="px-1 py-1.5 text-center">
                        {bulkRows.length > 1 && (
                          <button onClick={() => setBulkRows((p) => p.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-400">✕</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => setBulkRows((p) => [...p, BLANK_ITEM()])} className="text-sm text-emerald-600 font-semibold">+ Add row</button>
            {bulkError && (
              <div className="p-3 rounded-xl bg-red-900/20 border border-red-700/30">
                <p className="text-sm text-red-400 font-semibold">⚠️ {bulkError}</p>
              </div>
            )}
            <div className="flex gap-2 border-t pt-3">
              <Btn onClick={saveBulk} disabled={!bulkRows.some((r) => r.name.trim())}>
                Save {bulkRows.filter((r) => r.name.trim()).length} Items
              </Btn>
              <Btn variant="secondary" onClick={() => setModal(null)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Stock Update Modal */}
      {stockModal && (
        <Modal title={`Update Stock — ${stockModal.name}`} onClose={() => setStockModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-emerald-400/70">Current: <strong>{stockModal.stock} units</strong></p>
            <div className="flex gap-2">
              <button
                onClick={() => setStockDir("add")}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  stockDir === "add" ? "text-white shadow-md border-transparent" : "bg-emerald-900/30 text-emerald-300 border-emerald-700/30"
                }`}
                style={stockDir === "add" ? { background: "linear-gradient(135deg,#059669,#10b981)" } : {}}
              >
                ➕ Add Stock
              </button>
              <button
                onClick={() => setStockDir("remove")}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  stockDir === "remove" ? "bg-red-600 text-white border-red-500" : "bg-emerald-900/30 text-emerald-300 border-emerald-700/30"
                }`}
              >
                ➖ Remove Stock
              </button>
            </div>
            <Input label="Quantity" type="number" value={stockDelta} onChange={(e) => setStockDelta(e.target.value)} placeholder="Enter quantity" />
            <div className="flex gap-2">
              <Btn onClick={applyStock} disabled={!stockDelta}>Update</Btn>
              <Btn variant="secondary" onClick={() => setStockModal(null)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Batch management modal */}
      {batchModalItem && (
        <Modal title={`📦 Batches — ${batchModalItem.name}`} onClose={() => setBatchModalItem(null)} extraWide>
          <BatchList item={batchModalItem} onUpdate={() => {}} />
        </Modal>
      )}

      {/* Category manager modal */}
      {showCatManager && (
        <ManageCategoriesModal
          categories={categories}
          categoryGst={categoryGst}
          setCategoryGst={setCategoryGst}
          onAddCategory={onAddCategory}
          onRemoveCategory={onRemoveCategory}
          onClose={() => setShowCatManager(false)}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <Modal title="Delete Item" onClose={() => setDeleteConfirm(null)}>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-red-900/20 border border-red-800/30">
              <p className="text-sm text-red-300 font-semibold mb-1">
                Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
              </p>
              <p className="text-xs text-red-400/70">This action cannot be undone. Current stock: {deleteConfirm.stock} units.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Btn variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
              <button onClick={del} className="px-4 py-2 text-sm font-bold rounded-xl text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md">
                Yes, Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Restock notify modal */}
      {restockNotify && (
        <RestockNotifyModal
          item={restockNotify}
          customers={customers}
          storeInfo={storeInfo}
          onClose={() => setRestockNotify(null)}
        />
      )}
    </div>
  );
}
