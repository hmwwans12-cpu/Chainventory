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
    name: "commit_user_paid_stock_intent",
    callers: ["app/api/warehouses/inventory/intents/route.ts"],
  },
  {
    name: "submit_user_paid_stock_intent",
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
    name: "archive_product",
    callers: ["app/api/warehouses/inventory/products/route.ts"],
  },
  {
    name: "create_warehouse_and_deployment_with_relay",
    callers: ["app/api/warehouses/create/route.ts"],
  },
  {
    name: "update_warehouse_deployment_status",
    callers: [
      "app/api/warehouses/create/route.ts",
      "lib/warehouses/deployment-finalize.ts",
    ],
  },
  {
    name: "set_warehouse_contract_address",
    callers: ["lib/warehouses/deployment-finalize.ts"],
  },
  {
    name: "update_product_rpc",
    callers: ["app/api/warehouses/inventory/products/route.ts"],
  },
  {
    name: "create_invitation_for_user",
    callers: ["app/api/warehouses/members/invite/route.ts"],
  },
  {
    name: "accept_invitation",
    callers: ["app/invite/[token]/page.tsx"],
  },
  {
    name: "get_invitation_by_token",
    callers: ["app/invite/[token]/page.tsx", "lib/supabase/middleware.ts"],
  },
  {
    name: "rollback_warehouse_creation",
    callers: ["lib/warehouses/deployment-finalize.ts"],
  },
  {
    name: "set_warehouse_status",
    callers: ["app/api/warehouses/lifecycle/route.ts"],
  },
  {
    name: "prepare_ownership_transfer_intent",
    callers: ["app/api/warehouses/membership/route.ts"],
  },
  {
    name: "confirm_ownership_transfer_intent",
    callers: ["app/api/warehouses/membership/route.ts"],
  },
  {
    name: "fail_ownership_transfer_intent",
    callers: ["app/api/warehouses/membership/route.ts"],
  },
  {
    name: "record_ownership_transfer_tx",
    callers: ["app/api/warehouses/membership/route.ts"],
  },
  {
    name: "get_active_ownership_transfer_intent",
    callers: ["app/api/warehouses/membership/route.ts"],
  },
  {
    name: "cleanup_ownership_transfer_intents",
    callers: ["lib/warehouses/ownership-intent-reconcile.ts"],
  },
  {
    name: "proof_lease",
    callers: ["lib/proof/processor.ts"],
  },
  {
    name: "proof_requeue",
    callers: ["lib/proof/processor.ts"],
  },
  {
    name: "proof_complete",
    callers: ["lib/proof/processor.ts"],
  },
  {
    name: "proof_mark_manual",
    callers: ["lib/proof/confirmation.ts", "lib/proof/processor.ts"],
  },
  {
    name: "proof_set_confirmation",
    callers: ["lib/proof/confirmation.ts"],
  },
  {
    name: "proof_reconcile_candidates",
    callers: ["lib/proof/local-worker.ts", "lib/proof/reconcile.ts"],
  },
  {
    name: "proof_republish",
    callers: ["lib/proof/local-worker.ts", "lib/proof/reconcile.ts"],
  },
  {
    name: "proof_manual_retry",
    callers: [
      "app/api/console/proofs/[id]/retry/route.ts",
      "app/api/warehouses/proofs/[id]/retry/route.ts",
    ],
  },
  {
    name: "proof_retry",
    callers: ["app/api/warehouses/blockchain/proofs/route.ts"],
  },
  {
    name: "list_transactions",
    callers: [
      "app/(dashboard)/dashboard/page.tsx",
      "app/(dashboard)/transactions/page.tsx",
    ],
  },
  {
    name: "analytics_dashboard",
    callers: ["lib/analytics/aggregate.ts"],
  },
  {
    name: "upsert_notification_preferences",
    callers: ["app/api/users/notification-preferences/route.ts"],
  },
  {
    name: "mark_notifications_read",
    callers: ["lib/notifications/notifications-client.ts"],
  },
  {
    name: "keepalive_ping",
    callers: ["app/api/internal/keep-alive/route.ts"],
  },
  {
    name: "claim_faucet",
    callers: ["lib/faucet/claim.ts"],
  },
  {
    name: "confirm_faucet_claim",
    callers: ["lib/faucet/claim.ts", "lib/faucet/reconcile.ts"],
  },
  {
    name: "run_warehouse_lifecycle",
    callers: ["lib/warehouses/lifecycle.ts"],
  },
  {
    name: "digest_low_stock",
    callers: ["lib/warehouses/lifecycle.ts"],
  },
  {
    name: "archive_old_logs",
    callers: ["lib/warehouses/lifecycle.ts"],
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

/**
 * SEMUA overload yang hidup (urutan nama file): `create [or replace]
 * function` menambah/menimpa overload se-tanda-tangan; `drop function`
 * menghapusnya. PostgREST memilih overload dari argumen yang dikirim,
 * jadi caller cocok bila ADA SATU overload yang pas dua arah.
 */
type Overload = { file: string; params: SqlParam[] };

function liveOverloads(rpcName: string): Overload[] {
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const createPattern = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${rpcName}\\s*\\(`,
    "gi"
  );
  const dropPattern = new RegExp(
    `drop\\s+function\\s+(?:if\\s+exists\\s+)?public\\.${rpcName}\\s*\\(`,
    "gi"
  );
  const overloads = new Map<string, Overload>();

  const parseParams = (
    masked: string,
    openIndex: number
  ): SqlParam[] | null => {
    const body = balancedBlock(masked, openIndex);
    if (body === null) return null;
    // RETURNS bisa mengandung koma — potong di RETURNS top-level.
    const returnsAt = body.search(/\breturns\b/i);
    const paramBody = returnsAt >= 0 ? body.slice(0, returnsAt) : body;
    const params: SqlParam[] = [];
    for (const part of splitTopLevel(paramBody)) {
      const m = part.match(/^\s*(p_\w+)\s+(.+?)\s*$/s);
      if (m)
        params.push({ name: m[1]!, hasDefault: /\bdefault\b/i.test(m[2]!) });
    }
    return params;
  };

  for (const file of files) {
    const masked = maskSql(readRepo(`supabase/migrations/${file}`));
    // Single pass urutan dokumen: drop-then-create pada aritas sama harus
    // berakhir ADA (kasus 0067: drop 1-arg lalu create 1-arg baru).
    const events: Array<{ index: number; kind: "create" | "drop" }> = [];
    let match: RegExpExecArray | null;
    createPattern.lastIndex = 0;
    while ((match = createPattern.exec(masked)) !== null) {
      events.push({ index: match.index + match[0].length - 1, kind: "create" });
    }
    dropPattern.lastIndex = 0;
    while ((match = dropPattern.exec(masked)) !== null) {
      events.push({ index: match.index + match[0].length - 1, kind: "drop" });
    }
    events.sort((a, b) => a.index - b.index);
    for (const event of events) {
      const body = balancedBlock(masked, event.index);
      if (body === null) continue;
      if (event.kind === "create") {
        const params = parseParams(masked, event.index);
        if (params) overloads.set(params.length.toString(), { file, params });
      } else {
        overloads.delete(splitTopLevel(body).length.toString());
      }
    }
  }
  return [...overloads.values()];
}

describe("paritas argumen RPC ↔ migrasi (static)", () => {
  for (const contract of CONTRACTS) {
    it(`${contract.name}: terdefinisi di migrasi dan argumen cocok`, () => {
      const overloads = liveOverloads(contract.name);
      expect(
        overloads.length,
        `tidak ada definisi function public.${contract.name} di supabase/migrations`
      ).toBeGreaterThan(0);

      for (const caller of contract.callers) {
        const sets = extractCallerArgSets(readRepo(caller), contract.name);
        expect(
          sets.length,
          `${caller} tidak memanggil .rpc("${contract.name}")`
        ).toBeGreaterThan(0);
        for (const keys of sets) {
          const match = overloads.find((overload) => {
            const paramNames = new Set(overload.params.map((p) => p.name));
            const required = overload.params
              .filter((p) => !p.hasDefault)
              .map((p) => p.name);
            return (
              keys.every((key) => paramNames.has(key)) &&
              required.every((name) => keys.includes(name))
            );
          });
          expect(
            Boolean(match),
            `${caller} mengirim [${keys.join(", ")}] tapi tidak ada overload yang cocok (kandidat: ${overloads
              .map(
                (o) => `${o.file}: (${o.params.map((p) => p.name).join(", ")})`
              )
              .join(" | ")})`
          ).toBe(true);
        }
      }
    });
  }
});
