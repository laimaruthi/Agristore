/**
 * Users Page - Staff user management
 * 100% Offline - No Firebase
 * Roles: Manager (full access), Staff (limited access)
 */
import { useState } from "react";
import { Modal, Input, Btn } from "../components/UIComponents";
import { Alert } from "../components/Alert";
import { Icon } from "../components/Icon";
import { registerLocal } from "../services/localAuth";

// Helper to generate unique IDs
const newId = (arr) => arr.length === 0 ? 1 : Math.max(...arr.map((x) => x.id || 0)) + 1;

// Role definitions
export const ROLES = {
  manager: {
    label: "Manager",
    color: "purple",
    description: "Full access to all features",
    permissions: ["dashboard", "customers", "items", "invoices", "purchases", "users", "settings", "delete", "edit_price", "view_reports"]
  },
  staff: {
    label: "Staff",
    color: "emerald",
    description: "Limited access - Sales & basic operations",
    permissions: ["dashboard", "customers", "items", "invoices"]
  }
};

// Check if user has permission
export const hasPermission = (user, permission) => {
  if (!user) return false;
  const role = user.role || "staff";
  const roleConfig = ROLES[role] || ROLES.staff;
  return roleConfig.permissions.includes(permission);
};

// Check if user is manager
export const isManager = (user) => {
  return user?.role === "manager" || user?.role === "admin";
};

export default function UsersPage({ users, setUsers, currentUser }) {
  const [modal, setModal] = useState(null);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const ff = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const openAdd = () => { setForm({ name: "", email: "", password: "", role: "staff" }); setSaveError(""); setModal("add"); };
  const openEdit = (u) => { setSel(u); setForm({ ...u, password: "" }); setSaveError(""); setModal("edit"); };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) { setSaveError("Name and email are required."); return; }
    setSaving(true); setSaveError("");
    try {
      if (modal === "add") {
        if (!form.password || form.password.length < 6) { 
          setSaveError("Password must be at least 6 characters."); 
          setSaving(false); 
          return; 
        }
        
        const exists = users.some(u => u.email && u.email.toLowerCase() === form.email.trim().toLowerCase());
        if (exists) {
          setSaveError("This email is already registered.");
          setSaving(false);
          return;
        }
        
        // ✅ Correct argument order: (name, email, password, role)
        // registerLocal already writes the user (with id + password_hash) into the SQLite users table.
        // We only need to merge that exact record into React state — never invent a new id or
        // overwrite password_hash, otherwise replaceAll will wipe out the saved hash.
        const newUser = await registerLocal(form.name.trim(), form.email.trim(), form.password, form.role);
        setUsers((p) => {
          // Avoid duplicates if state already contains the saved user
          if (p.some(u => u.id === newUser.id)) return p;
          return [...p, newUser];
        });
      } else {
        setUsers((p) => p.map((u) => u.id === sel.id ? { ...u, name: form.name, role: form.role } : u));
      }
      setModal(null);
    } catch (err) {
      setSaveError(err.message || "Failed to create user.");
    } finally { setSaving(false); }
  };

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const del = () => {
    if (!deleteConfirm) return;
    setUsers((p) => p.filter((u) => u.id !== deleteConfirm.id));
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold page-title">Staff Users</h1>
        <Btn size="sm" onClick={openAdd}>+ Add User</Btn>
      </div>
      
      <div className="p-3 rounded-xl bg-emerald-900/20 border border-emerald-800/30 text-xs text-emerald-400">
        👤 Users are stored locally. Add staff members who can log in to this app.
      </div>
      
      <div className="card overflow-hidden">
        <div className="section-header"><h3 className="text-sm font-semibold text-emerald-300">{users.length} staff</h3></div>
        <table className="w-full text-sm">
          <thead className="thead-sticky">
            <tr>{["Name", "Email", "Role", "Actions"].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-bold text-emerald-500/50 uppercase tracking-wide">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-emerald-800/30">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-emerald-800/20 transition-colors">
                <td className="px-4 py-3 font-semibold text-emerald-100">{u.name}</td>
                <td className="px-4 py-3 text-emerald-400/70">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                    u.role === 'manager' || u.role === 'admin' 
                      ? 'bg-purple-600 text-white' 
                      : 'bg-emerald-600 text-white'
                  }`}>
                    {u.role === 'manager' || u.role === 'admin' ? '👑 Manager' : '👤 Staff'}
                  </span>
                </td>
                <td className="px-4 py-3"><div className="flex gap-1.5">
                  <Btn size="sm" variant="outline" onClick={() => openEdit(u)}>Edit</Btn>
                  <Btn size="sm" variant="danger" onClick={() => setDeleteConfirm(u)}>Remove</Btn>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(modal === "add" || modal === "edit") && (
        <Modal title={modal === "add" ? "Add Staff User" : "Edit Staff User"} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <Input label="Full Name *" value={form.name} onChange={ff("name")} placeholder="Staff name" />
            {modal === "add" && <>
              <Input label="Email *" type="email" value={form.email} onChange={ff("email")} placeholder="staff@example.com" />
              <Input label="Password *" type="password" value={form.password} onChange={ff("password")} placeholder="Min 6 characters" hint="Used to log in to the app" />
            </>}
            {modal === "edit" && (
              <div className="px-3 py-2 bg-emerald-900/20 rounded-xl text-xs text-emerald-400/70">
                Email: <strong>{sel?.email}</strong>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-emerald-300 mb-1">Role</label>
              <select 
                value={form.role} 
                onChange={ff("role")}
                className="w-full px-3 py-2 bg-slate-800 border border-emerald-700/30 rounded-xl text-emerald-100 text-sm"
              >
                <option value="staff">👤 Staff (Limited Access)</option>
                <option value="manager">👑 Manager (Full Access)</option>
              </select>
              <p className="text-xs text-emerald-500/60 mt-1">
                {form.role === "manager" 
                  ? "✅ Can access all features: Users, Settings, Delete items, Edit prices" 
                  : "📋 Can access: Dashboard, Customers, Items, Invoices only"}
              </p>
            </div>
            {saveError && <Alert variant="error">{saveError}</Alert>}
            <div className="flex gap-2 pt-2">
              <Btn onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
              <Btn variant="secondary" onClick={() => setModal(null)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
      
      {deleteConfirm && (
        <Modal title="Remove User" onClose={() => setDeleteConfirm(null)}>
          <div className="space-y-4">
            <Alert variant="error" title={<>Are you sure you want to remove <strong>{deleteConfirm.name}</strong>?</>}>
              This user will no longer be able to log in.
            </Alert>
            <div className="flex gap-2 justify-end">
              <Btn variant="secondary" size="sm" onClick={() => setDeleteConfirm(null)}>Cancel</Btn>
              <button onClick={del} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md">
                <Icon name="trash" size={16} />
                Yes, Remove
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
