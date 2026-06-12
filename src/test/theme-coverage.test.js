/**
 * Theme coverage audit — fails when JSX uses color Tailwind classes that the
 * light-theme override block in App.jsx cannot adapt. Allowlist mirrors the
 * comprehensive generator inside buildCSS (around App.jsx:1715).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const PALETTE = ['emerald', 'red', 'amber', 'purple', 'blue', 'indigo'];
// Opacities the light-theme override understands. 15 and 95 cover intentionally
// near-solid surfaces / hairline borders (e.g. the sticky invoice footer
// bg-emerald-950/95 and table-row border-emerald-800/15) that render correctly
// with native Tailwind and must NOT be remapped — overriding them would alter
// the default dark theme's appearance.
const OPACITIES = ['10','15','20','30','40','50','60','70','80','90','95'];

function buildAllowlist() {
  const set = new Set();
  for (const name of PALETTE) {
    // text: shade 50 (near-white) is used on notification cards that stay dark
    // in light mode, so the light text is correct as-is and needs no override.
    for (const shade of ['50','100','200','300','400','500','600','700','800','900']) {
      set.add(`text-${name}-${shade}`);
      set.add(`hover:text-${name}-${shade}`);
      for (const op of OPACITIES) set.add(`text-${name}-${shade}/${op}`);
    }
    // bg shade 50: only as a hover tint on white buttons (bg-white → emerald-50).
    set.add(`bg-${name}-50`);
    set.add(`hover:bg-${name}-50`);
    // bg mid (solid or tinted via opacity)
    for (const shade of ['300','400','500','600','700']) {
      set.add(`bg-${name}-${shade}`);
      set.add(`hover:bg-${name}-${shade}`);
      for (const op of OPACITIES) {
        set.add(`bg-${name}-${shade}/${op}`);
        set.add(`hover:bg-${name}-${shade}/${op}`);
      }
    }
    // bg tinted dark
    for (const shade of ['800','900','950']) {
      set.add(`bg-${name}-${shade}`);
      for (const op of OPACITIES) {
        set.add(`bg-${name}-${shade}/${op}`);
        set.add(`hover:bg-${name}-${shade}/${op}`);
      }
    }
    set.add(`bg-${name}-100`);
    // border: all shades + hover
    for (const shade of ['400','500','600','700','800','900']) {
      set.add(`border-${name}-${shade}`);
      set.add(`hover:border-${name}-${shade}`);
      for (const op of OPACITIES) {
        set.add(`border-${name}-${shade}/${op}`);
        set.add(`hover:border-${name}-${shade}/${op}`);
      }
    }
    // divide
    set.add(`divide-${name}-800`);
    for (const op of OPACITIES) set.add(`divide-${name}-800/${op}`);
  }
  return set;
}

const ALLOWLIST = buildAllowlist();

const CLASS_RE = new RegExp(
  `(?:hover:)?(?:text|bg|border|divide)-(?:${PALETTE.join('|')})-\\d+(?:\\/\\d+)?`,
  'g'
);

const SRC_ROOT = join(__dirname, '..');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (name === 'test' || name === 'node_modules') continue;
      out.push(...walk(full));
    } else if (/\.jsx?$/.test(name) && !name.endsWith('.corrupted')) {
      out.push(full);
    }
  }
  return out;
}

describe('theme coverage: JSX color classes must be themed for light mode', () => {
  const files = walk(SRC_ROOT);

  it('every scanned file uses only themed color classes', () => {
    const violations = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const matches = src.match(CLASS_RE) || [];
      const bad = [...new Set(matches.filter((c) => !ALLOWLIST.has(c)))];
      if (bad.length) {
        const rel = file.slice(SRC_ROOT.length + 1);
        violations.push(`${rel}: ${bad.join(', ')}`);
      }
    }

    if (violations.length) {
      const msg =
        `\n${violations.length} file(s) use color classes not covered by the light-theme override:\n\n` +
        violations.map((v) => '  - ' + v).join('\n') +
        `\n\nFix: swap to a covered shade/opacity, or extend both the generator in App.jsx buildCSS and this test's PALETTE/OPACITIES.`;
      throw new Error(msg);
    }

    expect(violations).toEqual([]);
  });
});
