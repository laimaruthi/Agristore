/**
 * Login Page - Local authentication (100% Offline)
 */
import { useState } from "react";
import { Input, Btn } from "../components/UIComponents";
import Alert from "../components/Alert";
import { loginLocal, createDefaultAdmin } from "../services/localAuth";
import riceIcon from "../assets/sheaf-of-rice.png";

const DEFAULT_STORE_NAME = "Agri Store";

export default function LoginPage({ onLogin, users, storeName }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!email.trim() || !password.trim()) { 
      setError("Please enter your email and password."); 
      return; 
    }
    setLoading(true); 
    setError("");
    try {
      await createDefaultAdmin();
      const user = await loginLocal(email.trim(), password);
      // Mark that someone has successfully logged in at least once,
      // so the "First time? Default admin" hint is hidden on future visits.
      try { localStorage.setItem('agristore_has_logged_in', '1'); } catch { /* ignore */ }
      onLogin(user);
    } catch (err) {
      setError(err.message || "Login failed.");
    } finally { 
      setLoading(false); 
    }
  };

  const displayName = storeName || DEFAULT_STORE_NAME;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 app-bg">
      <div className="card w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg bg-emerald-500/10 ring-1 ring-emerald-400/20 p-2"><img src={riceIcon} alt="AgriStore" className="w-full h-full object-contain" /></div>
          <h1 className="text-2xl font-bold page-title">{displayName}</h1>
          <p className="text-emerald-400/60 text-sm mt-1">Inventory Management</p>
        </div>
        <div className="space-y-4">
          <Input label="Email" type="email" placeholder="Enter email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="relative">
            <Input label="Password" type={showPassword ? "text" : "password"} placeholder="Enter password" value={password}
              onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !loading && handle()} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} 
              className="absolute right-3 top-[28px] text-emerald-500/50 hover:text-emerald-300">
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <Btn onClick={handle} className="w-full" size="lg" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </Btn>
          {/* Show default-admin hint only until the first successful login.
              Once a user has logged in even once, this never shows again. */}
          {typeof localStorage !== 'undefined' && !localStorage.getItem('agristore_has_logged_in') && (
            <div className="text-center mt-4 p-3 rounded-xl bg-emerald-900/20 border border-emerald-700/30">
              <p className="text-xs text-emerald-500/70"><strong>First time?</strong> Default admin:</p>
              <p className="text-xs text-emerald-400 mt-1 font-mono">admin@agristore.local / admin123</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
