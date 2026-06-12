/**
 * Other Expenses Page - Track non-inventory business expenses
 * (rent, electricity, salary, transport, etc.) for accurate profit calculation
 *
 * Each expense reduces Net Profit on Dashboard and Reports.
 */
import { useState, useMemo } from "react";
import { Btn, Input, Modal, Badge, useToast } from "../components/UIComponents";
import { fmtCurrency, today } from "../utils/helpers";
import { Icon } from "../components/Icon";

const DEFAULT_CATEGORIES = [
  "Rent",
  "Electricity",
  "Water",
  "Salary",
  "Transport",
  "Maintenance",
  "Office Supplies",
  "Marketing",
  "Internet/Phone",
  "Tax/Govt Fees",
  "Loan/Interest",
  "Other",
];

const PAYMENT_MODES = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque"];

const newId = (list) =>
  list.length > 0 ? Math.max(...list.map((x) => Number(x.id) || 0)) + 1 : 1;

const getDatePart = (s) => (s ? String(s).split(" ")[0].split("T")[0] : "");

export default function OtherExpensesPage({
  otherExpenses = [],
  setOtherExpenses,
  addActivity,
  user,
}) {
  const showToast = useToast();
  const todayStr = today();
  const thisMonth = todayStr.slice(0, 7);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("month"); // today | month | all
  const [search, setSearch] = useState("");

  const blank = {
    id: null,
    date: todayStr,
    category: "Rent",
    description: "",
    amount: "",
    paymentMode: "Cash",
    notes: "",
  };
  const [form, setForm] = useState(blank);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...blank, date: todayStr });
    setModalOpen(true);
  };
  const openEdit = (exp) => {
    setEditing(exp);
    setForm({ ...exp, amount: String(exp.amount) });
    setModalOpen(true);
  };

  const save = () => {
    if (!form.date) return showToast("Date required", "error");
    if (!form.category) return showToast("Category required", "error");
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return showToast("Enter a valid amount", "error");

    const record = {
      ...form,
      amount: amt,
      description: (form.description || "").trim(),
      notes: (form.notes || "").trim(),
      updatedAt: new Date().toISOString(),
      createdBy: user?.name || user?.email || "Unknown",
    };

    if (editing) {
      setOtherExpenses((p) =>
        p.map((x) => (String(x.id) === String(editing.id) ? { ...x, ...record } : x))
      );
      addActivity?.(
        `Updated expense: ${record.category} - ${fmtCurrency(amt)}`,
        "expense"
      );
      showToast("Expense updated", "success");
    } else {
      const id = newId(otherExpenses);
      const newRec = { id, createdAt: new Date().toISOString(), ...record };
      setOtherExpenses((p) => [newRec, ...p]);
      addActivity?.(
        `Added expense: ${record.category} - ${fmtCurrency(amt)}`,
        "expense"
      );
      showToast("Expense added", "success");
    }

    setModalOpen(false);
    setEditing(null);
    setForm(blank);
  };

  const remove = (exp) => {
    if (!window.confirm(`Delete this ${exp.category} expense of ${fmtCurrency(exp.amount)}?`))
      return;
    setOtherExpenses((p) => p.filter((x) => String(x.id) !== String(exp.id)));
    addActivity?.(
      `Deleted expense: ${exp.category} - ${fmtCurrency(exp.amount)}`,
      "expense"
    );
    showToast("Expense deleted", "success");
  };

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return otherExpenses
      .filter((e) => {
        const d = getDatePart(e.date);
        if (filter === "today" && d !== todayStr) return false;
        if (filter === "month" && !d.startsWith(thisMonth)) return false;
        if (q) {
          const hay = `${e.category} ${e.description} ${e.notes} ${e.paymentMode}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [otherExpenses, filter, search, todayStr, thisMonth]);

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalAll = useMemo(
    () => otherExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [otherExpenses]
  );
  const totalToday = useMemo(
    () =>
      otherExpenses
        .filter((e) => getDatePart(e.date) === todayStr)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [otherExpenses, todayStr]
  );
  const totalMonth = useMemo(
    () =>
      otherExpenses
        .filter((e) => getDatePart(e.date).startsWith(thisMonth))
        .reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [otherExpenses, thisMonth]
  );
  const totalFiltered = useMemo(
    () => filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [filtered]
  );

  // Category breakdown for current filter
  const byCategory = useMemo(() => {
    const map = {};
    filtered.forEach((e) => {
      const c = e.category || "Other";
      map[c] = (map[c] || 0) + (Number(e.amount) || 0);
    });
    return Object.entries(map)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-emerald-100 flex items-center gap-2">
            <Icon name="wallet" size={24} className="text-emerald-400" />
            <span className="page-title">Other Expenses</span>
          </h1>
          <div className="text-xs text-emerald-500/60 mt-1">
            Non-inventory costs (rent, electricity, salary, etc.) — automatically deducted from Net Profit
          </div>
        </div>
        <Btn onClick={openAdd} variant="primary">
          <Icon name="plus" size={16} className="text-white" />
          <span>Add Expense</span>
        </Btn>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KPI label="Today" value={fmtCurrency(totalToday)} />
        <KPI label="This Month" value={fmtCurrency(totalMonth)} tone="amber" />
        <KPI label="All Time" value={fmtCurrency(totalAll)} tone="red" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        {[
          { id: "today", label: "Today" },
          { id: "month", label: "This Month" },
          { id: "all", label: "All Time" },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              filter === f.id
                ? "bg-emerald-600 text-white"
                : "bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50"
            }`}
          >
            {f.label}
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search category, description…"
          className="ml-2 flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-emerald-900/30 text-emerald-200 text-sm border border-emerald-700/30 placeholder-emerald-600"
        />
      </div>

      {/* Category breakdown + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Breakdown card */}
        <div className="card p-4 lg:col-span-1">
          <div className="text-sm font-bold text-emerald-100 mb-3">
            By Category ({filter === "today" ? "Today" : filter === "month" ? "This Month" : "All Time"})
          </div>
          {byCategory.length === 0 ? (
            <div className="text-emerald-500/50 text-sm py-4">No expenses in this period.</div>
          ) : (
            <div className="space-y-2">
              {byCategory.map((c) => {
                const pct = totalFiltered > 0 ? (c.amount / totalFiltered) * 100 : 0;
                return (
                  <div key={c.category}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-emerald-200">{c.category}</span>
                      <span className="text-emerald-300 font-medium">{fmtCurrency(c.amount)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-emerald-900/40 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 mt-2 border-t border-emerald-700/30 flex justify-between text-sm font-bold">
                <span className="text-emerald-100">Total</span>
                <span className="text-red-400">{fmtCurrency(totalFiltered)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="card p-4 lg:col-span-2">
          <div className="text-sm font-bold text-emerald-100 mb-3 flex justify-between">
            <span>Expense Records ({filtered.length})</span>
            <span className="text-red-400">{fmtCurrency(totalFiltered)}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="text-emerald-500/50 text-sm py-8 text-center">
              No expenses recorded. Click <strong>+ Add Expense</strong> to start tracking.
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-emerald-300 uppercase border-b border-emerald-700/30 sticky top-0 t-card-bg z-10">
                  <tr>
                    <th className="text-left py-2 px-2">Date</th>
                    <th className="text-left">Category</th>
                    <th className="text-left">Description</th>
                    <th className="text-left">Mode</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right pr-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-b border-emerald-700/20 hover:bg-emerald-900/10">
                      <td className="py-2 px-2 text-emerald-300 whitespace-nowrap">
                        {getDatePart(e.date)}
                      </td>
                      <td>
                        <Badge color="purple">{e.category}</Badge>
                      </td>
                      <td className="text-emerald-200">{e.description || "—"}</td>
                      <td className="text-emerald-400 text-xs">{e.paymentMode || "Cash"}</td>
                      <td className="text-right text-red-400 font-medium">
                        {fmtCurrency(e.amount)}
                      </td>
                      <td className="text-right pr-2 whitespace-nowrap">
                        <button
                          onClick={() => openEdit(e)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-emerald-300 hover:text-white hover:bg-emerald-700/40 transition mr-1"
                          title="Edit"
                          aria-label="Edit expense"
                        >
                          <Icon name="edit" size={16} />
                        </button>
                        <button
                          onClick={() => remove(e)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-300 hover:text-white hover:bg-red-600/60 bg-red-900/20 border border-red-700/40 transition"
                          title="Delete"
                          aria-label="Delete expense"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <Modal
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          title={editing ? "Edit Expense" : "Add Expense"}
        >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-emerald-300 mb-1 block">Date *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                style={{ colorScheme: "dark" }}
                className="w-full px-3 py-2 rounded-lg bg-emerald-900/30 text-emerald-200 border border-emerald-700/30"
              />
            </div>
            <div>
              <label className="text-xs text-emerald-300 mb-1 block">Category *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-emerald-900/30 text-emerald-200 border border-emerald-700/30"
              >
                {DEFAULT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-emerald-300 mb-1 block">Description</label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. April shop rent, EB bill, driver salary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-emerald-300 mb-1 block">Amount (₹) *</label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="text-xs text-emerald-300 mb-1 block">Payment Mode</label>
              <select
                value={form.paymentMode}
                onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-emerald-900/30 text-emerald-200 border border-emerald-700/30"
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-emerald-300 mb-1 block">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Reference number, vendor name, etc."
              rows="2"
              className="w-full px-3 py-2 rounded-lg bg-emerald-900/30 text-emerald-200 border border-emerald-700/30 text-sm"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="secondary" onClick={() => { setModalOpen(false); setEditing(null); }}>
              Cancel
            </Btn>
            <Btn variant="primary" onClick={save}>
              {editing ? "Update" : "Save"}
            </Btn>
          </div>
        </div>
        </Modal>
      )}
    </div>
  );
}

function KPI({ label, value, tone }) {
  const color =
    tone === "red" ? "text-red-400" : tone === "amber" ? "text-amber-400" : "text-emerald-100";
  return (
    <div className="card p-4">
      <div className="text-xs text-emerald-300 font-medium uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
