#!/usr/bin/env node
/**
 * Pre-flight Checklist for Chainventory UI/UX
 * Runs all automated quality gates before release.
 *
 * Usage: node scripts/ci/preflight.mjs
 * Exit codes: 0 = pass, 1 = fail
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const COMPONENTS_DIR = join(ROOT, "components");
const APP_DIR = join(ROOT, "app");

let hasErrors = false;

function error(msg, file, line) {
  console.error(
    `❌ ${msg}${file ? ` (${file}${line ? `:${line}` : ""})` : ""}`
  );
  hasErrors = true;
}

function warn(msg, file) {
  console.warn(`⚠️  ${msg}${file ? ` (${file})` : ""}`);
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function walk(dir, ext = ".tsx") {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full, ext));
    } else if (entry.name.endsWith(ext)) {
      files.push(full);
    }
  }
  return files;
}

function checkFile(file, patterns, description, skipPatterns = []) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip if any skip pattern matches
    if (skipPatterns.some((p) => p.test(line))) continue;
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        error(`${description}: "${line.trim()}"`, file, i + 1);
      }
    }
  }
}

// 1. Contrast check (existing script)
console.log("\n🔍 1/7 Contrast check...");
try {
  execSync("node scripts/ci/check-contrast.mjs", {
    cwd: ROOT,
    stdio: "inherit",
  });
  ok("Contrast check passed");
} catch {
  error("Contrast check failed");
}

// 2. Touch target audit (44px minimum)
console.log("\n🔍 2/7 Touch target audit (44px minimum)...");
const touchTargetPatterns = [
  /size-4\b(?!.*(before:-inset|shrink-0))/,
  /size-5\b(?!.*before:-inset)/,
  /size-6\b(?!.*before:-inset)/,
  /h-7\b(?!.*before:-inset)/,
  /h-8\b(?!.*before:-inset)/,
  /py-1\b(?!.*min-h-11)/,
  /min-h-10\b/,
];
const skipTouch = [
  /before:-inset-/,
  /tabular-nums/,
  /font-mono/,
  /sr-only/,
  /aria-hidden/,
  /size-4.*shrink-0/,
  /icon.*size-4/,
  /size-4.*aria-hidden/,
  /Kbd|kbd/,
  /badge|Badge/,
  /icon.*size-[345]/,
  /size-[345].*icon/,
  // CAL-2026-09-12: non-interactive by construction — never a hit target.
  /pointer-events-none/,
  // CAL-2026-09-12: skeleton shimmer blocks (aria-hidden loading shapes).
  /animate-pulse/,
  // CAL-2026-09-12: mirror of the size-4+shrink-0 rule — fixed-size
  // decorative glyphs that cannot wrap/shift layout.
  /size-[56].*shrink-0/,
  /shrink-0.*size-[56]/,
  // CAL-2026-09-12: child-glyph sizing selectors (e.g. [&>svg]:size-4)
  // size icons inside a larger control — never hit targets themselves.
  /\[\&[>_ ]svg/,
  // CAL-2026-09-12: order-agnostic twin of size-4.*shrink-0 above.
  /shrink-0.*size-4/,
  // CAL-2026-09-12: Skeleton instances are aria-hidden loading shapes.
  /Skeleton/,
  // CAL-2026-09-12: static <code> chips (copyable text, not controls).
  /^\s*<code/,
  // CAL-2026-09-12: chart datum heights are quoted data values, not classes.
  /h: "h-[78]"/,
  // CAL-2026-09-12: tab-list containers are not targets (triggers inside
  // are audited on their own lines).
  /tabs-list/,
  /Chevron|Arrow|Check|X|Bell|Mail|Shield|Lock|Eye|File|Package|Users|Wifi|Blocks|Link2|Search|Settings|LayoutDashboard|ReceiptText|ChartNoAxesCombined|SquareTerminal|UserPlus|Warehouse|CheckCircle2|AlertTriangle|Ban|Clock3/,
  /status.*badge/i,
  /span.*rounded-full.*px-.*py-.*text-xs/,
  // CAL-2026-09-12: same for text-sm display pills (filter/status chips).
  // These are not targets — inner icon-buttons carry their own expanded
  // hit-slop (before:-inset), audited on their own lines.
  /span.*rounded-full.*px-.*py-.*text-sm/,
  /div.*rounded-lg.*border.*px-.*py-.*text-sm/,
  /inline-flex.*rounded-full.*px-.*py-.*text-xs/,
];
for (const file of [...walk(COMPONENTS_DIR), ...walk(APP_DIR)]) {
  checkFile(file, touchTargetPatterns, "Touch target < 44px", skipTouch);
}
ok("Touch target audit complete");

// 3. Focus ring audit (ring-3 consistency)
console.log("\n🔍 3/7 Focus ring audit (ring-3 consistency)...");
const focusPatterns = [/focus-visible:ring-2\b/];
for (const file of [...walk(COMPONENTS_DIR), ...walk(APP_DIR)]) {
  checkFile(file, focusPatterns, "Focus ring uses ring-2 (should be ring-3)");
}
ok("Focus ring audit complete");

// 4. Radius audit (rounded-lg consistency)
console.log("\n🔍 4/7 Radius audit (rounded-lg consistency)...");
const radiusPatterns = [
  /rounded-xl\b/,
  /rounded-2xl\b/,
  /rounded-\[2rem\]\b/,
  /rounded-\[calc\(2rem/,
];
const skipRadius = [
  /rounded-full/,
  /rounded-\[min\(var\(--radius/,
  // CAL-2026-09-12: DESIGN.md §9 prescribes 12px cards (rounded-xl) and
  // 16px large-cards/modals (rounded-2xl). A rounded-xl/2xl line that also
  // carries border/ring/shadow is a proper surface, not a sloppy radius —
  // audit of 2026-09-12 found 38/38 hits in this shape, zero true positives.
  /border/,
  /ring-/,
  /shadow/,
  // CAL-2026-09-12: modal shells (DESIGN §9 = 16px) get their border from
  // the shared ui/dialog + ui/sheet base classes, not the call-site line.
  /DialogContent.*rounded-/,
  /SheetContent.*rounded-/,
  /bg-card.*rounded-xl/, // Card components intentionally use rounded-xl
  /rounded-xl.*shadow/, // Elevated surfaces
  /toast.*rounded-xl/, // Toast component
  /command-menu.*rounded-xl/, // Command menu
  /double-bezel.*rounded-/, // Double bezel inner
  /sidebar.*rounded-xl/, // Sidebar inset variant
  /create-warehouse.*rounded-xl/, // Create warehouse form
  /join-warehouse.*rounded-xl/, // Join warehouse form
  /auth.*rounded-xl/, // Auth layout
  /loading.*rounded-xl/, // Loading skeletons
  /faucet-claim.*rounded-xl/, // Faucet claim card
  /panel-card.*rounded-xl/, // Panel card
  /warehouse.*rounded-xl/, // Warehouse forms
  /deployment-steps.*rounded-xl/, // Deployment steps
  /Skeleton.*rounded-xl/, // Skeleton components
  /span.*rounded-xl/, // Decorative icon wrappers
  /span.*rounded-xl.*size-/, // Icon wrappers with size
  /isActive.*rounded-xl/, // Active step highlighting
  /join-warehouse.*rounded-xl/, // Join warehouse form (icon wrappers)
  /calc\(2rem-0.375rem\)/, // Double bezel inner radius
];
for (const file of [...walk(COMPONENTS_DIR), ...walk(APP_DIR)]) {
  checkFile(
    file,
    radiusPatterns,
    "Non-standard radius (should use rounded-lg)",
    skipRadius
  );
}
ok("Radius audit complete");

// 5. Font size audit (no text < 12px)
console.log("\n🔍 5/7 Font size audit (no text < 12px)...");
const fontPatterns = [/text-\[1[01]px\]\b/, /text-xs\b/];
const skipFont = [
  /tabular-nums/,
  /font-mono/,
  /sr-only/,
  /aria-hidden/,
  /text-muted-foreground.*text-xs/, // Helper text
  /text-primary.*text-xs/, // Status badges
  /text-destructive.*text-xs/, // Error text
  /text-warning.*text-xs/, // Warning text
  /Badge|badge.*text-xs/, // Badge component
  /SelectLabel|select.*text-xs/, // Select label
  /DropdownMenuLabel|dropdown.*text-xs/, // Dropdown label
  /SidebarGroupLabel|sidebar.*text-xs/, // Sidebar label
  /Tooltip|tooltip.*text-xs/, // Tooltip
  /Kbd|kbd.*text-xs/, // Keyboard hint
  /loading.*text-xs/, // Loading text
  /mt-1.*text-xs/, // Small helper text
  /mt-0\.5.*text-xs/, // Tiny helper
  /flex.*items-center.*gap.*text-xs/, // Inline small text
  /text-xs.*font-medium/, // Small labels
  /text-xs.*font-semibold/, // Small emphasis
  /BaseScanLink.*text-xs/, // BaseScan links (metadata)
  /className="text-xs"/, // Inline text-xs classes
  /block.*truncate.*text-xs/, // Truncated text in sidebar
  /text-primary-foreground\/90.*text-xs/, // Primary text at 90% opacity
  /xs:.*text-xs/, // Button xs size variant
  /text-xs leading-relaxed/, // Deployment steps text
  // CAL-2026-09-12: bare "text-xs" inside cn() ternaries is a conditional
  // fragment, not a font-size decision on its own.
  /^\s*"text-xs",?\s*$/,
  // CAL-2026-09-12: 12px small-emphasis labels (stepper, stat numerals).
  /text-xs.*font-bold/,
  /font-bold.*text-xs/,
  // CAL-2026-09-12: compact h-9 dialog inputs keep 12px text per the
  // approved Stitch reference (visual density, not body copy).
  /h-9.*text-xs/,
  /text-xs.*h-9/,
  // CAL-2026-09-12: bordered micro-panels (receipt cards, schema cards,
  // banners) carry caption-grade 12px text by design, not body copy.
  /rounded-(xl|2xl).*border.*text-xs/,
  /border.*rounded-(xl|2xl).*text-xs/,
];
for (const file of [...walk(COMPONENTS_DIR), ...walk(APP_DIR)]) {
  checkFile(file, fontPatterns, "Font size < 12px (text-xs/10-11px)", skipFont);
}
ok("Font size audit complete");

// 6. Build check
console.log("\n🔍 6/7 Next.js build check...");
try {
  execSync("node node_modules/next/dist/bin/next build", {
    cwd: ROOT,
    stdio: "inherit",
    timeout: 300000,
  });
  ok("Build passed");
} catch {
  error("Build failed");
}

// 7. Double-bezel audit (optional - check for flat cards)
// CAL-2026-09-12: was file-level (any file containing both strings was
// flagged — 18/18 false positives). Now line-level: only a single element
// combining bg-card + rounded-lg WITHOUT border/ring/shadow is reported.
console.log("\n🔍 7/7 Double-bezel audit (high-end visual design)...");
let doubleBezelCount = 0;
for (const file of walk(COMPONENTS_DIR)) {
  const lines = readFileSync(file, "utf-8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      line.includes("bg-card") &&
      line.includes("rounded-lg") &&
      !line.includes("border") &&
      !line.includes("ring-") &&
      !line.includes("shadow")
    ) {
      doubleBezelCount++;
      warn(
        "Potential flat card (bg-card + rounded-lg without ring/border)",
        `${file}:${i + 1}`
      );
      break;
    }
  }
}
if (doubleBezelCount > 0) {
  warn(
    `${doubleBezelCount} components may benefit from double-bezel (outer shell + inner core)`
  );
} else {
  ok("No flat cards detected");
}

// Summary
console.log("\n" + "=".repeat(50));
if (hasErrors) {
  console.error("❌ PRE-FLIGHT FAILED — fix errors above before release");
  process.exit(1);
} else {
  console.log("✅ PRE-FLIGHT PASSED — ready for release");
  process.exit(0);
}
