/**
 * License Activation Page
 * Shows when app is not activated with a valid license key
 */
import { useState, useEffect } from 'react';
import Alert from '../components/Alert';
import riceIcon from '../assets/sheaf-of-rice.png';
import { version as APP_VERSION } from '../../package.json';

export default function LicenseActivationPage({ onActivated }) {
  const [licenseKey, setLicenseKey] = useState('');
  const [storeName, setStoreName] = useState('');
  const [machineId, setMachineId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Get machine ID on mount
    if (window.electronAPI?.license?.getMachineId) {
      window.electronAPI.license.getMachineId().then(id => {
        setMachineId(id);
      });
    }
  }, []);

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      setError('Please paste your license key');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await window.electronAPI.license.activate(licenseKey.trim(), storeName.trim());
      
      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onActivated && onActivated(result.licenseInfo);
        }, 1500);
      } else {
        setError(result.error || 'Activation failed');
      }
    } catch (err) {
      setError('Activation failed: ' + err.message);
    }

    setLoading(false);
  };

  const handleKeyChange = (e) => {
    // License keys are signed tokens (AGRI2.<payload>.<signature>) — a single
    // long line. Store the raw value verbatim; do not reformat or truncate it.
    setLicenseKey(e.target.value);
  };

  const copyMachineId = () => {
    navigator.clipboard.writeText(machineId);
    alert('Machine ID copied! Send this to support to get your license key.');
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900">
        <div className="text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-emerald-200">License Activated!</h1>
          <p className="text-emerald-400 mt-2">Loading AgriStore...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 mx-auto mb-4 rounded-2xl bg-white/95 p-3 shadow-lg flex items-center justify-center">
            <img src={riceIcon} alt="AgriStore" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-emerald-200">AgriStore</h1>
          <p className="text-emerald-500/70 mt-2">Agricultural Store Management</p>
        </div>

        {/* Activation Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-emerald-700/30 p-6 shadow-2xl">
          <h2 className="text-xl font-bold text-emerald-200 mb-1">🔐 License Activation</h2>
          <p className="text-sm text-emerald-500/70 mb-6">Enter your license key to activate AgriStore</p>

          {/* Machine ID */}
          <div className="mb-4 p-3 rounded-xl bg-slate-900/50 border border-slate-700">
            <label className="block text-xs font-medium text-emerald-500/70 mb-1">
              Your Machine ID (send this to get license key)
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-amber-300 select-all">
                {machineId || 'Loading...'}
              </code>
              <button 
                onClick={copyMachineId}
                className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
              >
                📋 Copy
              </button>
            </div>
          </div>

          {/* Store Name Input (optional — the verified name comes from the key) */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-emerald-300 mb-2">
              Store Name <span className="text-emerald-500/50 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder="Enter your store name"
              className="w-full px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-600 text-emerald-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* License Key Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-emerald-300 mb-2">
              License Key
            </label>
            <textarea
              value={licenseKey}
              onChange={handleKeyChange}
              rows={4}
              spellCheck={false}
              placeholder="Paste your license key here (starts with AGRI2.)"
              className="w-full px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-600 text-emerald-100 font-mono text-xs placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 break-all resize-y"
            />
          </div>

          {/* Error Message */}
          {error && (
            <Alert variant="error" className="mb-4">
              {error}
            </Alert>
          )}

          {/* Activate Button */}
          <button
            onClick={handleActivate}
            disabled={loading}
            className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span> Activating...
              </span>
            ) : (
              '🔓 Activate License'
            )}
          </button>

          {/* Help Text */}
          <div className="mt-6 pt-4 border-t border-slate-700">
            <p className="text-xs text-emerald-500/50 text-center">
              Don't have a license key? Contact support with your Machine ID above.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-emerald-600/50 mt-6">
          AgriStore v{APP_VERSION} • Licensed Software
        </p>
      </div>
    </div>
  );
}
