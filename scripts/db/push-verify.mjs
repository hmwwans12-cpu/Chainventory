#!/usr/bin/env node
/**
 * DB push + verify (P0 audit — pelajaran insiden relay 20260925:
 * file migrasi ada di repo tapi tidak pernah di-push → PostgREST 500
 * "schema cache" saat runtime).
 *
 * Mode default (CI-safe, tanpa kredensial): paritas statik RPC↔migrasi.
 * Mode --push (butuh kredensial): link + db push + verifikasi remote
 * via PostgREST OpenAPI bahwa RPC kritis ADA di schema cache.
 *
 * Env untuk --push:
 *   SUPABASE_PROJECT_REF, SUPABASE_ACCESS_TOKEN (link),
 *   SUPABASE_DB_PASSWORD (push),
 *   NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   (atau ..._ANON_KEY) untuk verifikasi OpenAPI.
 *
 * Exit: 0 = pass, 1 = fail, 2 = skipped (kredensial --push tidak lengkap).
 */

import { execSync } from "node:child_process";

const REQUIRED_RPCS = [
  "apply_stock_movement",
  "create_product_with_initial_stock",
  "create_user_paid_stock_intent",
  "verify_wallet",
  "register_wallet_for_user",
  "get_my_profile",
  "create_warehouse_and_deployment_with_relay",
];

const PUSH_MODE = process.argv.includes("--push");

function sh(cmd, opts = {}) {
  return execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts });
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function skip(msg) {
  console.warn(`⏭️  SKIP: ${msg}`);
  process.exit(2);
}

// 1. Paritas statik (selalu jalan — tanpa DB).
console.log("▶ static RPC↔migration parity…");
try {
  sh("npx vitest run lib/security/rpc-arg-parity.test.ts", {
    stdio: "inherit",
  });
  console.log("✅ parity test passed");
} catch {
  fail("rpc-arg-parity.test.ts gagal — perbaiki dulu sebelum push");
}

if (!PUSH_MODE) {
  console.log(
    "✅ static checks passed (gunakan --push untuk push+verify remote)"
  );
  process.exit(0);
}

// 2. Push.
const ref = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
if (!ref || !accessToken || !dbPassword) {
  skip(
    "SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN / SUPABASE_DB_PASSWORD belum lengkap"
  );
}

console.log(`▶ linking ${ref}…`);
try {
  sh(`supabase link --project-ref ${ref}`, {
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken },
  });
} catch (err) {
  fail(`supabase link gagal: ${err.message}`);
}

console.log("▶ db push…");
try {
  sh(`supabase db push --linked --password "${dbPassword}" --yes`, {
    stdio: "inherit",
  });
} catch (err) {
  fail(`supabase db push gagal: ${err.message}`);
}

// 3. Verifikasi remote via PostgREST OpenAPI (schema cache PostgREST).
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  skip(
    "NEXT_PUBLIC_SUPABASE_URL / publishable key belum ada untuk verifikasi OpenAPI"
  );
}

console.log("▶ verifying PostgREST schema cache…");
const res = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!res.ok) fail(`OpenAPI fetch HTTP ${res.status}`);
const spec = await res.json();
const paths = spec.paths ?? {};
const missing = REQUIRED_RPCS.filter((rpc) => !(`/rpc/${rpc}` in paths));
if (missing.length > 0) {
  fail(
    `RPC hilang dari schema cache (tunggu ~1 mnt lalu ulangi): ${missing.join(", ")}`
  );
}
console.log(`✅ remote verified: ${REQUIRED_RPCS.length} RPCs in schema cache`);
