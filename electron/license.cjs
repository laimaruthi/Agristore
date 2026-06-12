/**
 * License Key System for AgriStore
 * Each app installation requires a unique license key
 * Key is tied to the machine (hardware ID)
 */

const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// ──────────────────────────────────────────────────────────────────────────
// License signing — ASYMMETRIC (Ed25519)
//
// Only the PUBLIC key ships in the app. It can verify signatures but cannot
// create them, so unpacking the app does NOT let anyone mint licenses.
// The matching PRIVATE key lives only on the vendor's build machine
// (license-keys/private.pem, gitignored) and is used by generate-license.cjs.
//
// To rotate keys: regenerate the pair, replace the PEM below, redistribute.
// ──────────────────────────────────────────────────────────────────────────
const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAmLlSP5KqkpTqVjdAsE7b/CDsiy86sDKzvKtWH+x/OIs=
-----END PUBLIC KEY-----`;

// Tokens look like:  AGRI2.<base64url(payloadJSON)>.<base64url(signature)>
const TOKEN_PREFIX = 'AGRI2.';

function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/**
 * Parse + cryptographically verify a license token.
 * Returns { valid, payload } or { valid:false, error }.
 * No secret is required — verification uses the embedded PUBLIC key only.
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Invalid license key format' };
  }
  const clean = token.trim().replace(/\s+/g, '');
  if (!clean.startsWith(TOKEN_PREFIX)) {
    return { valid: false, error: 'Invalid or outdated license key. Please request a new key from support.' };
  }
  const body = clean.slice(TOKEN_PREFIX.length);
  const dot = body.indexOf('.');
  if (dot < 1) {
    return { valid: false, error: 'Malformed license key' };
  }
  const payloadB64 = body.slice(0, dot);
  const sigB64 = body.slice(dot + 1);

  let payloadBuf, signature;
  try {
    payloadBuf = b64urlDecode(payloadB64);
    signature = b64urlDecode(sigB64);
  } catch {
    return { valid: false, error: 'Malformed license key' };
  }

  let ok = false;
  try {
    ok = crypto.verify(null, payloadBuf, LICENSE_PUBLIC_KEY_PEM, signature);
  } catch (e) {
    return { valid: false, error: 'Signature verification failed' };
  }
  if (!ok) {
    return { valid: false, error: 'License key signature is invalid (key may be forged or corrupted).' };
  }

  let payload;
  try {
    payload = JSON.parse(payloadBuf.toString('utf8'));
  } catch {
    return { valid: false, error: 'Malformed license payload' };
  }
  return { valid: true, payload };
}

// License file location
let licensePath = null;

function getLicensePath() {
  if (!licensePath) {
    // AGRISTORE_USERDATA lets tests (and tooling) point the license file at an
    // isolated dir without an Electron app instance. Production uses app data.
    const userDataPath = process.env.AGRISTORE_USERDATA || app.getPath('userData');
    licensePath = path.join(userDataPath, 'license.json');
  }
  return licensePath;
}

/**
 * Generate a unique machine ID based on hardware
 */
function getMachineId() {
  const networkInterfaces = os.networkInterfaces();
  const cpus = os.cpus();
  
  // Collect hardware info
  let hardwareInfo = '';
  
  // Add MAC addresses
  for (const [name, interfaces] of Object.entries(networkInterfaces)) {
    for (const iface of interfaces) {
      if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
        hardwareInfo += iface.mac;
      }
    }
  }
  
  // Add CPU info
  if (cpus.length > 0) {
    hardwareInfo += cpus[0].model;
  }
  
  // Add hostname
  hardwareInfo += os.hostname();
  
  // Add platform
  hardwareInfo += os.platform() + os.arch();
  
  // Create hash of hardware info
  const hash = crypto.createHash('sha256')
    .update(hardwareInfo)
    .digest('hex')
    .substring(0, 16)
    .toUpperCase();
  
  // Format as XXXX-XXXX-XXXX-XXXX
  return `${hash.slice(0,4)}-${hash.slice(4,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}`;
}

/**
 * Activate license on this machine.
 * The license key is a signed token (AGRI2.<payload>.<signature>) produced by
 * the vendor's generate-license.cjs. We verify the signature with the embedded
 * public key, then confirm the signed machineId matches THIS machine.
 *
 * `storeName` is optional/informational — the authoritative store name is the
 * one baked into the signed token (an attacker cannot change it without
 * invalidating the signature).
 */
function activateLicense(licenseKey, storeName) {
  const machineId = getMachineId();

  const result = verifyToken(licenseKey);
  if (!result.valid) {
    return { success: false, error: result.error, machineId };
  }

  const payload = result.payload;

  // The signed token is bound to a specific machine.
  if (payload.machineId !== machineId) {
    return {
      success: false,
      error: `License key is not valid for this computer. Please contact support.\n\nYour Machine ID: ${machineId}`,
      machineId
    };
  }

  // Reject already-expired keys at activation time.
  if (payload.expiryDate && new Date(payload.expiryDate) < new Date()) {
    return { success: false, error: 'This license key has expired. Please request a renewal.', machineId };
  }

  // Persist the token itself so checkLicense() can re-verify the signature on
  // every launch (prevents hand-edited license.json from passing).
  const licenseInfo = {
    token: licenseKey.trim().replace(/\s+/g, ''),
    machineId,
    storeName: payload.storeName || storeName || '',
    expiryDate: payload.expiryDate || null,
    activatedAt: new Date().toISOString(),
    status: 'active'
  };

  try {
    fs.writeFileSync(getLicensePath(), JSON.stringify(licenseInfo, null, 2));
    return { success: true, licenseInfo };
  } catch (error) {
    return { success: false, error: 'Failed to save license: ' + error.message };
  }
}

/**
 * Check if current installation has valid license
 */
function checkLicense() {
  try {
    const licensePath = getLicensePath();
    
    if (!fs.existsSync(licensePath)) {
      return { 
        valid: false, 
        status: 'not_activated',
        machineId: getMachineId(),
        message: 'No license found. Please activate with your license key.'
      };
    }
    
    const licenseInfo = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
    const currentMachineId = getMachineId();

    // ── Backward compatibility ────────────────────────────────────────────
    // Installs activated under the old HMAC scheme have no signed `token`,
    // just { licenseKey, machineId, status }. We cannot re-verify those
    // (the shared secret is gone), so we grandfather them: honor the existing
    // activation as long as it is bound to THIS machine and not expired.
    // New activations always store a `token` and take the verified path below.
    if (!licenseInfo.token) {
      if (licenseInfo.licenseKey && licenseInfo.machineId === currentMachineId) {
        if (licenseInfo.expiryDate && new Date(licenseInfo.expiryDate) < new Date()) {
          return { valid: false, status: 'expired', machineId: currentMachineId, message: 'License has expired. Please renew.' };
        }
        return { valid: true, status: 'active', licenseInfo: { ...licenseInfo, legacy: true }, machineId: currentMachineId };
      }
      return {
        valid: false,
        status: 'not_activated',
        machineId: currentMachineId,
        message: 'No valid license found. Please activate with your license key.'
      };
    }

    // Re-verify the signed token on every launch. This means a hand-edited
    // license.json (e.g. tampered expiry/machineId) is rejected, because its
    // signature no longer matches. The token is the source of truth.
    const verified = verifyToken(licenseInfo.token);
    if (!verified.valid) {
      return {
        valid: false,
        status: 'tampered',
        machineId: currentMachineId,
        message: 'License could not be verified. Please re-activate with your license key.'
      };
    }

    const payload = verified.payload;

    // Machine binding comes from the SIGNED payload, not the outer JSON.
    if (payload.machineId !== currentMachineId) {
      return {
        valid: false,
        status: 'machine_mismatch',
        machineId: currentMachineId,
        message: 'License is registered to a different computer.'
      };
    }

    // Check expiry (from signed payload) if set
    if (payload.expiryDate) {
      const expiry = new Date(payload.expiryDate);
      if (expiry < new Date()) {
        return {
          valid: false,
          status: 'expired',
          machineId: currentMachineId,
          message: 'License has expired. Please renew.'
        };
      }
    }

    return {
      valid: true,
      status: 'active',
      licenseInfo: { ...licenseInfo, storeName: payload.storeName || licenseInfo.storeName },
      machineId: currentMachineId
    };
    
  } catch (error) {
    return { 
      valid: false, 
      status: 'error',
      machineId: getMachineId(),
      message: 'Error reading license: ' + error.message
    };
  }
}

/**
 * Deactivate license (for support/reset purposes)
 */
function deactivateLicense() {
  try {
    const licensePath = getLicensePath();
    if (fs.existsSync(licensePath)) {
      fs.unlinkSync(licensePath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get machine ID for display to user
 */
function getDisplayMachineId() {
  return getMachineId();
}

// =============================================
// LICENSE KEY GENERATION IS NO LONGER POSSIBLE INSIDE THE APP.
//
// Keys are signed with a PRIVATE key that never ships. To issue a key, run the
// offline tool on the vendor's machine:
//   node generate-license.cjs <MACHINE_ID> "<STORE_NAME>" [validityDays]
// This is intentional — it is what makes the licensing tamper-resistant.
// =============================================
function generateKeyForCustomer() {
  return {
    error: 'License generation is disabled in the app. Use the offline generate-license.cjs tool with the private signing key.'
  };
}

module.exports = {
  getMachineId,
  verifyToken,
  activateLicense,
  checkLicense,
  deactivateLicense,
  getDisplayMachineId,
  generateKeyForCustomer
};
