#!/usr/bin/env node
// i18n key-reference gate (temuan audit #28).
//
// Memastikan setiap literal t("ns.key") di app/ + components/ benar-benar
// ada di lib/i18n/translations.ts. Tanpa gate ini, typo/nama-key yang lupa
// di-merge akan lolos typecheck+lint dan tampil sebagai key mentah di UI
// (translate() fallback me-return key string).
// Paritas en-;-id sendiri sudah dikunci translations.test.ts.
//
// Catatan: hanya literal statis yang dicek; pemanggilan t() dinamis
// dilaporkan sebagai warning agar dibuat eksplisit, bukan error.
//
// Usage:
//   pnpm i18n:check        # same gate as CI
//   node scripts/ci/i18n-keys.mjs
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_DIRS = ["app", "components"].map((d) => join(ROOT, d));
const SKIP_DIRS = new Set(["node_modules", ".git", ".next"]);
const KEY_RE = /\bt\(\s*"([A-Za-z][A-Za-z0-9_.]*)"/g;
const DYNAMIC_RE = /\bt\(\s*`/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
      continue;
    }
    if (/\.(tsx?|mts|cts)$/.test(entry.name)) out.push(join(dir, entry.name));
  }
  return out;
}

const src = readFileSync(join(ROOT, "lib/i18n/translations.ts"), "utf8");
const defined = new Set(
  [...src.matchAll(/"([a-z][a-z0-9_.]+)":/g)].map((m) => m[1])
);

let missing = 0;
const perNs = new Map();
for (const file of SRC_DIRS.flatMap((d) => walk(d))) {
  const content = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  for (const m of content.matchAll(KEY_RE)) {
    const key = m[1];
    const ns = key.split(".")[0];
    perNs.set(ns, (perNs.get(ns) ?? 0) + 1);
    if (!defined.has(key)) {
      missing++;
      console.error(`❌ missing key "${key}" referenced in ${rel}`);
    }
  }
  if (DYNAMIC_RE.test(content)) {
    console.warn(`⚠️  dynamic t() call in ${rel} (tidak bisa dicek statis)`);
  }
}

console.log("\nkey references per namespace:");
for (const [ns, n] of [...perNs.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${ns}: ${n}`);
}

if (missing > 0) {
  console.error(
    `\n❌ i18n-keys: ${missing} referensi key tidak ada di translations.ts`
  );
  process.exit(1);
}
console.log("\n✅ i18n-keys: semua referensi key terdaftar");
