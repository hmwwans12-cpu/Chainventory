import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Env E2E (P3) — baca langsung dari disk (bukan process.env), karena server
 * app di-spawn terpisah oleh serve.mjs. Satu sumber kebenaran: `.env.local`
 * (creds Supabase) + `contracts/deployments/base-sepolia-test.json` (test
 * factory). JANGAN pernah cetak nilai secret ke output.
 */

const ROOT = resolve(__dirname, "..", "..");

function parseEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  let text: string;
  try {
    text = readFileSync(resolve(ROOT, file), "utf8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export const localEnv = {
  ...parseEnv(".env.local"),
  ...parseEnv(".env.e2e.local"),
};

export const CHAIN_ID = 84532; // Base Sepolia

export interface TestFactory {
  address: string;
  block: number;
}

export const TEST_FACTORY: TestFactory = (() => {
  const reg = JSON.parse(
    readFileSync(
      resolve(ROOT, "contracts/deployments/base-sepolia-test.json"),
      "utf8"
    )
  );
  return reg.contracts.WarehouseFactory as TestFactory;
})();

export function requireEnv(name: string): string {
  const value = localEnv[name];
  if (!value) {
    throw new Error(`E2E requires ${name} in .env.local/.env.e2e.local`);
  }
  return value;
}

export const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
export const SUPABASE_MANAGEMENT_TOKEN =
  localEnv.SUPABASE_MANAGEMENT_TOKEN ?? "";
