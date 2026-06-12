/**
 * License/Activation Code Service
 * Validates product keys for Windows desktop application
 */

// License storage key
const LICENSE_KEY = 'agristore_license';
const LICENSE_ACTIVATED_KEY = 'agristore_license_activated';

// Valid license codes (in production, these would be validated against a server)
// Format: XXXX-XXXX-XXXX-XXXX
const VALID_CODES = [
  'UZHA-2024-FREE-DEMO',  // Demo license
  'UZHA-AGRI-PRO1-2024',  // Pro license 1
  'UZHA-AGRI-PRO2-2024',  // Pro license 2
  'UZHA-AGRI-ENT1-2024',  // Enterprise license
  'FARM-SHOP-2024-FULL',  // Full license
  'AGRI-STORE-UNLOCKED',  // Unlimited license
];

// Generate a machine-specific ID (for license binding)
export function getMachineId() {
  let machineId = localStorage.getItem('agristore_machine_id');
  if (!machineId) {
    // Generate a pseudo-unique machine ID
    machineId = 'M-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('agristore_machine_id', machineId);
  }
  return machineId;
}

/**
 * Check if app is activated
 */
export function isActivated() {
  const activated = localStorage.getItem(LICENSE_ACTIVATED_KEY);
  return activated === 'true';
}

/**
 * Get stored license info
 */
export function getLicenseInfo() {
  try {
    const stored = localStorage.getItem(LICENSE_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Validate and activate license code
 */
export function activateLicense(code) {
  if (!code || typeof code !== 'string') {
    return { success: false, error: 'Please enter a license code' };
  }

  // Normalize code (uppercase, trim)
  const normalizedCode = code.toUpperCase().trim();

  // Validate format (XXXX-XXXX-XXXX-XXXX)
  const codePattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (!codePattern.test(normalizedCode)) {
    return { success: false, error: 'Invalid code format. Use: XXXX-XXXX-XXXX-XXXX' };
  }

  // Check if code is valid
  if (!VALID_CODES.includes(normalizedCode)) {
    return { success: false, error: 'Invalid license code. Please check and try again.' };
  }

  // Determine license type
  let licenseType = 'standard';
  let expiresAt = null;

  if (normalizedCode.includes('DEMO')) {
    licenseType = 'demo';
    expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
  } else if (normalizedCode.includes('PRO')) {
    licenseType = 'pro';
    expiresAt = Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 year
  } else if (normalizedCode.includes('ENT') || normalizedCode.includes('UNLOCKED')) {
    licenseType = 'enterprise';
    expiresAt = null; // Never expires
  } else {
    licenseType = 'full';
    expiresAt = Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 year
  }

  // Save license info
  const licenseInfo = {
    code: normalizedCode,
    type: licenseType,
    activatedAt: Date.now(),
    expiresAt: expiresAt,
    machineId: getMachineId(),
  };

  localStorage.setItem(LICENSE_KEY, JSON.stringify(licenseInfo));
  localStorage.setItem(LICENSE_ACTIVATED_KEY, 'true');

  return { 
    success: true, 
    message: `License activated successfully! Type: ${licenseType.toUpperCase()}`,
    licenseInfo 
  };
}

/**
 * Check if license is expired
 */
export function isLicenseExpired() {
  const info = getLicenseInfo();
  if (!info) return true;
  if (!info.expiresAt) return false; // Never expires
  return Date.now() > info.expiresAt;
}

/**
 * Deactivate license
 */
export function deactivateLicense() {
  localStorage.removeItem(LICENSE_KEY);
  localStorage.removeItem(LICENSE_ACTIVATED_KEY);
}

/**
 * Get remaining days
 */
export function getRemainingDays() {
  const info = getLicenseInfo();
  if (!info || !info.expiresAt) return Infinity;
  const remaining = info.expiresAt - Date.now();
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

export default {
  isActivated,
  getLicenseInfo,
  activateLicense,
  isLicenseExpired,
  deactivateLicense,
  getRemainingDays,
  getMachineId,
};
