#!/usr/bin/env node
/**
 * Dependency audit gate (temuan audit #12).
 *
 * Menggantikan `pnpm audit --prod --audit-level high` + `continue-on-error`
 * yang membuat CVE critical (temuan #10: 2 RCE di next 16.3.0) lolos CI
 * tanpa ada yang notice.
 *
 * Aturan:
 *  - high/critical WAJIB lolos bersih, kecuali ada di
 *    `.github/security-allowlist.json` dengan `expires` >= hari ini (UTC).
 *  - Entri allow-list kedaluwarsa == tidak ada (gagal bila severity-nya
 *    high/critical) — paksa re-assessment berkala, bukan extend buta.
 *  - moderate ke bawah hanya dilaporkan, tidak menggagalkan.
 *
 * Usage:
 *   pnpm deps:audit         # same gate as CI
 *   node scripts/ci/deps-audit.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ALLOWLIST_PATH = join(ROOT, ".github", "security-allowlist.json");
const GATING = new Set(["high", "critical"]);

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function loadAllowlist() {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
  const map = new Map();
  for (const entry of raw.allowlist ?? []) {
    if (entry?.id) map.set(entry.id, entry);
  }
  return map;
}

function runAudit() {
  // execSync (bukan execFileSync): .cmd shim pnpm di Windows hanya resolve
  // lewat shell; di ubuntu shell juga default aman untuk argumen statis ini.
  // Fallback ke `corepack pnpm` untuk shell tanpa pnpm di PATH (dev lokal
  // Windows); di CI, pnpm sudah di PATH via pnpm/action-setup.
  const commands = [
    "pnpm audit --prod --json",
    "corepack pnpm audit --prod --json",
  ];
  let lastError = null;
  for (const cmd of commands) {
    try {
      return JSON.parse(
        execSync(cmd, {
          cwd: ROOT,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
    } catch (err) {
      lastError = err;
      const out = err?.stdout ?? "";
      // pnpm audit exit != 0 justru saat ada temuan — stdout tetap JSON.
      try {
        if (out) return JSON.parse(out);
      } catch {
        // bukan JSON (mis. pnpm tidak dikenal) → coba command berikutnya
      }
    }
  }
  throw lastError;
}

const allowlist = loadAllowlist();
const today = todayUTC();
let failed = false;

let advisories = {};
try {
  advisories = runAudit().advisories ?? {};
} catch (err) {
  // runAudit hanya throw bila pnpm sendiri gagal total (bukan temuan
  // vuln — temuan tetap me-return JSON). Gagalkan eksplisit supaya gate
  // tidak diam-diam hijau.
  console.error("❌ deps-audit: gagal menjalankan pnpm audit");
  console.error(String(err?.message ?? err).slice(0, 500));
  process.exit(1);
}

for (const advisory of Object.values(advisories)) {
  const id = advisory.github_advisory_id || String(advisory.id);
  const severity = advisory.severity || "unknown";
  const title = (advisory.title || "").slice(0, 90);
  if (!GATING.has(severity)) {
    console.log(
      ` - ${severity}: ${id} (${advisory.module_name}) — reported only`,
    );
    continue;
  }
  const entry = allowlist.get(id);
  if (entry && entry.expires >= today) {
    console.log(
      ` - ${severity}: ${id} (${advisory.module_name}) — ACCEPTED until ${entry.expires}: ${entry.reason.slice(0, 80)}`,
    );
    continue;
  }
  failed = true;
  console.error(`❌ ${severity}: ${id} (${advisory.module_name}) — ${title}`);
  if (entry) {
    console.error(
      `   allow-list entry EXPIRED on ${entry.expires}; re-assess, do not blindly extend.`,
    );
  } else {
    console.error(
      "   no allow-list entry; upgrade the dependency or add an assessed entry with expiry to .github/security-allowlist.json",
    );
  }
}

if (failed) {
  console.error(
    "❌ deps-audit: unaccepted high/critical vulnerabilities — see above",
  );
  process.exit(1);
}
console.log("✅ deps-audit: no unaccepted high/critical vulnerabilities");
