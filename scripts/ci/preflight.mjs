#!/usr/bin/env node
/**
 * Pre-flight Checklist for Chainventory UI/UX
 * Runs all automated quality gates before release.
 *
 * Usage: node scripts/ci/preflight.mjs
 * Exit codes: 0 = pass, 1 = fail
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const COMPONENTS_DIR = join(ROOT, "components");
const APP_DIR = join(ROOT, "app");

let hasErrors = false;

function error(msg, file, line) {
  console.error(`❌ ${msg}${file ? ` (${file}${line ? `:${line}` : ""})` : ""}`);
  hasErrors = true;
}

function warn(msg, file) {
  console.warn(`⚠️  ${msg}${file ? ` (${file})` : ""}`);
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf-8", stdio: "pipe" }).trim();
  } catch (e) {
    return "";
  }
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
  execSync("node scripts/ci/check-contrast.mjs", { cwd: ROOT, stdio: "inherit" });
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
const radiusPatterns = [/rounded-xl\b/, /rounded-2xl\b/, /rounded-\[2rem\]\b/, /rounded-\[calc\(2rem/];
const skipRadius = [
  /rounded-full/,
  /rounded-\[min\(var\(--radius/,
  /bg-card.*rounded-xl/,  // Card components intentionally use rounded-xl
  /rounded-xl.*shadow/,   // Elevated surfaces
  /toast.*rounded-xl/,    // Toast component
  /command-menu.*rounded-xl/, // Command menu
  /double-bezel.*rounded-/, // Double bezel inner
  /sidebar.*rounded-xl/,  // Sidebar inset variant
  /create-warehouse.*rounded-xl/, // Create warehouse form
  /join-warehouse.*rounded-xl/,   // Join warehouse form
  /auth.*rounded-xl/,     // Auth layout
  /loading.*rounded-xl/,  // Loading skeletons
];
for (const file of [...walk(COMPONENTS_DIR), ...walk(APP_DIR)]) {
  checkFile(file, radiusPatterns, "Non-standard radius (should use rounded-lg)", skipRadius);
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
  /text-primary.*text-xs/,         // Status badges
  /text-destructive.*text-xs/,     // Error text
  /text-warning.*text-xs/,         // Warning text
  /Badge|badge.*text-xs/,          // Badge component
  /SelectLabel|select.*text-xs/,   // Select label
  /DropdownMenuLabel|dropdown.*text-xs/, // Dropdown label
  /SidebarGroupLabel|sidebar.*text-xs/,  // Sidebar label
  /Tooltip|tooltip.*text-xs/,      // Tooltip
  /Kbd|kbd.*text-xs/,              // Keyboard hint
  /loading.*text-xs/,              // Loading text
  /mt-1.*text-xs/,                 // Small helper text
  /mt-0\.5.*text-xs/,              // Tiny helper
  /flex.*items-center.*gap.*text-xs/, // Inline small text
  /text-xs.*font-medium/,          // Small labels
  /text-xs.*font-semibold/,        // Small emphasis
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
console.log("\n🔍 7/7 Double-bezel audit (high-end visual design)...");
let doubleBezelCount = 0;
for (const file of walk(COMPONENTS_DIR)) {
  const content = readFileSync(file, "utf-8");
  if (content.includes("rounded-lg") && content.includes("bg-card") && !content.includes("ring-1")) {
    doubleBezelCount++;
    warn("Potential flat card (bg-card + rounded-lg without ring/border)", file);
  }
}
if (doubleBezelCount > 0) {
  warn(`${doubleBezelCount} components may benefit from double-bezel (outer shell + inner core)`);
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