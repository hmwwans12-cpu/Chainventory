#!/usr/bin/env node
/**
 * Encoding check (temuan audit R-8) — versioned CI gate.
 *
 * Fails (exit 1) when a tracked text file is not valid UTF-8 (e.g. a file
 * saved as Latin-1/Windows-1252 or with mixed encodings). Corrupt characters
 * such as K-1 (ARSITEKTUR.md) are caught at authoring/review time; once
 * baked in as U+FFFD they ARE valid UTF-8, so this gate complements — not
 * replaces — review of suspicious `�`/`â†’` mojibake.
 *
 * Scope: text files under repo root, skipping binary/dep/build/output dirs
 * and third-party/contract artifacts (mirrors secret-scan.mjs philosophy).
 * Files >1MB are skipped (same cap as secret-scan).
 *
 * Usage:
 *   pnpm encoding:check                  # same gate as CI
 *   node scripts/ci/encoding-check.mjs [dir]
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname, sep } from "node:path";

// Path prefixes (relative to root) yang dilewati: dep, build output,
// artefak kontrak/submodule pihak ketiga, dan data lokal supabase.
const SKIP_PREFIXES = [
  "node_modules",
  ".git",
  ".next",
  ".vercel",
  ".kilo",
  ".opencode",
  "coverage",
  "test-results",
  "playwright-report",
  "supabase/.temp",
  "contracts/lib",
  "contracts/cache",
  "contracts/out",
  "contracts/broadcast",
];

const SKIP_EXT = new Set([
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".br",
  ".map",
  ".node",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".sqlite",
  ".db",
]);

const MAX_BYTES = 1024 * 1024;

function skipped(rel) {
  const norm = rel.split(sep).join("/");
  return SKIP_PREFIXES.some((p) => norm === p || norm.startsWith(`${p}/`));
}

function collect(root) {
  const offenders = [];
  let checked = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = relative(root, full);
      if (skipped(rel)) continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (SKIP_EXT.has(extname(entry.name).toLowerCase())) continue;
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.size === 0 || st.size > MAX_BYTES) continue;
      let buf;
      try {
        buf = readFileSync(full);
      } catch {
        continue;
      }
      checked++;
      try {
        decoder.decode(buf);
      } catch {
        offenders.push(rel);
      }
    }
  };
  walk(root);
  return { offenders, checked };
}

const root = process.argv[2] ?? process.cwd();
const { offenders, checked } = collect(root);

if (offenders.length > 0) {
  console.error("::error::Non-UTF-8 files detected (save as UTF-8):");
  for (const f of offenders.slice(0, 20)) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`encoding check: clean (${checked} files)`);
