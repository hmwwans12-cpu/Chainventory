#!/usr/bin/env node
/**
 * Secret scan (CF-16, NCF-02) — versioned extraction of the CI inline `rg` check.
 *
 * Fails (exit 1) when an env var looks committed with a REAL value, e.g.
 *   TREASURY_PRIVATE_KEY=0xabc...
 * Placeholders in `.env.example` (empty or `sb_publishable_...`) do not match.
 *
 * NCF-02: (a) fallback pemindaian Node murni bila `rg` tidak terinstal
 * (sebelumnya crash ENOENT); (b) cakupan kunci mencakup QSTASH_TOKEN,
 * CRON_SECRET, BASESCAN_API_KEY (sebelumnya buta).
 *
 * Usage:
 *   pnpm secret:scan        # same gate as CI
 *   node scripts/ci/secret-scan.mjs
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const KEY_PATTERN =
  "(TREASURY_PRIVATE_KEY|QSTASH_TOKEN|QSTASH_CURRENT_SIGNING_KEY|QSTASH_NEXT_SIGNING_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|UPSTASH_REDIS_REST_TOKEN|PRIVY_APP_SECRET|CRON_SECRET|BASESCAN_API_KEY|RESEND_API_KEY)\\s*=\\s*(0x[0-9a-fA-F]{20,}|eyJ[A-Za-z0-9_-]{16,}|sk_[A-Za-z0-9]{16,}|sb_secret_[A-Za-z0-9]{16,}|re_[A-Za-z0-9]{16,}|[A-Za-z0-9+/]{32,}={0,2})";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "contracts",
  "coverage",
  "test-results",
  "playwright-report",
]);
const SKIP_FILES = new Set(["pnpm-lock.yaml"]);
// rg melewati file gitignored secara default; fallback Node harus sama
// — kalau tidak, .env.local milik developer (berisi secret ASLI tapi
// tidak ter-commit) ikut ter-flag false positive.
const isLocalEnv = (name) =>
  name === ".env" || /^\.env\..*\.local$/.test(name) || name === ".env.local";

function nodeScan(root) {
  const hits = [];
  const re = new RegExp(KEY_PATTERN);
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      if (SKIP_FILES.has(entry.name) || isLocalEnv(entry.name)) continue;
      let text;
      try {
        const st = statSync(full);
        if (st.size > 1024 * 1024) continue;
        text = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      text.split("\n").forEach((line, i) => {
        if (re.test(line)) hits.push(`${relative(root, full)}:${i + 1}:${line.trim().slice(0, 120)}`);
      });
    }
  };
  walk(root);
  return hits;
}

const root = process.cwd();
let hits = [];
try {
  const out = execFileSync(
    "rg",
    [
      "-n",
      KEY_PATTERN,
      "--glob",
      "!node_modules/**",
      "--glob",
      "!.git/**",
      "--glob",
      "!contracts/**",
      "--glob",
      "!.next/**",
      ".",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  if (out.trim()) hits = out.trim().split("\n");
} catch (err) {
  if (err && typeof err.status === "number" && err.status === 1) {
    hits = []; // rg: tidak ada yang cocok = bersih.
  } else if (err && err.code === "ENOENT") {
    console.warn("secret-scan: ripgrep not found, using Node fallback");
    hits = nodeScan(root);
  } else {
    throw err;
  }
}

if (hits.length > 0) {
  console.error("::error::Secret value committed (env var = real value)");
  for (const h of hits.slice(0, 20)) console.error(h);
  process.exit(1);
}
console.log("secret scan: clean");
