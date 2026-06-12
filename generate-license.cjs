/**
 * License Key Generator Tool  (VENDOR / OFFLINE USE ONLY)
 *
 * Signs license tokens with the PRIVATE Ed25519 key. This key must NEVER ship
 * with the app and must NEVER be committed (see .gitignore → license-keys/).
 * The app holds only the matching PUBLIC key and can verify, never forge.
 *
 * Usage:
 *   node generate-license.cjs <MACHINE_ID> "<STORE_NAME>" [VALIDITY_DAYS]
 *
 * Example (lifetime license):
 *   node generate-license.cjs "A1B2-C3D4-E5F6-G7H8" "Krishna Agro Store"
 *
 * Example (1-year license):
 *   node generate-license.cjs "A1B2-C3D4-E5F6-G7H8" "Krishna Agro Store" 365
 *
 * The customer gives you their Machine ID (shown on the app's activation
 * screen). You generate a token and send it back to them.
 *
 * Private key location (override with AGRISTORE_PRIVATE_KEY env var):
 *   license-keys/private.pem
 *
 * To create the key pair the first time:
 *   node -e "const c=require('crypto'),f=require('fs');const{publicKey,privateKey}=c.generateKeyPairSync('ed25519');f.mkdirSync('license-keys',{recursive:true});f.writeFileSync('license-keys/private.pem',privateKey.export({type:'pkcs8',format:'pem'}));f.writeFileSync('license-keys/public.pem',publicKey.export({type:'spki',format:'pem'}));console.log(publicKey.export({type:'spki',format:'pem'}))"
 * Then paste the printed PUBLIC key into LICENSE_PUBLIC_KEY_PEM in electron/license.cjs.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIVATE_KEY_PATH = process.env.AGRISTORE_PRIVATE_KEY
  || path.join(__dirname, 'license-keys', 'private.pem');

const TOKEN_PREFIX = 'AGRI2.';

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loadPrivateKey() {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error(`\n❌ Private signing key not found at:\n   ${PRIVATE_KEY_PATH}\n`);
    console.error('   Set AGRISTORE_PRIVATE_KEY to its path, or create a key pair (see header of this file).\n');
    process.exit(1);
  }
  return crypto.createPrivateKey(fs.readFileSync(PRIVATE_KEY_PATH, 'utf8'));
}

/**
 * Build and sign a license token.
 * @returns { licenseKey, payload }
 */
function generateLicenseToken(machineId, storeName, validityDays) {
  const expiryDate = validityDays
    ? new Date(Date.now() + Number(validityDays) * 86400000).toISOString()
    : null; // null = lifetime

  const payload = {
    machineId,
    storeName,
    createdAt: new Date().toISOString(),
    expiryDate,
    version: '2.0'
  };

  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = crypto.sign(null, payloadBuf, loadPrivateKey());
  const licenseKey = TOKEN_PREFIX + b64url(payloadBuf) + '.' + b64url(signature);

  return { licenseKey, payload };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    🔐 AGRISTORE LICENSE KEY GENERATOR                          ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Usage:                                                                        ║
║    node generate-license.cjs <MACHINE_ID> "<STORE_NAME>" [VALIDITY_DAYS]       ║
║                                                                                ║
║  Examples:                                                                     ║
║    node generate-license.cjs "A1B2-C3D4-E5F6-G7H8" "Krishna Agro Store"        ║
║    node generate-license.cjs "A1B2-C3D4-E5F6-G7H8" "Krishna Agro Store" 365    ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);
  process.exit(1);
}

// MachineId is normalized to upper-case (matches the app's getMachineId()).
const machineId = args[0].toUpperCase();
// VALIDITY_DAYS is optional and must be the trailing numeric arg if present.
let validityDays = null;
let nameArgs = args.slice(1);
if (nameArgs.length > 1 && /^\d+$/.test(nameArgs[nameArgs.length - 1])) {
  validityDays = nameArgs.pop();
}
const storeName = nameArgs.join(' ');

const { licenseKey, payload } = generateLicenseToken(machineId, storeName, validityDays);

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    🔐 GENERATING LICENSE KEY                                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
console.log(`  Store Name:    ${payload.storeName}`);
console.log(`  Machine ID:    ${payload.machineId}`);
console.log(`  Generated:     ${payload.createdAt}`);
console.log(`  Expires:       ${payload.expiryDate || 'Never (lifetime)'}`);
console.log(`
  LICENSE KEY (give this entire string to the customer):

${licenseKey}
`);

const fileName = `license_${storeName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.txt`;
const fileContent = `
AGRISTORE LICENSE
=================
Store Name:    ${payload.storeName}
Machine ID:    ${payload.machineId}
Generated:     ${payload.createdAt}
Expires:       ${payload.expiryDate || 'Never (lifetime)'}

LICENSE KEY:
${licenseKey}

Instructions:
1. Open AgriStore on the customer's computer.
2. Confirm the Machine ID on the activation screen matches the one above.
3. Paste the LICENSE KEY exactly as shown (it is one long line).
4. Click "Activate License".
`;

fs.writeFileSync(path.join(__dirname, fileName), fileContent.trim());
console.log(`  📄 License saved to: ${fileName}\n`);

module.exports = { generateLicenseToken };
