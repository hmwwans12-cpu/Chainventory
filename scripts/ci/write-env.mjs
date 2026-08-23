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

const KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRIVY_APP_SECRET",
  "TREASURY_PRIVATE_KEY",
  "QSTASH_TOKEN",
  "QSTASH_URL",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "CRON_SECRET",
  "BASE_SEPOLIA_RPC_URL",
];

const lines = KEYS.map((key) => `${key}=${process.env[prefix + key] ?? ""}`);
writeFileSync(".env.local", `${lines.join("\n")}\n`);

const missing = KEYS.filter((key) => !process.env[prefix + key]);
if (missing.length) {
  console.log(
    `[write-env] (${prefix || "no-prefix"}) missing in process.env: ${missing.join(", ")}`
  );
}
