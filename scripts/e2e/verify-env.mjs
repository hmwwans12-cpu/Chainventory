import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Verifikasi wiring env E2E (item 1) — deterministik, tanpa login.
 *
 * Invariant (keputusan user — treasury disatukan ke production):
 *   1. WAREHOUSE_FACTORY_ADDRESS yang dipakai E2E = TEST factory
 *      (base-sepolia-test.json), BUKAN factory production (base-sepolia.json).
 *   2. proofRecorder test factory = production treasury
 *      (0x463841123df8f45F2d58bBFCD276493750Bbf004) — SAMA dengan production.
 *   3. TREASURY_PRIVATE_KEY ada di .env.local (kunci treasury production yang
 *      dipakai E2E; TIDAK ada kunci treasury terpisah).
 *
 * Exit 0 = aman; exit 1 = ada yang salah.
 */

const root = resolve(import.meta.dirname, "..", "..");
const parseEnv = (file) => {
  const out = {};
  try {
    for (const line of readFileSync(resolve(root, file), "utf8").split(
      /\r?\n/
    )) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
  return out;
};

const prod = parseEnv(".env.local");
const e2e = parseEnv(".env.e2e.local");
const testReg = JSON.parse(
  readFileSync(
    resolve(root, "contracts/deployments/base-sepolia-test.json"),
    "utf8"
  )
);
const prodReg = JSON.parse(
  readFileSync(resolve(root, "contracts/deployments/base-sepolia.json"), "utf8")
);

const testFactory = testReg.contracts.WarehouseFactory.address;
const prodFactory = prodReg.contracts.WarehouseFactory.address;
const e2eFactory = e2e.WAREHOUSE_FACTORY_ADDRESS ?? testFactory;
const prodTreasury = testReg.contracts.WarehouseFactory.proofRecorder;
const e2eKeyOverride = e2e.E2E_TREASURY_PRIVATE_KEY; // must be ABSENT now

const errors = [];
if (!prod.TREASURY_PRIVATE_KEY)
  errors.push(
    "TREASURY_PRIVATE_KEY missing in .env.local (treasury production dipakai E2E)"
  );
if (e2eFactory !== testFactory)
  errors.push(
    `E2E factory is ${e2eFactory}, expected test factory ${testFactory}`
  );
if (e2eFactory === prodFactory)
  errors.push("E2E factory EQUALS production factory — forbidden");
if (e2eKeyOverride)
  errors.push(
    "E2E_TREASURY_PRIVATE_KEY masih ada di .env.e2e.local — hapus (treasury disatukan ke production)"
  );
if (testFactory === prodFactory)
  errors.push("test factory EQUALS production factory — forbidden");

if (errors.length) {
  console.error("[verify-env] FAIL:");
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}

console.log("[verify-env] OK");
console.log("  E2E factory:", e2eFactory, "(test)");
console.log("  Production factory:", prodFactory);
console.log("  proofRecorder test factory (treasury):", prodTreasury);
console.log("  TREASURY_PRIVATE_KEY dari .env.local: present (production)");

// Reminder non-fatal untuk deploy Vercel (pemeriksaan nyata ada di smoke
// "env-deploy" BLOCKER): NEXT_PUBLIC_APP_URL TIDAK di-auto-provide Vercel dan
// di-inline saat build — WAJIB di-set manual di Project Settings → Environment
// Variables. Di preview, QSTASH_APP_BASE_URL/VERCEL_URL menangani (lihat
// lib/proof/qstash.ts), jadi preview aman tanpa konfigurasi tambahan.
const appUrl = prod.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
if (/localhost|127\.0\.0\.1/.test(appUrl)) {
  console.log(
    "  ⚠ NEXT_PUBLIC_APP_URL di .env.local = " +
      appUrl +
      " — saat deploy Vercel WAJIB set ke domain publik di " +
      "Project Settings → Environment Variables (smoke env-deploy akan menolak build ini)."
  );
} else {
  console.log("  NEXT_PUBLIC_APP_URL:", appUrl, "(siap untuk build Vercel)");
}
