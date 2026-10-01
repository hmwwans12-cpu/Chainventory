import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Paritas argumen RPC ↔ migrasi (static, tanpa DB).
 *
 * Pelajaran dari insiden `create_warehouse_and_deployment_with_relay`:
 * route memanggil RPC yang tidak ada di DB (migrasi belum di-push) atau
 * dengan argumen yang tidak cocok → PostgREST 500 "schema cache".
 * Test ini memastikan, untuk setiap RPC kritis:
 *   1. ada definisi `create or replace function public.<name>` di migrasi,
 *   2. setiap kunci `p_*` yang dikirim caller ADA di definisi terakhir,
 *   3. setiap param TANPA DEFAULT di definisi dikirim oleh SEMUA caller.
 *
 * Menambah RPC baru = tambah entri di CONTRACTS (abaikan file test/mock).
 */

type RpcContract = { name: string; callers: string[] };

const CONTRACTS: RpcContract[] = [
  { name: "register_wallet_for_user", callers: ["lib/wallets/sync.ts"] },
  { name: "bind_privy_user", callers: ["lib/wallets/sync.ts"] },
  { name: "verify_wallet", callers: ["app/api/wallets/verify/route.ts"] },
  { name: "get_my_profile", callers: [] },
  {
    name: "apply_stock_movement",
    callers: ["app/api/warehouses/inventory/movements/route.ts"],
  },
  {
    name: "approve_stock_adjustment",
    callers: ["app/api/warehouses/inventory/movements/route.ts"],
  },
  {
    name: "reject_stock_adjustment",
    callers: ["app/api/warehouses/inventory/movements/route.ts"],
  },
  {
    name: "create_user_paid_stock_intent",
    callers: ["app/api/warehouses/inventory/intents/route.ts"],
  },
  {
    name: "create_product_with_initial_stock",
    callers: [
      "app/api/warehouses/inventory/products/route.ts",
      "app/api/warehouses/inventory/products/bulk/route.ts",
    ],
  },
  {
    name: "create_warehouse_and_deployment_with_relay",
    callers: ["app/api/warehouses/create/route.ts"],
  },
  {
    name: "update_product_rpc",
    callers: ["app/api/warehouses/inventory/products/route.ts"],
  },
  {
    name: "create_invitation_for_user",
    callers: ["app/api/warehouses/members/invite/route.ts"],
  },
  { name: "accept_invitation", callers: ["app/invite/[token]/page.tsx"] },
  {
    name: "rollback_warehouse_creation",
    callers: ["lib/warehouses/deployment-finalize.ts"],
  },
  {
    name: "set_warehouse_status",
    callers: ["app/api/warehouses/lifecycle/route.ts"],
  },
];

function readRepo(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

/**
 * Samarkan string literal + komentar dengan spasi SAMA PANJANG (newline
 * dipertahankan) agar hitung kurung tidak kacau TANPA menggeser posisi —
 * nama RPC di `.rpc("nama")` ikut tersamar sehingga regex harus memakai
 * placeholder (lihat extractCallerArgSets).
 */
function maskEqual(source: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return source.replace(
    /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    blank
  );
}

function maskSources(source: string): string {
  return maskEqual(source);
}

function maskSql(sql: string): string {
  return sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Dari index `{` kembalikan isi sampai `}` penutupnya. */
function balancedBlock(source: string, openIndex: number): string | null {
  const open = source[openIndex];
  const close = open === "{" ? "}" : open === "(" ? ")" : null;
  if (!close) return null;
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === open) depth++;
    else if (source[i] === close) {
      depth--;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
  }
  return null;
}

/** Semua kemunculan `.rpc("name", { ... })` → daftar himpunan kunci argumen. */
function extractCallerArgSets(source: string, rpcName: string): string[][] {
  // Posisi dicari di source ASLI (nama utuh); parsing kurung di versi
  // tersamar yang indeksnya identik (maskEqual sama panjang).
  const masked = maskSources(source);
  const direct = new RegExp(`\\.rpc\\(\\s*"${rpcName}"`, "g");
  const sets: string[][] = [];
  let match: RegExpExecArray | null;
  while ((match = direct.exec(source)) !== null) {
    let i = match.index + match[0].length;
    while (i < masked.length && /\s/.test(masked[i]!)) i++;
    if (masked[i] === ")") {
      sets.push([]);
      continue;
    }
    if (masked[i] !== ",") continue;
    i++;
    while (i < masked.length && /\s/.test(masked[i]!)) i++;
    if (masked[i] !== "{") continue;
    const block = balancedBlock(masked, i);
    if (block === null) continue;
    const keys = [...block.matchAll(/\b(p_[a-z][a-z0-9_]*)\s*:/g)].map(
      (m) => m[1]!
    );
    sets.push([...new Set(keys)]);
  }
  return sets;
}

type SqlParam = { name: string; hasDefault: boolean };

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** Definisi TERAKHIR (urutan nama file) + paramnya. */
function latestDefinition(
  rpcName: string
): { file: string; params: SqlParam[] } | null {
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+public\\.${rpcName}\\s*\\(`,
    "gi"
  );
  let found: { file: string; params: SqlParam[] } | null = null;
  for (const file of files) {
    const masked = maskSql(readRepo(`supabase/migrations/${file}`));
    let match: RegExpExecArray | null;
    // Ambil definisi terakhir DALAM file juga (overload berurutan).
    let lastInFile: SqlParam[] | null = null;
    while ((match = pattern.exec(masked)) !== null) {
      const openIndex = match.index + match[0].length - 1;
      const body = balancedBlock(masked, openIndex);
      if (body === null) continue;
      // RETURNS bisa mengandung koma — potong di RETURNS top-level.
      const returnsAt = body.search(/\breturns\b/i);
      const paramBody = returnsAt >= 0 ? body.slice(0, returnsAt) : body;
      const params: SqlParam[] = [];
      for (const part of splitTopLevel(paramBody)) {
        const m = part.match(/^\s*(p_\w+)\s+(.+?)\s*$/s);
        if (m)
          params.push({ name: m[1]!, hasDefault: /\bdefault\b/i.test(m[2]!) });
      }
      lastInFile = params;
    }
    if (lastInFile) found = { file, params: lastInFile };
  }
  return found;
}

describe("paritas argumen RPC ↔ migrasi (static)", () => {
  for (const contract of CONTRACTS) {
    it(`${contract.name}: terdefinisi di migrasi dan argumen cocok`, () => {
      const def = latestDefinition(contract.name);
      expect(
        def,
        `tidak ada definisi function public.${contract.name} di supabase/migrations`
      ).not.toBeNull();
      const paramNames = new Set(def!.params.map((p) => p.name));
      const required = def!.params
        .filter((p) => !p.hasDefault)
        .map((p) => p.name);

      for (const caller of contract.callers) {
        const sets = extractCallerArgSets(readRepo(caller), contract.name);
        expect(
          sets.length,
          `${caller} tidak memanggil .rpc("${contract.name}")`
        ).toBeGreaterThan(0);
        for (const keys of sets) {
          for (const key of keys) {
            expect(
              paramNames.has(key),
              `${caller} mengirim ${key} tapi tidak ada di definisi terakhir (${def!.file})`
            ).toBe(true);
          }
          for (const name of required) {
            expect(
              keys.includes(name),
              `${caller} tidak mengirim param wajib ${name} (definisi ${def!.file})`
            ).toBe(true);
          }
        }
      }
    });
  }
});
