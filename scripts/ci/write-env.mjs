/**
 * CI helper (P3 item 3a) — tulis `.env.local` dari env vars proses.
 *
 * Dipanggil di GitHub Actions (ci.yml / preview.yml). Menghindari masalah
 * shell heredoc + ekspansi variabel bila nilai secret mengandung karakter
 * shell (`$`, backtick, dll). Nilai dibaca dari `process.env`, dengan prefix
 * opsional (e.g. `E2E_`). TIDAK pernah mencetak nilai secret ke output.
 *
 *   node scripts/ci/write-env.mjs [PREFIX]
 */

import { writeFileSync } from "node:fs";

const prefix = process.argv[2] ?? "";

// NCF-04: sinkron 1:1 dengan lib/env.ts — sebelumnya tertinggal
// BASE_SEPOLIA_RPC_FALLBACK_URL, WAREHOUSE_FACTORY_ADDRESS, BASESCAN_API_KEY,
// UPSTASH_*, ANON_KEY, DEVELOPER_ALLOWLIST, QSTASH_APP_BASE_URL (tanpanya
// build/serve E2E berjalan tanpa fallback RPC/Redis).
const KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_MANAGEMENT_TOKEN",
  "SUPABASE_PROJECT_REF",
  "PRIVY_APP_SECRET",
  "TREASURY_PRIVATE_KEY",
  "BASESCAN_API_KEY",
  "QSTASH_TOKEN",
  "QSTASH_URL",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "QSTASH_APP_BASE_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "WAREHOUSE_FACTORY_ADDRESS",
  "BASE_SEPOLIA_RPC_URL",
  "BASE_SEPOLIA_RPC_FALLBACK_URL",
  "DEVELOPER_ALLOWLIST",
  "CRON_SECRET",
  "LOG_LEVEL",
];

const lines = KEYS.map((key) => `${key}=${process.env[prefix + key] ?? ""}`);
writeFileSync(".env.local", `${lines.join("\n")}\n`);

const missing = KEYS.filter((key) => !process.env[prefix + key]);
if (missing.length) {
  console.log(
    `[write-env] (${prefix || "no-prefix"}) missing in process.env: ${missing.join(", ")}`
  );
}
