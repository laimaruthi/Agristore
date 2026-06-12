// ── UI Components ─────────────────────────────────────────────────────────────
// Shared UI components used across all pages

import React, { useState, useEffect, useRef, useMemo, createContext, useContext, useCallback } from 'react';
import { fmtCurrency, fmtDate, fmtDateTime, nowTimestamp } from '../utils/helpers';

// ── Badge Component ───────────────────────────────────────────────────────────
export function Badge({ children, color = "gray" }) {
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full badge-${color}`}>{children}</span>;
}

// ── Modal Component ───────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, wide, extraWide }) {
  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" 
      style={{ backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className={`modal-bg rounded-2xl shadow-2xl w-full ${extraWide ? "max-w-4xl" : wide ? "max-w-2xl" : "max-w-lg"} max-h-[92vh] overflow-y-auto`} style={{ border:"1px solid" }}>
        <div className="modal-header flex items-center justify-between p-5" style={{ borderRadius:"16px 16px 0 0" }}>
          <h2 id="modal-title" className="text-base font-semibold text-emerald-200">{title}</h2>
          <button 
            onClick={onClose} 
            className="text-emerald-500/50 hover:text-emerald-300 text-2xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-emerald-900/30"
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Input Component ───────────────────────────────────────────────────────────
export function Input({ label, error, hint, id, ...props }) {
  const inputId = id || `input-${label?.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      {label && (
        <label 
          htmlFor={inputId}
          className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide mb-1"
        >
          {label}
        </label>
      )}
      <input 
        id={inputId}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all text-emerald-100 placeholder:text-emerald-600/40 ${
          error 
            ? "border-red-700/40 focus:ring-red-500/30 bg-red-900/20" 
            : "border-emerald-700/30 focus:ring-emerald-500/30 focus:border-emerald-500/50 bg-emerald-900/30"
        }`}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...props} 
      />
      {error && <p id={`${inputId}-error`} className="text-xs text-red-400 mt-1" role="alert">{error}</p>}
      {hint && !error && <p id={`${inputId}-hint`} className="text-xs text-emerald-500/50 mt-1">{hint}</p>}
    </div>
  );
}

// ── SelectField Component ─────────────────────────────────────────────────────
export function SelectField({ label, options, id, ...props }) {
  const selectId = id || `select-${label?.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      {label && (
        <label 
          htmlFor={selectId}
          className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide mb-1"
        >
          {label}
        </label>
      )}
      <select 
        id={selectId}
        className="w-full border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30 text-emerald-100" 
        {...props}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Button Component ──────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = "primary", size = "md", disabled, className = "", type = "button" }) {
  const base = "rounded-xl font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 inline-flex items-center justify-center gap-1.5";
  const sz = { 
    sm: "px-3 py-1.5 text-xs", 
    md: "px-4 py-2.5 text-sm", 
    lg: "px-6 py-3 text-sm" 
  };
  const v = { 
    primary: "bg-gradient-to-r from-emerald-600 to-emerald-800 hover:from-emerald-500 hover:to-emerald-700 text-white shadow-md", 
    secondary: "bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-300 border border-emerald-700/30", 
    danger: "bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800/40", 
    outline: "border border-emerald-700/30 hover:bg-emerald-800/30 hover:border-emerald-500/40 text-emerald-300 bg-emerald-900/30" 
  };
  
  return (
    <button 
      type={type}
      onClick={onClick} 
      disabled={disabled} 
      className={`${base} ${sz[size]} ${v[variant]} ${disabled ? "opacity-40 cursor-not-allowed" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

// ── Toast Notification System ─────────────────────────────────────────────────
const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  
  const showToast = useCallback((message, type = "success", duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-sm animate-slide-in ${
              toast.type === "success"
                ? "bg-emerald-900/90 border-emerald-700/50 text-emerald-100"
                : toast.type === "error"
                ? "bg-red-900/90 border-red-700/50 text-red-100"
                : toast.type === "warning"
                ? "bg-amber-900/90 border-amber-700/50 text-amber-100"
                : "bg-blue-900/90 border-blue-700/50 text-blue-100"
            }`}
          >
            <span className="text-lg" aria-hidden="true">
              {toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : toast.type === "warning" ? "⚠️" : "ℹ️"}
            </span>
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Return a no-op function if used outside provider
    return () => console.warn('useToast must be used within ToastProvider');
  }
  return context;
}

// ── Quick Add Customer Modal ──────────────────────────────────────────────────
export function QuickAddCustomerModal({ prefill, onSave, onClose }) {
  const [form, setForm] = useState({ name: prefill || "", phone: "", aadhar: "", email: "", address: "" });
  const [errors, setErrors] = useState({});
  const ff = (k) => (e) => { setForm((p) => ({ ...p, [k]: e.target.value })); setErrors((p) => ({ ...p, [k]: undefined })); };
  
  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  
  const save = () => { if (!validate()) return; onSave(form); };
  
  return (
    <Modal title="➕ Add New Customer" onClose={onClose}>
      <div className="space-y-3">
        <Input label="Name *" value={form.name} onChange={ff("name")} error={errors.name} placeholder="Customer name" autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" value={form.phone} onChange={ff("phone")} placeholder="9876543210" />
          <Input label="Email" value={form.email} onChange={ff("email")} placeholder="email@example.com" />
        </div>
        <Input label="Aadhar Number" value={form.aadhar} onChange={ff("aadhar")} placeholder="XXXX XXXX XXXX" />
        <Input label="Address" value={form.address} onChange={ff("address")} placeholder="Full address" />
        <div className="flex gap-2 pt-1">
          <Btn onClick={save}>Save & Select</Btn>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Customer Combobox ─────────────────────────────────────────────────────────
export function CustomerCombobox({ customers, value, onChange, onAddCustomer }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const ref = useRef(null);

  const selected = value ? customers.find((c) => String(c.id) === String(value)) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    const matches = customers.filter((c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.aadhar || "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))
    );
    return [...matches].sort((a, b) => {
      const aStarts = (a.name || "").toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = (b.name || "").toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts;
    });
  }, [query, customers]);

  const select = (c) => { onChange(c.id); setQuery(""); setOpen(false); };
  const clear = () => { onChange(""); setQuery(""); };

  const handleQuickAdd = (form) => {
    const newCust = onAddCustomer(form);
    onChange(newCust.id);
    setQuery(""); setOpen(false); setShowQuickAdd(false);
  };

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide mb-1">Select Customer *</label>
      {selected && !open ? (
        <div className="flex items-center justify-between border border-emerald-700/30 rounded-xl px-3 py-2.5 bg-emerald-900/20">
          <div>
            <p className="text-sm font-semibold text-emerald-100">{selected.name}</p>
            <p className="text-xs text-emerald-400/70">{selected.phone}{selected.aadhar ? ` · ${selected.aadhar}` : ""}</p>
          </div>
          <button onClick={clear} className="text-emerald-500/50 hover:text-red-400 text-lg ml-2" aria-label="Clear selection">✕</button>
        </div>
      ) : (
        <div className="relative">
          <input
            autoFocus={open}
            className="w-full border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30"
            placeholder="Search by name, phone or Aadhar…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            aria-expanded={open}
            aria-haspopup="listbox"
          />
          {open && (
            <div className="combobox-drop" role="listbox">
              {filtered.length === 0 && (
                <p className="px-4 py-2.5 text-sm text-emerald-500/50 italic">No customers match "{query}"</p>
              )}
              {filtered.map((c) => (
                <div key={c.id} className="combobox-item px-4 py-2.5 cursor-pointer" role="option" onMouseDown={() => select(c)}>
                  <p className="text-sm font-semibold text-emerald-100">{c.name}</p>
                  <p className="text-xs text-emerald-500/50">{c.phone}{c.aadhar ? ` · Aadhar: ${c.aadhar}` : ""}</p>
                </div>
              ))}
              <div
                className="px-4 py-3 cursor-pointer border-t border-emerald-700/20 flex items-center gap-2"
                style={{ background: "linear-gradient(135deg,rgba(16,185,129,.06),rgba(99,102,241,.04))" }}
                onMouseDown={(e) => { e.preventDefault(); setOpen(false); setShowQuickAdd(true); }}
              >
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm" style={{ background: "linear-gradient(135deg,#059669,#4f46e5)" }}>+</span>
                <div>
                  <p className="text-sm font-semibold text-emerald-400">Add New Customer</p>
                  {query.trim() && <p className="text-xs text-emerald-500/50">Create "{query}" as a new customer</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {showQuickAdd && (
        <QuickAddCustomerModal
          prefill={query}
          onSave={handleQuickAdd}
          onClose={() => setShowQuickAdd(false)}
        />
      )}
    </div>
  );
}

// ── Item Combobox ─────────────────────────────────────────────────────────────
export function ItemCombobox({ items, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const blurTimer = useRef(null);

  const selected = items.find((i) => String(i.id) === String(value));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const matches = items.filter((i) =>
      (i.name || "").toLowerCase().includes(q) ||
      (i.category || "").toLowerCase().includes(q)
    );
    return [...matches].sort((a, b) => {
      const aName = (a.name || "").toLowerCase();
      const bName = (b.name || "").toLowerCase();
      const aScore = aName === q ? 0 : aName.startsWith(q) ? 1 : aName.includes(q) ? 2 : 3;
      const bScore = bName === q ? 0 : bName.startsWith(q) ? 1 : bName.includes(q) ? 2 : 3;
      return aScore - bScore;
    });
  }, [query, items]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const select = (i) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onChange(String(i.id));
    setQuery("");
    setOpen(false);
  };
  const clear = () => { onChange(""); setQuery(""); };

  return (
    <div ref={ref} className="relative flex-1">
      {selected && !open ? (
        <div className="flex items-center justify-between border border-emerald-700/30 rounded-xl px-3 py-2.5 bg-emerald-900/20">
          <div>
            <p className="text-sm font-semibold text-emerald-100">{selected.name}</p>
            <p className="text-xs text-emerald-400/70">
              {fmtCurrency(selected.price)} · {selected.stock === 0 ? "Out of stock" : `${selected.stock} in stock`}
              {selected.category ? ` · ${selected.category}` : ""}
            </p>
          </div>
          <button onClick={clear} className="text-emerald-500/50 hover:text-red-400 text-lg ml-2" aria-label="Clear selection">✕</button>
        </div>
      ) : (
        <div className="relative">
          <input
            autoFocus
            className="w-full border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30"
            placeholder="Search by item name or category…"
            value={query}
            onChange={(e) => { if (blurTimer.current) clearTimeout(blurTimer.current); setQuery(e.target.value); setOpen(true); }}
            onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setOpen(true); }}
            onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 300); }}
            aria-expanded={open}
            aria-haspopup="listbox"
          />
          {open && filtered.length > 0 && (
            <div className="combobox-drop" role="listbox">
              {filtered.map((i) => (
                <div 
                  key={i.id} 
                  className={`combobox-item px-4 py-2.5 cursor-pointer ${i.stock === 0 ? "opacity-40" : ""}`} 
                  role="option"
                  onMouseDown={() => { if (i.stock > 0) select(i); }}
                >
                  <p className="text-sm font-semibold text-emerald-100">{i.name}</p>
                  <p className="text-xs text-emerald-500/50">
                    {fmtCurrency(i.price)} · {i.stock === 0 ? "Out of stock" : `${i.stock} in stock`}
                    {i.category ? ` · ${i.category}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
          {open && query.trim() && filtered.length === 0 && (
            <div className="combobox-drop">
              <p className="px-4 py-4 text-sm text-emerald-500/50 italic text-center">No items match "{query}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Record Payment Modal ──────────────────────────────────────────────────────
export function RecordPaymentModal({ invoice, onRecord, onClose }) {
  const balance = invoice.total - (invoice.paidAmount || 0);
  const [amount, setAmount] = useState(balance > 0 ? balance : 0);
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Don't allow payment if already fully paid
  if (balance <= 0) {
    return (
      <Modal title={`💵 Record Payment — ${invoice.id}`} onClose={onClose}>
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-emerald-900/20 border border-emerald-700/20 text-center">
            <p className="text-emerald-400 font-semibold">✅ This invoice is already fully paid!</p>
            <p className="text-sm text-emerald-500/70 mt-1">Total: {fmtCurrency(invoice.total)} | Paid: {fmtCurrency(invoice.paidAmount || 0)}</p>
          </div>
          <Btn variant="secondary" onClick={onClose} className="w-full">Close</Btn>
        </div>
      </Modal>
    );
  }
  
  const handleSubmit = () => {
    if (isSubmitting) return; // Prevent double-click
    if (amount <= 0 || amount > balance) return;
    
    setIsSubmitting(true);
    onRecord(invoice.id, amount, method, note);
    onClose(); // Close modal after recording
  };
  
  return (
    <Modal title={`💵 Record Payment — ${invoice.id}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/20">
          <div className="flex justify-between items-center">
            <span className="text-sm text-emerald-400/70">Invoice Total</span>
            <span className="font-bold text-emerald-300">{fmtCurrency(invoice.total)}</span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-sm text-emerald-400/70">Already Paid</span>
            <span className="font-bold text-emerald-400">{fmtCurrency(invoice.paidAmount || 0)}</span>
          </div>
          <div className="flex justify-between items-center mt-1 pt-2 border-t border-emerald-700/20">
            <span className="text-sm font-bold text-amber-400">Balance Due</span>
            <span className="font-bold text-amber-400">{fmtCurrency(balance)}</span>
          </div>
        </div>
        
        <Input 
          label="Payment Amount" 
          type="number" 
          value={amount} 
          onChange={(e) => setAmount(Number(e.target.value))}
          min={1}
          max={balance}
        />
        
        <div>
          <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide mb-2">Payment Method</label>
          <div className="flex gap-2">
            {[
              { id: "cash", label: "💵 Cash", color: "emerald" },
              { id: "upi", label: "📱 UPI", color: "purple" },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  method === m.id
                    ? m.color === "emerald" 
                      ? "bg-emerald-600 text-white shadow-md" 
                      : "bg-purple-600 text-white shadow-md"
                    : "bg-emerald-900/30 text-emerald-400 border border-emerald-700/30 hover:bg-emerald-900/50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        
        <Input 
          label="Note (optional)" 
          value={note} 
          onChange={(e) => setNote(e.target.value)}
          placeholder="Payment note..."
        />
        
        <div className="flex gap-2 pt-2">
          <Btn onClick={handleSubmit} disabled={amount <= 0 || amount > balance || isSubmitting}>
            {isSubmitting ? "Recording..." : `Record Payment ${fmtCurrency(amount)}`}
          </Btn>
          <Btn variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Delete Confirmation Modal ─────────────────────────────────────────────────
export function DeleteConfirmModal({ title, itemName, onConfirm, onClose }) {
  return (
    <Modal title={title || "Delete Item"} onClose={onClose}>
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-red-900/20 border border-red-800/30">
          <p className="text-sm text-red-300 font-semibold mb-1">
            Are you sure you want to delete <strong>{itemName}</strong>?
          </p>
          <p className="text-xs text-red-400/70">This action cannot be undone.</p>
        </div>
        <div className="flex gap-2 justify-end">
          <Btn variant="secondary" size="sm" onClick={onClose}>Cancel</Btn>
          <button 
            onClick={onConfirm} 
            className="px-4 py-2 text-sm font-bold rounded-xl text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md"
          >
            Yes, Delete
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default {
  Badge,
  Modal,
  Input,
  SelectField,
  Btn,
  ToastProvider,
  useToast,
  QuickAddCustomerModal,
  CustomerCombobox,
  ItemCombobox,
  RecordPaymentModal,
  DeleteConfirmModal,
  QuickAddCompanyModal,
  CompanyCombobox,
  PurchaseItemCombobox,
};

// ── Purchase Item Combobox ────────────────────────────────────────────────────
export function PurchaseItemCombobox({ items, value, onChange }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const blurTimer = useRef(null);

  const selected = items.find((i) => String(i.id) === String(value));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const matches = items.filter((i) =>
      (i.name || "").toLowerCase().includes(q) ||
      (i.category || "").toLowerCase().includes(q)
    );
    return [...matches].sort((a, b) => {
      const aName = (a.name || "").toLowerCase();
      const bName = (b.name || "").toLowerCase();
      const aCat = (a.category || "").toLowerCase();
      const bCat = (b.category || "").toLowerCase();
      const aScore = aName === q ? 0 : aName.startsWith(q) ? 1 : aName.includes(q) ? 2 : aCat.includes(q) ? 3 : 4;
      const bScore = bName === q ? 0 : bName.startsWith(q) ? 1 : bName.includes(q) ? 2 : bCat.includes(q) ? 3 : 4;
      return aScore - bScore;
    });
  }, [query, items]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const select = (i) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onChange(String(i.id));
    setQuery("");
    setOpen(false);
  };
  const clear = () => { onChange(""); setQuery(""); };

  return (
    <div ref={ref} className="relative flex-1">
      {selected && !open ? (
        <div className="flex items-center justify-between border border-emerald-700/30 rounded-xl px-3 py-2.5 bg-emerald-900/20">
          <div>
            <p className="text-sm font-semibold text-emerald-100">{selected.name}</p>
            <p className="text-xs text-emerald-400/70">{fmtCurrency(selected.price)}{selected.category ? ` · ${selected.category}` : ""}</p>
          </div>
          <button onClick={clear} className="text-emerald-500/50 hover:text-red-400 text-lg ml-2">✕</button>
        </div>
      ) : (
        <div className="relative">
          <input
            autoFocus
            className="w-full border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30"
            placeholder="Search purchase items by name or category…"
            value={query}
            onChange={(e) => { if (blurTimer.current) clearTimeout(blurTimer.current); setQuery(e.target.value); setOpen(true); }}
            onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setOpen(true); }}
            onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 300); }}
          />
          {open && filtered.length > 0 && (
            <div key={query} className="combobox-drop">
              {filtered.map((i) => (
                <div key={i.id} className="combobox-item px-4 py-2.5 cursor-pointer" onMouseDown={() => select(i)}>
                  <p className="text-sm font-semibold text-emerald-100">{i.name}</p>
                  <p className="text-xs text-emerald-500/50">{fmtCurrency(i.price)}{i.category ? ` · ${i.category}` : ""}</p>
                </div>
              ))}
            </div>
          )}
          {open && query.trim() && filtered.length === 0 && (
            <div className="combobox-drop">
              <p className="px-4 py-4 text-sm text-emerald-500/50 italic text-center">No purchase items match "{query}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Quick Add Company Modal ───────────────────────────────────────────────────
export function QuickAddCompanyModal({ prefill, onSave, onClose }) {
  const [form, setForm] = useState({ name: prefill || "", phone: "", email: "", address: "", gstin: "" });
  const ff = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Modal title="+ Add New Company" onClose={onClose}>
      <div className="space-y-3">
        <Input label="Company Name *" value={form.name} onChange={ff("name")} placeholder="Company name" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" value={form.phone} onChange={ff("phone")} placeholder="Phone number" />
          <Input label="GSTIN" value={form.gstin} onChange={ff("gstin")} placeholder="GST number" />
        </div>
        <Input label="Email" value={form.email} onChange={ff("email")} placeholder="email@company.com" />
        <Input label="Address" value={form.address} onChange={ff("address")} placeholder="Full address" />
        <div className="flex gap-2 pt-2"><Btn onClick={() => { if (form.name.trim()) onSave(form); }} disabled={!form.name.trim()}>Save Company</Btn><Btn variant="secondary" onClick={onClose}>Cancel</Btn></div>
      </div>
    </Modal>
  );
}

// ── Company Combobox (search by name / phone / GSTIN + inline add) ────────────
export function CompanyCombobox({ companies, value, onChange, onAddCompany }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const ref = useRef(null);

  const selected = value ? companies.find((c) => String(c.id) === String(value)) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.gstin || "").toLowerCase().includes(q)
    );
  }, [query, companies]);

  const select = (c) => { onChange(c.id); setQuery(""); setOpen(false); };
  const clear = () => { onChange(""); setQuery(""); };

  const handleQuickAdd = (form) => {
    const newComp = onAddCompany(form);
    onChange(newComp.id);
    setQuery(""); setOpen(false); setShowQuickAdd(false);
  };

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold text-emerald-400/70 uppercase tracking-wide mb-1">Select Company *</label>
      {selected && !open ? (
        <div className="flex items-center justify-between border border-emerald-700/30 rounded-xl px-3 py-2.5 bg-emerald-900/20">
          <div>
            <p className="text-sm font-semibold text-emerald-100">{selected.name}</p>
            <p className="text-xs text-emerald-400/70">{selected.phone}{selected.gstin ? ` · GSTIN: ${selected.gstin}` : ""}</p>
          </div>
          <button onClick={clear} className="text-emerald-500/50 hover:text-red-400 text-lg ml-2">✕</button>
        </div>
      ) : (
        <div className="relative">
          <input
            autoFocus={open}
            className="w-full border border-emerald-700/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 bg-emerald-900/30"
            placeholder="Search by company name, phone or GSTIN…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 300)}
          />
          {open && (
            <div className="combobox-drop">
              {filtered.length === 0 && (
                <p className="px-4 py-2.5 text-sm text-emerald-500/50 italic">No companies match "{query}"</p>
              )}
              {filtered.map((c) => (
                <div key={c.id} className="combobox-item px-4 py-2.5 cursor-pointer" onMouseDown={() => select(c)}>
                  <p className="text-sm font-semibold text-emerald-100">{c.name}</p>
                  <p className="text-xs text-emerald-500/50">{c.phone}{c.gstin ? ` · GSTIN: ${c.gstin}` : ""}</p>
                </div>
              ))}
              <div
                className="px-4 py-3 cursor-pointer border-t border-emerald-700/20 flex items-center gap-2"
                style={{ background: "linear-gradient(135deg,rgba(16,185,129,.06),rgba(99,102,241,.04))" }}
                onMouseDown={(e) => { e.preventDefault(); setOpen(false); setShowQuickAdd(true); }}
              >
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm" style={{ background: "linear-gradient(135deg,#059669,#4f46e5)" }}>+</span>
                <div>
                  <p className="text-sm font-semibold text-emerald-400">Add New Company</p>
                  {query.trim() && <p className="text-xs text-emerald-500/50">Create "{query}" as a new company</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {showQuickAdd && (
        <QuickAddCompanyModal
          prefill={query}
          onSave={handleQuickAdd}
          onClose={() => setShowQuickAdd(false)}
        />
      )}
    </div>
  );
}
