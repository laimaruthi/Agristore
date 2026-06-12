// ── Utility Functions ─────────────────────────────────────────────────────────

// Coerce any value to a finite number; undefined/null/NaN/Infinity → 0.
// Every money calculation funnels through this so a missing field can never
// produce NaN in a total or on a printed invoice.
export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Round to 2 decimals (paise), FP-safe.
export const round2 = (n) => Math.round(num(n) * 100) / 100;

// Currency formatting. Guards against NaN/undefined so totals never render "₹NaN".
export const fmtCurrency = (n) => `₹${num(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Line-item math (single source of truth for invoices & purchases) ──────────
// base = qty × price × (1 − discount%);  tax = base × (cgst% + sgst%)
export const lineBase = (l) => num(l.qty) * num(l.price) * (1 - num(l.discount) / 100);
export const lineTax = (l) => lineBase(l) * ((num(l.cgst) + num(l.sgst)) / 100);
export const lineTotal = (l) => lineBase(l) + lineTax(l);
// Cost of goods for a line = qty × unit cost captured at sale time.
export const lineCost = (l) => num(l.qty) * num(l.cost);

// Cost of goods sold for a whole invoice. Prefers the cost frozen on each line
// at sale time; for legacy invoices without it, falls back to a per-line cost
// lookup (e.g. the item's current purchase price) when provided.
export const invoiceCOGS = (inv, costLookup) =>
  (inv?.items || []).reduce((s, l) => {
    const unit = l.cost != null ? num(l.cost) : (costLookup ? num(costLookup(l)) : 0);
    return s + num(l.qty) * unit;
  }, 0);

// Date helpers - uses LOCAL time, not UTC
export const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + 
    String(d.getMonth() + 1).padStart(2, "0") + "-" + 
    String(d.getDate()).padStart(2, "0");
};

export const nowTimestamp = () => {
  const d = new Date();
  return d.getFullYear() + "-" + 
    String(d.getMonth() + 1).padStart(2, "0") + "-" + 
    String(d.getDate()).padStart(2, "0") + " " + 
    String(d.getHours()).padStart(2, "0") + ":" + 
    String(d.getMinutes()).padStart(2, "0") + ":" + 
    String(d.getSeconds()).padStart(2, "0");
};

export const fmtDate = (dateStr) => {
  if (!dateStr) return "—";
  const datePart = String(dateStr).split(/[ T]/)[0];
  const [y, m, d] = datePart.split("-");
  return `${d}/${m}/${y}`;
};

export const fmtDateTime = (s) => {
  if (!s) return "—";
  if (!s.includes(" ")) return fmtDate(s);
  const [datePart, timePart] = s.split(" ");
  const [y, m, d] = datePart.split("-");
  const [hh, mm] = timePart.split(":");
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${d}/${m}/${y} ${h12}:${mm} ${ampm}`;
};

// ID generators. Uses reduce instead of spread to avoid stack overflow at scale.
export const newId = (arr) => (arr.length ? arr.reduce((m, x) => (Number(x.id) > m ? Number(x.id) : m), 0) + 1 : 1);

export const generateUUID = () => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 7);
  return `${timestamp}-${randomPart}`;
};

// Sequential Invoice ID (INV-001, INV-002, etc.). Uses reduce so it scales past
// ~100k items where Math.max(...spread) would blow the call stack.
export const newInvId = (inv) => {
  const max = inv.reduce((m, i) => {
    const match = i.id && i.id.match(/INV-(\d+)/);
    const n = match ? parseInt(match[1], 10) : 0;
    return n > m ? n : m;
  }, 0);
  return `INV-${String(max + 1).padStart(3, "0")}`;
};

// UUID-based Purchase ID
export const newPurId = (arr) => {
  const max = arr.reduce((m, i) => {
    const match = i.id && i.id.match(/PUR-(\d+)/);
    const n = match ? parseInt(match[1], 10) : 0;
    return n > m ? n : m;
  }, 0);
  const hash = Date.now().toString(36).slice(-4);
  return `PUR-${String(max + 1).padStart(3, "0")}-${hash}`;
};

// Build a local-midnight Date from a "YYYY-MM-DD" (or "YYYY-MM-DD ...") string.
// Avoids the UTC/local mismatch where new Date("2026-05-24") is UTC midnight
// but new Date("2026-05-24 12:00") is local — diffing them mixes offsets.
const localMidnight = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split(/[ T]/)[0].split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

// Expiry helpers
export const daysUntilExpiry = (dateStr) => {
  if (!dateStr) return null;
  const target = localMidnight(dateStr);
  const todayDate = localMidnight(today());
  if (!target || !todayDate) return null;
  return Math.round((target - todayDate) / (1000 * 60 * 60 * 24));
};

export const expiryStatus = (dateStr) => {
  const d = daysUntilExpiry(dateStr);
  if (d === null) return null;
  if (d < 0) return { label: "Expired", color: "red", bg: "bg-red-900/20", text: "text-red-400", days: d };
  if (d <= 30) return { label: `${d}d left`, color: "red", bg: "bg-red-900/20", text: "text-red-400", days: d };
  if (d <= 60) return { label: `${d}d left`, color: "yellow", bg: "bg-amber-900/20", text: "text-amber-400", days: d };
  return { label: `${d}d left`, color: "green", bg: "bg-emerald-900/20", text: "text-emerald-400", days: d };
};

// Overdue balance helpers
export const daysSinceInvoice = (dateStr) => {
  if (!dateStr) return 0;
  const invDate = localMidnight(dateStr);
  const todayDate = localMidnight(today());
  if (!invDate || !todayDate) return 0;
  return Math.max(0, Math.round((todayDate - invDate) / (1000 * 60 * 60 * 24)));
};

export const isOverdue = (inv) => {
  const balance = inv.total - (inv.paidAmount || 0);
  return balance > 0 && daysSinceInvoice(inv.date) >= 30;
};

// Debounce utility
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Action rate limiter
const actionTimestamps = {};
const ACTION_COOLDOWN = 1000;

export function canPerformAction(actionKey) {
  const now = Date.now();
  const lastAction = actionTimestamps[actionKey] || 0;
  if (now - lastAction < ACTION_COOLDOWN) {
    return false;
  }
  actionTimestamps[actionKey] = now;
  return true;
}

// CSV Export helper
export const exportCSV = (filename, headers, rows) => {
  const escape = (v) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") 
      ? `"${s.replace(/"/g, '""')}"` 
      : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Amount in Words (Indian Numbering System) ─────────────────────────────────
export const amountInWords = (num) => {
  if (num === 0) return "Zero Rupees Only";
  
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  const numToWords = (n) => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
    if (n < 100000) return numToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
    if (n < 10000000) return numToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numToWords(n % 100000) : '');
    return numToWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + numToWords(n % 10000000) : '');
  };
  
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  
  let result = numToWords(rupees) + ' Rupees';
  if (paise > 0) result += ' and ' + numToWords(paise) + ' Paise';
  return result + ' Only';
};

// ── State Code to State Name ──────────────────────────────────────────────────
export const stateCodeToName = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "36": "Telangana", "37": "Andhra Pradesh"
};

// ── Image Compression ─────────────────────────────────────────────────────────
export function compressImage(file, maxWidth = 200, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
