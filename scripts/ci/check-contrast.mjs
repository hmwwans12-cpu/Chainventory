#!/usr/bin/env node
/**
 * Contrast regression guard — P0#11 fix.
 *
 * Replaces the old regex blocklist (which only banned legacy `text-amber-*`
 * opacity utilities and MISSED genuine token-based failures such as
 * `--warning` on `--card`) with a real WCAG 2.1 contrast check.
 *
 * What it does:
 *   1. Parses the design tokens defined in app/globals.css (`:root` + `.dark`).
 *   2. Resolves each foreground token against the background it is typically
 *      rendered on (text on surface, foreground on muted, etc.).
 *   3. Computes the relative-luminance contrast ratio and fails any pairing
 *      below WCAG AA (4.5:1 for body text, 3:1 for large/badge text).
 *
 * Extend `PAIRS` when new tokens/surfaces are introduced.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const GLOBALS = join(process.cwd(), "app", "globals.css");

function hexToRgb(hex) {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(rgb) {
  const a = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function ratio(rgb1, rgb2) {
  const l1 = luminance(rgb1);
  const l2 = luminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseVars(css, scope) {
  const re = new RegExp(
    `${scope}\\s*\\{([^}]*)\\}`,
    "i"
  );
  const block = css.match(re)?.[1] ?? "";
  const vars = {};
  for (const line of block.split(";")) {
    const m = line.match(/--([\w-]+)\s*:\s*([^;]+)/);
    if (m) vars[m[1]] = m[2].trim();
  }
  return vars;
}

// Resolve a token reference (`var(--x)` or `#hex`) against a var map.
function resolve(value, vars, depth = 0) {
  if (!value || depth > 5) return null;
  const ref = value.match(/var\(--([\w-]+)\)/);
  if (ref) return resolve(vars[ref[1]] ?? "", vars, depth + 1);
  const hex = value.match(/#[0-9a-f]{3,8}/i);
  return hex ? hex[0] : null;
}

const css = readFileSync(GLOBALS, "utf-8");
const light = parseVars(css, ":root");
const dark = parseVars(css, ".dark");

// [fgToken, bgToken, minRatio, label]
const PAIRS = [
  ["--warning", "--card", 4.5, "warning text on card"],
  ["--warning", "--background", 4.5, "warning text on background"],
  ["--warning-foreground", "--warning", 3, "warning-foreground on warning"],
  ["--destructive", "--card", 4.5, "destructive text on card"],
  ["--muted-foreground", "--card", 4.5, "muted-foreground on card"],
  ["--muted-foreground", "--background", 4.5, "muted-foreground on background"],
  ["--foreground", "--card", 7, "foreground on card"],
  ["--primary", "--background", 4.5, "primary on background"],
  ["--primary-foreground", "--primary", 4.5, "primary-foreground on primary"],
  ["--secondary-foreground", "--secondary", 4.5, "secondary-foreground on secondary"],
];

let failures = 0;

for (const [themeName, vars] of [
  ["light", light],
  ["dark", dark],
]) {
  for (const [fg, bg, min, label] of PAIRS) {
    const fgHex = resolve(vars[fg], vars);
    const bgHex = resolve(vars[bg], vars);
    if (!fgHex || !bgHex) continue;
    const r = ratio(hexToRgb(fgHex), hexToRgb(bgHex));
    if (r < min) {
      failures += 1;
      console.error(
        `❌ [${themeName}] ${label}: ${fg}/${
          vars[fg]
        } on ${bg}/${vars[bg]} = ${r.toFixed(2)}:1 (need ${min}:1)`
      );
    }
  }
}

if (failures === 0) {
  console.log("✅ Contrast check passed — all token pairings meet WCAG AA.");
} else {
  console.error(
    `\n🔍 Contrast check failed: ${failures} token pairing(s) below WCAG AA.`
  );
  process.exit(1);
}
