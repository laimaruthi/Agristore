// ── Unit Tests for the License System (electron/license.cjs) ─────────────────
//
// These guard the security-critical licensing logic: a signed token must
// verify against the EMBEDDED public key, and any tampering or forgery must be
// rejected. Tokens are signed here with the real private key
// (license-keys/private.pem) so we exercise the actual embedded public key.
//
// That private key is gitignored, so on a machine without it (e.g. a fresh CI
// clone) the suite skips cleanly instead of failing. To run it locally, ensure
// the key pair exists (see generate-license.cjs header).

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PRIV_PATH = path.join(ROOT, 'license-keys', 'private.pem');
const hasPrivKey = fs.existsSync(PRIV_PATH);

// Point the license file at an isolated temp dir so tests never touch a real
// installed license and need no Electron app instance. Must be set BEFORE the
// module is imported (getLicensePath reads it on first use).
const USERDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'agristore-lic-'));
process.env.AGRISTORE_USERDATA = USERDATA;

const lic = (await import('../../electron/license.cjs')).default;

const licenseFile = () => path.join(USERDATA, 'license.json');

// ── Helpers: sign tokens exactly the way generate-license.cjs does ───────────
const b64url = (b) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function signToken(payload, privPem) {
  const buf = Buffer.from(JSON.stringify(payload), 'utf8');
  const key = crypto.createPrivateKey(privPem ?? fs.readFileSync(PRIV_PATH, 'utf8'));
  const sig = crypto.sign(null, buf, key);
  return 'AGRI2.' + b64url(buf) + '.' + b64url(sig);
}

function makePayload(over = {}) {
  return {
    machineId: lic.getMachineId(),
    storeName: 'Krishna Agro Store',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiryDate: null,
    version: '2.0',
    ...over,
  };
}

const d = hasPrivKey ? describe : describe.skip;

d('verifyToken', () => {
  it('accepts a genuine token and returns the signed payload', () => {
    const payload = makePayload();
    const r = lic.verifyToken(signToken(payload));
    expect(r.valid).toBe(true);
    expect(r.payload.machineId).toBe(payload.machineId);
    expect(r.payload.storeName).toBe('Krishna Agro Store');
  });

  it('rejects a token whose payload was edited after signing (tamper)', () => {
    const token = signToken(makePayload({ expiryDate: '2026-12-31T00:00:00.000Z' }));
    const [, payloadB64, sigB64] = token.split(/AGRI2\.|\./);
    // Attacker rewrites expiry to the far future but keeps the original sig.
    const forgedPayload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
    forgedPayload.expiryDate = '2099-01-01T00:00:00.000Z';
    const tampered = 'AGRI2.' + b64url(Buffer.from(JSON.stringify(forgedPayload))) + '.' + sigB64;
    expect(lic.verifyToken(tampered).valid).toBe(false);
  });

  it('rejects a token signed by a different (attacker) key (forgery)', () => {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const attackerPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const token = signToken(makePayload({ storeName: 'Pirate' }), attackerPem);
    expect(lic.verifyToken(token).valid).toBe(false);
  });

  it('rejects the old AGRI-XXXX (HMAC-era) key format', () => {
    const r = lic.verifyToken('AGRI-1234-5678-90AB-CDEF-1234');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/outdated|invalid/i);
  });

  it('rejects malformed, empty, and non-string input', () => {
    expect(lic.verifyToken('AGRI2.onlyonepart').valid).toBe(false);
    expect(lic.verifyToken('garbage').valid).toBe(false);
    expect(lic.verifyToken('').valid).toBe(false);
    expect(lic.verifyToken(null).valid).toBe(false);
    expect(lic.verifyToken(undefined).valid).toBe(false);
  });
});

d('activateLicense', () => {
  beforeEach(() => lic.deactivateLicense());

  it('activates a token bound to this machine and persists the token', () => {
    const token = signToken(makePayload());
    const r = lic.activateLicense(token, 'ignored-name');
    expect(r.success).toBe(true);
    // Authoritative store name comes from the signed payload, not the arg.
    expect(r.licenseInfo.storeName).toBe('Krishna Agro Store');
    const saved = JSON.parse(fs.readFileSync(licenseFile(), 'utf8'));
    expect(saved.token).toBe(token);
  });

  it('rejects a token issued for a different machine', () => {
    const token = signToken(makePayload({ machineId: 'WRONG-MACHINE-ID' }));
    const r = lic.activateLicense(token, '');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not valid for this computer/i);
    expect(fs.existsSync(licenseFile())).toBe(false);
  });

  it('rejects an already-expired token at activation time', () => {
    const token = signToken(makePayload({ expiryDate: '2020-01-01T00:00:00.000Z' }));
    const r = lic.activateLicense(token, '');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/expired/i);
  });

  it('rejects a forged token', () => {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const token = signToken(makePayload(), privateKey.export({ type: 'pkcs8', format: 'pem' }));
    expect(lic.activateLicense(token, '').success).toBe(false);
  });
});

d('checkLicense', () => {
  beforeEach(() => lic.deactivateLicense());

  it('reports not_activated when no license file exists', () => {
    const r = lic.checkLicense();
    expect(r.valid).toBe(false);
    expect(r.status).toBe('not_activated');
  });

  it('reports active after a successful activation', () => {
    lic.activateLicense(signToken(makePayload()), '');
    const r = lic.checkLicense();
    expect(r.valid).toBe(true);
    expect(r.status).toBe('active');
  });

  it('grandfathers a legacy (HMAC-era) activation bound to this machine', () => {
    // Old format: licenseKey + machineId, no signed token.
    fs.writeFileSync(licenseFile(), JSON.stringify({
      licenseKey: 'AGRI-1234-5678-90AB-CDEF-1234',
      machineId: lic.getMachineId(),
      storeName: 'Legacy Store',
      status: 'active',
    }));
    const r = lic.checkLicense();
    expect(r.valid).toBe(true);
    expect(r.status).toBe('active');
    expect(r.licenseInfo.legacy).toBe(true);
  });

  it('rejects a legacy activation bound to a different machine', () => {
    fs.writeFileSync(licenseFile(), JSON.stringify({
      licenseKey: 'AGRI-1234-5678-90AB-CDEF-1234',
      machineId: 'SOME-OTHER-MACHINE',
      status: 'active',
    }));
    const r = lic.checkLicense();
    expect(r.valid).toBe(false);
    expect(r.status).toBe('not_activated');
  });

  it('reports expired for a legacy activation past its expiry', () => {
    fs.writeFileSync(licenseFile(), JSON.stringify({
      licenseKey: 'AGRI-1234-5678-90AB-CDEF-1234',
      machineId: lic.getMachineId(),
      expiryDate: '2020-01-01T00:00:00.000Z',
      status: 'active',
    }));
    const r = lic.checkLicense();
    expect(r.valid).toBe(false);
    expect(r.status).toBe('expired');
  });

  it('re-verifies the token and flags a hand-edited license.json as tampered', () => {
    lic.activateLicense(signToken(makePayload()), '');
    // Simulate someone editing the stored token to grab a free license.
    const info = JSON.parse(fs.readFileSync(licenseFile(), 'utf8'));
    info.token = info.token.slice(0, -4) + 'AAAA'; // corrupt the signature
    fs.writeFileSync(licenseFile(), JSON.stringify(info));
    const r = lic.checkLicense();
    expect(r.valid).toBe(false);
    expect(r.status).toBe('tampered');
  });

  it('trusts the signed payload, not the outer JSON, for machine binding', () => {
    // Token validly signed for a DIFFERENT machine, even if outer JSON lies.
    const token = signToken(makePayload({ machineId: 'SOME-OTHER-MACHINE' }));
    fs.writeFileSync(
      licenseFile(),
      JSON.stringify({ token, machineId: lic.getMachineId(), status: 'active' })
    );
    const r = lic.checkLicense();
    expect(r.valid).toBe(false);
    expect(r.status).toBe('machine_mismatch');
  });

  it('reports expired for a validly-signed but past-dated token', () => {
    const token = signToken(makePayload({ expiryDate: '2020-01-01T00:00:00.000Z' }));
    fs.writeFileSync(
      licenseFile(),
      JSON.stringify({ token, machineId: lic.getMachineId(), status: 'active' })
    );
    const r = lic.checkLicense();
    expect(r.valid).toBe(false);
    expect(r.status).toBe('expired');
  });
});

d('generateKeyForCustomer (in-app generation disabled)', () => {
  it('cannot mint keys from inside the app', () => {
    const r = lic.generateKeyForCustomer('ANY-MACHINE', 'Any Store');
    expect(r.error).toMatch(/disabled/i);
    expect(r.licenseKey).toBeUndefined();
  });
});
