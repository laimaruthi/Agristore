/**
 * Sidebar - Navigation component with role-based access
 * Manager: Full access to all features
 * Staff: Limited access (Dashboard, Customers, Items, Invoices)
 */
import { Badge } from "../components/UIComponents";
import { Icon } from "../components/Icon";

// Check if user is manager (full access)
const isManager = (user) => {
  return user?.role === "manager" || user?.role === "admin";
};

export default function Sidebar({ page, setPage, user, onLogout, storeInfo, mobileOpen, setMobileOpen }) {
  const features = storeInfo?.features || {};
  const allLinks = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard", staffAccess: true },
    { id: "customers", label: "Customers", icon: "users", staffAccess: true },
    { id: "items", label: "Items", icon: "package", staffAccess: true },
    { id: "invoices", label: "Invoices", icon: "invoice", staffAccess: true },
    { id: "purchases", label: "Purchase History", icon: "cart", staffAccess: false },
    { id: "otherExpenses", label: "Other Expenses", icon: "wallet", staffAccess: false },
    { id: "reports", label: "Reports", icon: "reports", staffAccess: false, flag: "reports_advanced" },
    { id: "users", label: "Users", icon: "user", staffAccess: false },
    { id: "settings", label: "Store Settings", icon: "settings", staffAccess: false },
  ].filter((l) => l.flag ? features[l.flag] !== false : true);

  // Filter links based on user role
  const links = isManager(user)
    ? allLinks
    : allLinks.filter(link => link.staffAccess);

  const navClick = (id) => { setPage(id); if (setMobileOpen) setMobileOpen(false); };

  // Get role display
  const userRole = isManager(user) ? "Manager" : "Staff";
  const roleBadgeColor = isManager(user) ? "purple" : "green";

  return (
    <>
    {mobileOpen && <div className="mobile-sidebar-overlay fixed inset-0 bg-black/60 z-20" onClick={() => setMobileOpen(false)} aria-hidden="true"></div>}
    <aside
      className={`w-56 sidebar-bg flex flex-col h-screen fixed left-0 top-0 shadow-lg z-30 sidebar-desktop ${mobileOpen ? "mobile-open" : ""}`}
      aria-label="Main navigation"
    >
      <nav className="flex-1 p-3 pt-5 space-y-0.5" aria-label="Pages">
        {links.map((l) => {
          const active = page === l.id;
          return (
            <button
              key={l.id}
              onClick={() => navClick(l.id)}
              aria-current={active ? "page" : undefined}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-3 transition-all ${active ? "nav-active" : "nav-inactive"}`}
            >
              <Icon name={l.icon} size={18} />
              <span>{l.label}</span>
              {active && <span className="ml-auto w-1.5 h-4 rounded-full" style={{ background: "linear-gradient(180deg,#34d399,#059669)" }}></span>}
            </button>
          );
        })}
      </nav>
      <div className="p-4 border-t t-border">
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${isManager(user) ? "" : "t-btn-grad"}`}
            style={isManager(user) ? { background: "linear-gradient(135deg,#7c3aed,#5b21b6)" } : undefined}
            aria-hidden="true"
          >
            {user?.name?.[0] || user?.email?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="text-xs font-medium t-primary truncate">{user?.name || user?.email || "User"}</div>
        </div>
        <div className="flex items-center justify-between">
          <Badge color={roleBadgeColor}>{userRole}</Badge>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1 text-xs t-muted hover:text-red-500 font-medium"
            aria-label="Logout"
          >
            <Icon name="logout" size={14} />
            Logout
          </button>
        </div>
      </div>
    </aside>
    </>
  );
}
