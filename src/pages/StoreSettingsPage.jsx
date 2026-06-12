/**
 * Store Settings Page - Store info, themes, backups, Google Drive sync
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { Modal, Btn, Input, useToast } from "../components/UIComponents";
import { today, exportCSV } from "../utils/helpers";
import { FirebaseSyncSettings } from "../components/FirebaseSyncComponents";
import UpdateSettings from "../components/UpdateSettings";

function StoreSettingsPage({ 
  storeInfo, setStoreInfo, 
  user, setBgImageLocal, 
  customers, setCustomers,
  items, setItems,
  invoices, setInvoices,
  users, setUsers,
  activity, setActivity,
  categories, setCategories,
  companies, setCompanies,
  purchases, setPurchases,
  purchaseItems, setPurchaseItems,
  purchaseCategories, setPurchaseCategories,
  globalGdriveConnected, setGlobalGdriveConnected,
  // Google Drive utilities (passed from App)
  loadGoogleScripts,
  getGoogleDriveToken,
  restoreGDriveConnection,
  clearGDriveConnection,
  uploadToGoogleDriveWithHistory,
  canPerformGDriveBackup,
  isBackupDataValid,
  recordGDriveBackup,
  recordGDriveError,
  getGDriveBackupStats,
  GDRIVE_RATE_LIMIT,
  THEMES,
  LocalBackupSection
}) {
  const [form, setForm] = useState(() => {
    const bgFromStorage = localStorage.getItem("bgImage_store") || "";
    return { ...storeInfo, bgImage: bgFromStorage || storeInfo.bgImage };
  });
  const [saved, setSaved] = useState(false);
  const bgRef = useRef(null);
  const [bgError, setBgError] = useState("");
  const [bgUploading, setBgUploading] = useState(false);
  const showToast = useToast();

  // Database Health State
  const [dbHealth, setDbHealth] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [dbType, setDbType] = useState('indexeddb'); // 'sqlite' or 'indexeddb'
  const [isVacuuming, setIsVacuuming] = useState(false);
  
  // Firebase Sync State
  const [showFirebaseSetup, setShowFirebaseSetup] = useState(false);

  // Check database health on mount
  useEffect(() => {
    checkDatabaseHealth();
    // Detect database type
    if (window.electronAPI?.useSQLite) {
      setDbType('sqlite');
    }
  }, []);

  const checkDatabaseHealth = async () => {
    setIsCheckingHealth(true);
    try {
      // SQLite (Electron) path — uses IPC
      if (window.electronAPI?.db?.checkHealth) {
        const health = await Promise.race([
          window.electronAPI.db.checkHealth(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Health check timed out (8s)')), 8000))
        ]);
        setDbHealth(health);
      } else {
        setDbHealth({ status: 'ok', backend: 'indexeddb' });
      }
    } catch (err) {
      setDbHealth({ status: 'error', error: err.message });
    }
    setIsCheckingHealth(false);
  };

  // SQLite-specific: Vacuum/Optimize database
  const vacuumDatabase = async () => {
    if (!window.electronAPI?.db?.vacuum) {
      showToast("Vacuum only available for SQLite database", "warning");
      return;
    }
    setIsVacuuming(true);
    try {
      const result = await window.electronAPI.db.vacuum();
      if (result.success) {
        showToast("Database optimized successfully!", "success");
        checkDatabaseHealth();
      } else {
        showToast("Vacuum failed: " + result.error, "error");
      }
    } catch (err) {
      showToast("Vacuum failed: " + err.message, "error");
    }
    setIsVacuuming(false);
  };

  // SQLite-specific: Create file backup
  const createSQLiteBackup = async () => {
    if (!window.electronAPI?.saveBackupDialog) {
      showToast("SQLite backup only available in desktop app", "warning");
      return;
    }
    try {
      const filePath = await window.electronAPI.saveBackupDialog();
      if (!filePath) return;

      const result = await window.electronAPI.db.createBackup(filePath);
      if (result.success) {
        showToast(`Backup created: ${result.path}`, "success");
      } else {
        showToast("Backup failed: " + result.error, "error");
      }
    } catch (err) {
      showToast("Backup failed: " + err.message, "error");
    }
  };

  // SQLite-specific: Restore from file backup
  const restoreSQLiteBackup = async () => {
    if (!window.electronAPI?.selectBackupFile) {
      showToast("SQLite restore only available in desktop app", "warning");
      return;
    }
    if (!confirm("⚠️ This will replace ALL current data with the backup. Are you sure?")) {
      return;
    }
    try {
      const filePath = await window.electronAPI.selectBackupFile();
      if (!filePath) return;
      
      const result = await window.electronAPI.db.restoreBackup(filePath);
      if (result.success) {
        showToast("Database restored! Restarting...", "success");
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showToast("Restore failed: " + result.error, "error");
      }
    } catch (err) {
      showToast("Restore failed: " + err.message, "error");
    }
  };

  const createManualCheckpoint = async () => {
    try {
      const db = await getDatabase();
      await db.createCheckpoint();
      setCheckpoints(db.getCheckpoints());
      showToast("Checkpoint created successfully!", "success");
    } catch (err) {
      showToast("Failed to create checkpoint", "error");
    }
  };

  const restoreFromCheckpoint = async (index) => {
    if (!confirm("This will restore data from checkpoint. Current data will be replaced. Continue?")) {
      return;
    }
    try {
      const db = await getDatabase();
      await db.restoreFromCheckpoint(index);
      showToast("Data restored from checkpoint! Refreshing...", "success");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      showToast("Failed to restore from checkpoint: " + err.message, "error");
    }
  };

  // Restore from Backup State
  const restoreInputRef = useRef(null);
  const [restorePreview, setRestorePreview] = useState(null);
  const [restoreStatus, setRestoreStatus] = useState("idle");
  const [restoreError, setRestoreError] = useState(null);

  // Restore from Google Drive backup — REMOVED (Google Drive feature was removed)
  // Auto-restore connection / fetch history hooks were removed along with the UI.

  // Handle restore file selection
  const handleRestoreFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        
        // Validate backup structure
        const requiredKeys = ["customers", "items", "invoices"];
        const hasRequired = requiredKeys.every((k) => k in data);
        
        if (!hasRequired) {
          setRestoreError("Invalid backup file. Missing required data (customers, items, or invoices).");
          setRestoreStatus("error");
          return;
        }
        
        // Show preview
        setRestorePreview({
          date: data.date || data._meta?.exportedAt || "Unknown",
          version: data.version || data._meta?.version || "1.0",
          counts: {
            customers: (data.customers || []).length,
            items: (data.items || []).length,
            invoices: (data.invoices || []).length,
            users: (data.users || []).length,
            purchases: (data.purchases || []).length,
            companies: (data.companies || []).length,
            categories: (data.categories || []).length,
            activity: (data.activity || []).length,
          },
          data,
        });
        setRestoreStatus("preview");
        setRestoreError(null);
      } catch (err) {
        setRestoreError("Failed to parse backup file: " + err.message);
        setRestoreStatus("error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Confirm and execute restore
  const confirmRestore = async () => {
    if (!restorePreview?.data) return;
    
    setRestoreStatus("restoring");
    setRestoreError(null);
    
    try {
      const d = restorePreview.data;

      // CRITICAL: await every setter. Each one writes asynchronously to SQLite
      // (or IndexedDB fallback). Without await, the user can refresh before
      // writes finish and lose all restored data.
      if (d.customers) await setCustomers(d.customers);
      if (d.items) await setItems(d.items);
      if (d.invoices) await setInvoices(d.invoices);
      if (d.users) await setUsers(d.users);
      if (d.activity) await setActivity(d.activity);
      if (d.storeInfo) await setStoreInfo(d.storeInfo);
      if (d.companies) await setCompanies(d.companies);
      if (d.purchases) await setPurchases(d.purchases);
      if (d.purchaseItems) await setPurchaseItems(d.purchaseItems);

      // Merge categories from backup + extract from items to ensure all are visible in Manage Categories
      const backupCategories = d.categories || [];
      const itemCategories = (d.items || []).map(i => i.category).filter(Boolean);
      const purchaseItemCategories = (d.purchaseItems || []).map(i => i.category).filter(Boolean);
      const allCats = [...new Set([...backupCategories, ...itemCategories, ...purchaseItemCategories])].filter(Boolean);
      await setCategories(allCats);

      // Also merge purchase categories
      const backupPurCats = d.purchaseCategories || [];
      const purItemCats = (d.purchaseItems || []).map(i => i.category).filter(Boolean);
      const allPurCats = [...new Set([...backupPurCats, ...purItemCats])].filter(Boolean);
      await setPurchaseCategories(allPurCats);

      setRestoreStatus("success");
      setRestorePreview(null);

      // Reset after showing success message
      setTimeout(() => setRestoreStatus("idle"), 3000);
    } catch (err) {
      setRestoreError("Restore failed: " + err.message);
      setRestoreStatus("error");
    }
  };

  // Cancel restore
  const cancelRestore = () => {
    setRestorePreview(null);
    setRestoreStatus("idle");
    setRestoreError(null);
  };

  // Backup data object
  const backupData = useMemo(() => ({
    customers,
    items,
    invoices,
    users,
    activity,
    storeInfo,
    categories,
    companies,
    purchases,
    purchaseItems,
    purchaseCategories,
  }), [customers, items, invoices, users, activity, storeInfo, categories, companies, purchases, purchaseItems, purchaseCategories]);

  // ── Google Drive backup feature was removed ────────────────────────────────
  // (connectGDrive / disconnectGDrive / performBackup / manualBackup /
  //  toggleAutoBackup and the auto-backup-on-change effect are gone.)

  // Download local JSON backup
  const downloadLocalBackup = () => {
    const backup = {
      version: "1.0",
      date: new Date().toISOString(),
      ...backupData,
    };
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uzhavan_backup_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBgUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBgError("");
    const validTypes = ["image/jpeg", "image/png"];
    if (!validTypes.includes(file.type)) { setBgError("Only JPG and PNG images are allowed."); e.target.value = ""; return; }
    if (file.size > 1 * 1024 * 1024) { setBgError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 1MB.`); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      // Store full-quality image in its own localStorage key (not in storeInfo/Firestore)
      try { localStorage.setItem("bgImage_store", dataUrl); } catch { setBgError("Image too large for browser storage."); return; }
      setForm((p) => ({ ...p, bgImage: dataUrl }));
    };
    reader.readAsDataURL(file);
  };
  const ff = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const save = () => {
    setStoreInfo({ ...form, bgImage: "" }); // bgImage never goes to Firestore
    if (setBgImageLocal) setBgImageLocal(form.bgImage || ""); // update parent for live CSS
    setSaved(true); 
    showToast("Store settings saved successfully", "success");
    setTimeout(() => setSaved(false), 2500);
  };

  const roleAccess = form.roleAccess || { salesperson: { dashboard: true, customers: true, items: true, invoices: true, users: false, settings: false } };
  const spAccess = roleAccess.salesperson || {};
  const toggleAccess = (pageId) => {
    const updated = { ...spAccess, [pageId]: !spAccess[pageId] };
    setForm((p) => ({ ...p, roleAccess: { ...roleAccess, salesperson: updated } }));
  };

  const accessPages = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "customers", label: "Customers", icon: "👥" },
    { id: "items", label: "Items", icon: "📦" },
    { id: "invoices", label: "Invoices", icon: "🧾" },
    { id: "users", label: "Users", icon: "👤" },
    { id: "settings", label: "Store Settings", icon: "🏪" },
  ];

  return (
    <div className="space-y-5">
      {/* ✅ Sticky Header with Save Button */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 bg-gradient-to-r from-emerald-900/95 to-emerald-800/95 backdrop-blur-sm border-b border-emerald-700/30 flex items-center justify-between">
        <h1 className="text-2xl font-bold page-title">Store Settings</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-emerald-400 text-sm font-semibold bg-emerald-900/40 px-3 py-1.5 rounded-xl border border-emerald-600/30">✓ Saved!</span>}
          <Btn onClick={save}>💾 Save Settings</Btn>
        </div>
      </div>
      
      {/* Two-column grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* Left Column */}
        <div className="space-y-5">
          {/* Store Info */}
          <div className="card p-5 space-y-4">
            <h2 className="font-bold t-primary mb-1">🏪 Store Information</h2>
            <Input label="Store Name" value={form.name} onChange={ff("name")} />
            <Input label="Address" value={form.address} onChange={ff("address")} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Phone" value={form.phone} onChange={ff("phone")} />
              <Input label="Email" value={form.email} onChange={ff("email")} />
            </div>
            {/* ✅ GST & License Numbers */}
            <Input label="GST Number" value={form.gstNo || ""} onChange={ff("gstNo")} placeholder="e.g., 33AAAAA0000A1Z5" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Pesticides License No." value={form.pesticidesLicense || ""} onChange={ff("pesticidesLicense")} placeholder="Pesticides license number" />
              <Input label="Fertilizers License No." value={form.fertilizersLicense || ""} onChange={ff("fertilizersLicense")} placeholder="Fertilizers license number" />
            </div>
          </div>

          {/* ✅ Theme Selector */}
          <div className="card p-5">
            <h2 className="font-bold t-primary mb-1">🎨 Theme</h2>
            <p className="text-xs t-muted mb-4">Choose a color theme. Font colors auto-adapt to each theme.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(THEMES).map(([key, th]) => (
                <button key={key} onClick={() => { setForm((p) => ({ ...p, theme: key })); }}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl border transition-all ${form.theme === key ? "border-2 shadow-lg" : "border opacity-80 hover:opacity-100 hover:scale-[1.02]"}`}
                  style={{ 
                    background: th.cardBg, 
                    borderColor: form.theme === key ? th.accentFrom : th.cardBorder,
                    boxShadow: form.theme === key ? `0 0 0 3px ${th.focusRing}` : "none"
                  }}>
                  <div className="w-8 h-8 rounded-lg flex-shrink-0 shadow-md" style={{ background: `linear-gradient(135deg,${th.btnFrom},${th.btnTo})` }}></div>
                  <span className="text-xs font-semibold truncate" style={{ color: th.textPrimary }}>{th.name}</span>
                  {form.theme === key && <span className="ml-auto text-sm" style={{ color: th.accentFrom }}>✓</span>}
                </button>
              ))}
            </div>
            <p className="text-xs t-muted mt-4">Click <strong>Save Settings</strong> above to apply theme.</p>
          </div>

          {/* ✅ Background Image */}
          <div className="card p-5">
            <h2 className="font-bold t-primary mb-1">🖼 Background Image</h2>
            <p className="text-xs t-muted mb-4">Upload a custom background image or remove it to use a solid color.</p>
            <div className="flex items-center gap-4">
              {form.bgImage ? (
                <img src={form.bgImage} alt="bg" className="w-24 h-16 rounded-xl object-cover border t-border" />
              ) : (
                <div className="w-24 h-16 rounded-xl flex items-center justify-center text-2xl border border-dashed t-border t-muted">🖼</div>
              )}
              <div className="space-y-2">
                <input ref={bgRef} type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={handleBgUpload} />
                <Btn size="sm" variant="outline" onClick={() => bgRef.current?.click()} disabled={bgUploading}>{bgUploading ? "Uploading…" : "Upload Image"}</Btn>
                <p className="text-xs text-emerald-500/50 mt-1">JPG/PNG only · Max 1MB</p>
                {form.bgImage && <button onClick={() => { localStorage.removeItem("bgImage_store"); setForm((p) => ({ ...p, bgImage: "" })); if (setBgImageLocal) setBgImageLocal(""); }} className="block text-xs text-red-400 hover:text-red-300 font-medium">Remove Image</button>}
              </div>
            </div>
            {bgError && <p className="text-xs text-red-400 bg-red-900/20 px-3 py-2 rounded-xl border border-red-800/30 mt-2">⚠️ {bgError}</p>}
            <p className="text-xs t-muted mt-3">Click <strong>Save Settings</strong> above to apply.</p>
          </div>

          {/* ✅ Full Reports Section */}
          <div className="card p-5">
            <h2 className="font-bold text-emerald-200 mb-1">📊 Full Reports</h2>
            <p className="text-xs text-emerald-500/50 mb-4">
              Export complete data reports in CSV format for accounting, analysis, or record keeping.
            </p>

            <div className="space-y-3">
              {/* Customers Report */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-700/30 bg-emerald-900/20">
                <div className="flex items-center gap-3">
                  <span className="text-lg">👥</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-200">Customers Report</p>
                    <p className="text-xs text-emerald-500/50">{customers.length} customers</p>
                  </div>
                </div>
                <Btn size="sm" variant="outline" onClick={() => {
                  const headers = ["Name", "Phone", "Address", "GST No", "Total Purchased", "Total Paid", "Due Amount", "Created Date"];
                  const rows = customers.map(c => {
                    const custInvs = invoices.filter(i => i.customerId === c.id);
                    const totalPurchased = custInvs.reduce((s, i) => s + (i.total || 0), 0);
                    const totalPaid = custInvs.reduce((s, i) => s + (i.paidAmount || 0), 0);
                    return [c.name || "", c.phone || "", c.address || "", c.gstNo || "", totalPurchased.toFixed(2), totalPaid.toFixed(2), (totalPurchased - totalPaid).toFixed(2), c.createdAt || ""];
                  });
                  exportCSV(`customers_report_${today()}.csv`, headers, rows);
                }}>
                  📥 Export CSV
                </Btn>
              </div>

              {/* Items Report */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-700/30 bg-emerald-900/20">
                <div className="flex items-center gap-3">
                  <span className="text-lg">📦</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-200">Items / Inventory Report</p>
                    <p className="text-xs text-emerald-500/50">{items.length} items</p>
                  </div>
                </div>
                <Btn size="sm" variant="outline" onClick={() => {
                  const headers = ["Name", "Category", "Company", "HSN", "Unit", "Stock", "Buy Price", "Sell Price", "Expiry Date", "Inventory Value"];
                  const rows = items.map(it => [it.name || "", it.category || "", it.company || "", it.hsn || "", it.unit || "", it.stock ?? 0, it.buyPrice ?? 0, it.price ?? 0, it.expiryDate || "", ((it.stock || 0) * (it.buyPrice || 0)).toFixed(2)]);
                  exportCSV(`items_report_${today()}.csv`, headers, rows);
                }}>
                  📥 Export CSV
                </Btn>
              </div>

              {/* Invoices Report */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-700/30 bg-emerald-900/20">
                <div className="flex items-center gap-3">
                  <span className="text-lg">🧾</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-200">Invoices / Sales Report</p>
                    <p className="text-xs text-emerald-500/50">{invoices.length} invoices</p>
                  </div>
                </div>
                <Btn size="sm" variant="outline" onClick={() => {
                  const headers = ["Invoice No", "Date", "Customer", "Items", "Subtotal", "Discount", "Tax", "Total", "Paid Amount", "Due Amount", "Status"];
                  const rows = invoices.map(inv => {
                    const cust = customers.find(c => c.id === inv.customerId);
                    const itemCount = (inv.items || []).length;
                    const due = (inv.total || 0) - (inv.paidAmount || 0);
                    const status = due <= 0 ? "Paid" : "Pending";
                    return [inv.invoiceNo || "", inv.date || "", cust?.name || "", itemCount, (inv.subtotal || 0).toFixed(2), (inv.discount || 0).toFixed(2), (inv.tax || 0).toFixed(2), (inv.total || 0).toFixed(2), (inv.paidAmount || 0).toFixed(2), due.toFixed(2), status];
                  });
                  exportCSV(`invoices_report_${today()}.csv`, headers, rows);
                }}>
                  📥 Export CSV
                </Btn>
              </div>

              {/* Purchases Report */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-700/30 bg-emerald-900/20">
                <div className="flex items-center gap-3">
                  <span className="text-lg">🛒</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-200">Purchases Report</p>
                    <p className="text-xs text-emerald-500/50">{purchases.length} purchases</p>
                  </div>
                </div>
                <Btn size="sm" variant="outline" onClick={() => {
                  const headers = ["Purchase No", "Date", "Vendor", "Category", "Items", "Total", "Notes"];
                  const rows = purchases.map(p => {
                    const pItems = purchaseItems.filter(pi => pi.purchaseId === p.id);
                    return [p.purchaseNo || "", p.date || "", p.vendor || "", p.category || "", pItems.length, (p.total || 0).toFixed(2), p.notes || ""];
                  });
                  exportCSV(`purchases_report_${today()}.csv`, headers, rows);
                }}>
                  📥 Export CSV
                </Btn>
              </div>

              {/* Sales Summary Report */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-700/30 bg-emerald-900/20">
                <div className="flex items-center gap-3">
                  <span className="text-lg">💰</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-200">Sales Summary Report</p>
                    <p className="text-xs text-emerald-500/50">Revenue, costs & profits by item</p>
                  </div>
                </div>
                <Btn size="sm" variant="outline" onClick={() => {
                  const itemStats = {};
                  invoices.forEach(inv => {
                    (inv.items || []).forEach(it => {
                      const key = it.itemId || it.name;
                      if (!itemStats[key]) itemStats[key] = { name: it.name, qtySold: 0, revenue: 0, cost: 0 };
                      itemStats[key].qtySold += it.qty || 0;
                      itemStats[key].revenue += (it.qty || 0) * (it.price || 0);
                      itemStats[key].cost += (it.qty || 0) * (it.buyPrice || 0);
                    });
                  });
                  const headers = ["Item Name", "Qty Sold", "Revenue", "Cost", "Profit", "Margin %"];
                  const rows = Object.values(itemStats).map(s => {
                    const profit = s.revenue - s.cost;
                    const margin = s.revenue > 0 ? ((profit / s.revenue) * 100).toFixed(1) : "0";
                    return [s.name, s.qtySold, s.revenue.toFixed(2), s.cost.toFixed(2), profit.toFixed(2), margin + "%"];
                  });
                  exportCSV(`sales_summary_${today()}.csv`, headers, rows);
                }}>
                  📥 Export CSV
                </Btn>
              </div>

              {/* Payment History Report */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-700/30 bg-emerald-900/20">
                <div className="flex items-center gap-3">
                  <span className="text-lg">💳</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-200">Payment History Report</p>
                    <p className="text-xs text-emerald-500/50">All recorded payments</p>
                  </div>
                </div>
                <Btn size="sm" variant="outline" onClick={() => {
                  const headers = ["Date", "Invoice No", "Customer", "Amount", "Payment Method", "Notes"];
                  const rows = [];
                  invoices.forEach(inv => {
                    const cust = customers.find(c => c.id === inv.customerId);
                    (inv.payments || []).forEach(p => {
                      rows.push([p.date || "", inv.invoiceNo || "", cust?.name || "", (p.amount || 0).toFixed(2), p.method || "Cash", p.notes || ""]);
                    });
                  });
                  rows.sort((a, b) => new Date(b[0]) - new Date(a[0]));
                  exportCSV(`payment_history_${today()}.csv`, headers, rows);
                }}>
                  📥 Export CSV
                </Btn>
              </div>

              {/* Full Data Export */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-amber-700/30 bg-amber-900/10 mt-4">
                <div className="flex items-center gap-3">
                  <span className="text-lg">📁</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-300">Complete Data Export (JSON)</p>
                    <p className="text-xs text-amber-500/50">All data for backup or migration</p>
                  </div>
                </div>
                <Btn size="sm" onClick={downloadLocalBackup}>
                  📥 Export JSON
                </Btn>
              </div>
            </div>

            <p className="text-xs text-emerald-500/50 mt-4">
              💡 CSV files can be opened in Excel, Google Sheets, or any spreadsheet application.
            </p>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-5">
          {/* App Updates */}
          <UpdateSettings />

          {/* Data Storage Info */}
          <div className="card p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h2 className="font-bold text-emerald-200 mb-1">💾 Data Storage & Cloud Sync</h2>
                <p className="text-xs text-emerald-500/50">
                  Data is stored locally and (optionally) synced to your own Firebase Firestore for cross-device access.
                </p>
              </div>
              <Btn size="sm" variant="outline" onClick={() => setShowFirebaseSetup(true)}>
                ⚙️ Setup Firebase
              </Btn>
            </div>
          </div>

          {showFirebaseSetup && (
            <Modal title="🔥 Firebase Cloud Sync" onClose={() => setShowFirebaseSetup(false)} size="lg">
              <FirebaseSyncSettings onClose={() => setShowFirebaseSetup(false)} />
            </Modal>
          )}


          {/* ✅ Local Backup Section - Always available */}
          <LocalBackupSection 
            customers={customers}
            items={items}
            invoices={invoices}
            users={users}
            activity={activity}
            categories={categories}
            companies={companies}
            purchases={purchases}
            purchaseItems={purchaseItems}
            purchaseCategories={purchaseCategories}
            storeInfo={storeInfo}
            setCustomers={setCustomers}
            setItems={setItems}
            setInvoices={setInvoices}
            setUsers={setUsers}
            setActivity={setActivity}
            setCategories={setCategories}
            setCompanies={setCompanies}
            setPurchases={setPurchases}
            setPurchaseItems={setPurchaseItems}
            setPurchaseCategories={setPurchaseCategories}
            setStoreInfo={setStoreInfo}
          />

          {/* ✅ SQLite Database Maintenance (Electron only — fully active on Windows) */}
          {window.electronAPI && (
            <div className="card p-5">
              <h2 className="font-bold text-emerald-300 mb-1">🗄️ SQLite Database</h2>
              <p className="text-xs text-emerald-500/60 mb-4">
                Manual <code>.db</code> file backup, restore, and optimisation.
              </p>

              {!window.electronAPI.useSQLite && (
                <div className="mb-3 p-3 rounded-xl bg-amber-900/20 border border-amber-700/30">
                  <p className="text-xs text-amber-300">
                    ℹ️ SQLite is only active on the Windows build. This panel is read-only here on macOS dev.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {/* Save .db backup */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-emerald-700/30 bg-emerald-900/20">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-200">💾 Save Database Backup</p>
                    <p className="text-xs text-emerald-500/60">Pick a folder and save the full <code>.db</code> file.</p>
                  </div>
                  <Btn size="sm" onClick={createSQLiteBackup} disabled={!window.electronAPI.useSQLite}>Save backup</Btn>
                </div>

                {/* Restore .db backup */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-700/30 bg-amber-900/10">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-200">♻️ Restore Database</p>
                    <p className="text-xs text-amber-300/70">Load a <code>.db</code> file. Replaces ALL current data.</p>
                  </div>
                  <Btn size="sm" variant="outline" onClick={restoreSQLiteBackup} disabled={!window.electronAPI.useSQLite}>Restore</Btn>
                </div>

                {/* Vacuum */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-emerald-700/30 bg-emerald-900/20">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-200">⚡ Optimise Database</p>
                    <p className="text-xs text-emerald-500/60">Reclaim unused space and rebuild indexes (VACUUM).</p>
                  </div>
                  <Btn size="sm" variant="outline" onClick={vacuumDatabase} disabled={isVacuuming || !window.electronAPI.useSQLite}>
                    {isVacuuming ? 'Optimising…' : 'Optimise'}
                  </Btn>
                </div>
              </div>

              <p className="text-xs text-emerald-500/50 mt-3">
                💡 The app also runs <strong>automatic</strong> backups (see card below). Use this for one-off backups to a USB / Dropbox / shared drive.
              </p>
            </div>
          )}

          {/* ✅ Auto-Backup Section (Windows / Electron only) */}
          <AutoBackupSection />

          {/* ✅ Restore Section */}
          <div className="card p-5">
            <h2 className="font-bold text-emerald-300 mb-1">🔄 Restore from Backup</h2>
            <p className="text-xs text-emerald-500/50 mb-3">
              Restore your data from a previously downloaded JSON backup file.
            </p>
            
            <input
              ref={restoreInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleRestoreFile}
            />
            
            {restoreStatus === "idle" && (
              <Btn
                variant="outline"
                onClick={() => restoreInputRef.current?.click()}
              >
                📂 Select Backup File
              </Btn>
            )}

            {restoreStatus === "error" && restoreError && (
              <div className="p-3 rounded-xl bg-red-900/20 border border-red-700/30 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-red-400">⚠️</span>
                  <span className="text-sm text-red-400 font-semibold">{restoreError}</span>
                </div>
                <Btn variant="outline" size="sm" onClick={() => { setRestoreStatus("idle"); setRestoreError(null); }} className="mt-2">
                  Try Again
                </Btn>
              </div>
            )}

            {restoreStatus === "preview" && restorePreview && (
              <div className="p-4 rounded-xl border border-amber-700/30 bg-amber-900/10">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-amber-400 text-lg">⚠️</span>
                  <span className="text-sm font-bold text-amber-400">Review Backup Before Restoring</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                  <div className="p-2 rounded-lg bg-emerald-900/20">
                    <span className="text-emerald-500/60">Backup Date:</span>
                    <p className="font-semibold text-emerald-300">{new Date(restorePreview.date).toLocaleString()}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-900/20">
                    <span className="text-emerald-500/60">Version:</span>
                    <p className="font-semibold text-emerald-300">{restorePreview.version}</p>
                  </div>
                </div>
                
                <p className="text-xs text-emerald-400/70 font-semibold mb-2">Data to Restore:</p>
                <div className="grid grid-cols-4 gap-1.5 mb-4">
                  {Object.entries(restorePreview.counts).map(([key, count]) => (
                    <div key={key} className="text-center p-1.5 rounded-lg bg-emerald-900/30 border border-emerald-700/20">
                      <p className="text-sm font-bold text-emerald-300">{count}</p>
                      <p className="text-[10px] text-emerald-500/50 capitalize">{key}</p>
                    </div>
                  ))}
                </div>
                
                <div className="p-3 rounded-lg bg-red-900/20 border border-red-800/30 mb-3">
                  <p className="text-xs text-red-400 font-semibold">⚠️ Warning: This will REPLACE all your current data!</p>
                  <p className="text-xs text-red-400/70 mt-1">Make sure to download a backup of your current data first.</p>
                </div>
                
                <div className="flex gap-2">
                  <Btn variant="danger" onClick={confirmRestore}>
                    🔄 Yes, Restore Data
                  </Btn>
                  <Btn variant="secondary" onClick={cancelRestore}>
                    Cancel
                  </Btn>
                </div>
              </div>
            )}

            {restoreStatus === "restoring" && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-900/20 border border-blue-700/30">
                <div className="animate-spin text-blue-400">⏳</div>
                <span className="text-sm text-blue-400 font-semibold">Restoring data to Firestore...</span>
              </div>
            )}

            {restoreStatus === "success" && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
                <span className="text-emerald-400">✓</span>
                <span className="text-sm text-emerald-400 font-semibold">Data restored successfully!</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Backup Section (Electron / Windows only)
// Reads from window.electronAPI.autoBackup. Hidden on web/macOS dev.
// ─────────────────────────────────────────────────────────────────────────────
function AutoBackupSection() {
  const showToast = useToast();
  const api = typeof window !== 'undefined' ? window.electronAPI?.autoBackup : null;
  const [backups, setBackups] = useState([]);
  const [folder, setFolder] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!api) return;
    setLoading(true);
    try {
      const res = await api.list();
      if (res?.success) {
        setBackups(res.backups || []);
        setFolder(res.folder || '');
      }
    } catch (e) {
      console.warn('auto-backup list failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (api) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!api) return null; // hide on browser/macOS dev

  const handleBackupNow = async () => {
    setBusy(true);
    try {
      const res = await api.runNow();
      if (res?.success) {
        showToast('✅ Backup created');
        await refresh();
      } else {
        showToast(`❌ Backup failed: ${res?.error || 'unknown error'}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleOpenFolder = async () => {
    try { await api.openFolder(); } catch (_) {}
  };

  const handleRestore = async (b) => {
    const ok = window.confirm(
      `Restore from "${b.name}"?\n\nYour current data will be REPLACED. The app will close after restore — please reopen it.\n\nContinue?`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.restore(b.path);
      if (res?.success) {
        showToast('✅ Restored. Closing app — please reopen.');
        setTimeout(() => { try { window.close(); } catch (_) {} }, 1500);
      } else {
        showToast(`❌ Restore failed: ${res?.error || 'unknown error'}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const fmtSize = (n) => {
    if (!n) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };

  const fmtDate = (ms) => {
    if (!ms) return '—';
    const d = new Date(ms);
    return d.toLocaleString();
  };

  const last = backups[0];

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
        <div>
          <h2 className="font-bold text-emerald-300 mb-1">🛡️ Automatic Local Backups</h2>
          <p className="text-xs text-emerald-500/60">
            Runs on app start, nightly at 02:00, and on app close. Last 14 backups are kept.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn size="sm" variant="outline" onClick={handleOpenFolder}>📂 Open folder</Btn>
          <Btn size="sm" onClick={handleBackupNow} disabled={busy}>
            {busy ? '…' : '💾 Backup now'}
          </Btn>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="rounded-xl bg-emerald-900/10 border border-emerald-800/20 p-3">
          <div className="text-[10px] uppercase tracking-wide text-emerald-500/60">Last backup</div>
          <div className="text-sm font-semibold text-emerald-200 mt-1">
            {last ? fmtDate(last.createdAt) : 'No backup yet'}
          </div>
        </div>
        <div className="rounded-xl bg-emerald-900/10 border border-emerald-800/20 p-3">
          <div className="text-[10px] uppercase tracking-wide text-emerald-500/60">Stored backups</div>
          <div className="text-sm font-semibold text-emerald-200 mt-1">{backups.length} / 14</div>
        </div>
        <div className="rounded-xl bg-emerald-900/10 border border-emerald-800/20 p-3">
          <div className="text-[10px] uppercase tracking-wide text-emerald-500/60">Total size</div>
          <div className="text-sm font-semibold text-emerald-200 mt-1">
            {fmtSize(backups.reduce((a, b) => a + (b.size || 0), 0))}
          </div>
        </div>
      </div>

      {folder && (
        <div className="text-[11px] text-emerald-500/50 mb-2 break-all">
          📁 {folder}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-emerald-500/60 py-3">Loading…</div>
      ) : backups.length === 0 ? (
        <div className="text-xs text-emerald-500/60 py-3">
          No backups yet. One will be created automatically shortly after startup.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-emerald-800/20">
          <table className="w-full text-xs">
            <thead className="bg-emerald-900/20">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold text-emerald-300">Created</th>
                <th className="px-3 py-2 font-semibold text-emerald-300">Filename</th>
                <th className="px-3 py-2 font-semibold text-emerald-300">Size</th>
                <th className="px-3 py-2 font-semibold text-emerald-300 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.path} className="border-t border-emerald-800/15">
                  <td className="px-3 py-2 text-emerald-200">{fmtDate(b.createdAt)}</td>
                  <td className="px-3 py-2 text-emerald-400/80 font-mono text-[10.5px]">{b.name}</td>
                  <td className="px-3 py-2 text-emerald-300/80">{fmtSize(b.size)}</td>
                  <td className="px-3 py-2 text-right">
                    <Btn size="xs" variant="outline" onClick={() => handleRestore(b)} disabled={busy}>
                      Restore
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 p-3 rounded-xl bg-amber-900/10 border border-amber-800/20">
        <p className="text-[11px] text-amber-300/70">
          ⚠️ Restoring will replace your current data and close the app. Reopen the app to continue.
        </p>
      </div>
    </div>
  );
}

export default StoreSettingsPage;
