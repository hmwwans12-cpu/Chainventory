import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
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
  // M-7: dispatch dinamis app/api/warehouses/membership/route.ts
  // (`supabase.rpc(fn[action], rpcArgs[action])`) tak terlihat pemindai
  // literal — 8 RPC hidup ini tidak tercakup sebelum fix.
  {
    name: "request_join",
    callers: ["app/api/warehouses/membership/route.ts"],
  },
  {
    name: "approve_join",
    callers: ["app/api/warehouses/membership/route.ts"],
  },
  {
    name: "reject_join",
    callers: ["app/api/warehouses/membership/route.ts"],
  },
  {
    name: "cancel_join",
    callers: ["app/api/warehouses/membership/route.ts"],
  },
  {
    name: "leave_warehouse",
    callers: ["app/api/warehouses/membership/route.ts"],
  },
  {
    name: "remove_member",
    callers: ["app/api/warehouses/membership/route.ts"],
  },
  {
    name: "update_member_role",
    callers: ["app/api/warehouses/membership/route.ts"],
  },
  {
    name: "transfer_ownership",
    callers: ["app/api/warehouses/membership/route.ts"],
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
function extractCallerArgSets(
  source: string,
  rpcName: string,
  callerPath?: string
): string[][] {
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
  // M-7: dispatch dinamis `supabase.rpc(fn[action], rpcArgs[action])` di
  // membership route — nama RPC hidup di peta `fn`, kunci argumen di peta
  // `rpcArgs` (file yang sama). Tanpa ini 8 RPC tak tercakup diam-diam.
  if (
    callerPath?.endsWith("membership/route.ts") &&
    source.includes("fn[action]")
  ) {
    const byAction = dispatchArgSets(source);
    const fnMap = dispatchFnMap(source);
    for (const [action, target] of fnMap) {
      if (target === rpcName && byAction.has(action)) {
        sets.push(byAction.get(action)!);
      }
    }
  }
  return sets;
}

/** Peta aksi → nama RPC dari `const fn: Record<...> = { aksi: "rpc", ... }`. */
function dispatchFnMap(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const anchor = source.indexOf("const fn: Record");
  if (anchor < 0) return out;
  const open = source.indexOf("{", anchor);
  if (open < 0) return out;
  const block = balancedBlock(source, open);
  if (block === null) return out;
  for (const m of block.matchAll(/(\w+)\s*:\s*"([a-z_]+)"/g)) {
    out.set(m[1]!, m[2]!);
  }
  return out;
}

/** Peta aksi → kunci argumen dari `const rpcArgs ... = { aksi: { p_x, ... } }`. */
function dispatchArgSets(source: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const anchor = source.indexOf("const rpcArgs");
  if (anchor < 0) return out;
  const open = source.indexOf("{", anchor);
  if (open < 0) return out;
  const block = balancedBlock(source, open);
  if (block === null) return out;
  // Setiap aksi: `aksi: { ... }` — objek ber-nest, pakai balancedBlock lagi.
  const keyRe = /(\w+)\s*:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(block)) !== null) {
    // Pastikan ini level-aksi (depth 0 relatif terhadap block).
    const depth =
      (block.slice(0, m.index).match(/\{/g) ?? []).length -
      (block.slice(0, m.index).match(/\}/g) ?? []).length;
    if (depth !== 0) continue;
    const inner = balancedBlock(block, m.index + m[0].length - 1);
    if (inner === null) continue;
    out.set(m[1]!, [
      ...new Set(
        [...inner.matchAll(/\b(p_[a-z][a-z0-9_]*)\b/g)].map((k) => k[1]!)
      ),
    ]);
  }
  return out;
}

type SqlParam = { name: string; type: string; hasDefault: boolean };

/**
 * M-7: kanonik tipe argumen untuk key per-signature (bukan aritas saja).
 * Dua overload ber-aritas sama (mis. apply_stock_movement 13-arg bigint vs
 * integer) tidak boleh saling menimpa diam-diam. Hanya alias ejaan yang
 * dinormalisasi (int→integer, timestamptz→timestamp with time zone) —
 * tipe berbeda tetap kunci berbeda.
 */
function normSigType(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\btimestamptz\b/g, "timestamp with time zone")
    .replace(/\bint\b/g, "integer");
}

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
      if (m) {
        const typeRaw = m[2]!.replace(/\bdefault\b.*/is, "");
        params.push({
          name: m[1]!,
          type: normSigType(typeRaw),
          hasDefault: /\bdefault\b/i.test(m[2]!),
        });
      }
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
        if (params)
          overloads.set(params.map((p) => p.type).join(","), {
            file,
            params,
          });
      } else {
        overloads.delete(
          splitTopLevel(body)
            .map((t) => normSigType(t))
            .join(",")
        );
      }
    }
  }
  return [...overloads.values()];
}

describe("paritas argumen RPC ↔ migrasi (static)", () => {
  it("setiap RPC yang dipanggil kode punya entri CONTRACTS (guard RPC baru)", () => {
    // M-7: RPC baru tanpa entri = test gagal. Cakupan = literal
    // `.rpc("nama")` di kode non-test + nilai peta dispatch dinamis
    // (membership route). Helper trigger/fungsi mati yang tak pernah
    // dipanggil TIDAK memicu (anti false-alarm).
    const names = new Set(CONTRACTS.map((c) => c.name));
    const called = new Map<string, string>();
    const roots = ["lib", "app", "components", "hooks"].map((d) =>
      join(process.cwd(), d)
    );
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\./.test(entry.name))
          continue;
        const rel = relative(process.cwd(), full).replace(/\\/g, "/");
        const src = readRepo(rel);
        for (const m of src.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)) {
          called.set(m[1]!, rel);
        }
        if (full.endsWith("membership/route.ts")) {
          for (const [, rpc] of dispatchFnMap(src)) {
            called.set(rpc, rel);
          }
        }
      }
    };
    roots.forEach(walk);
    const missing = [...called.entries()].filter(([n]) => !names.has(n));
    expect(
      missing.map(([n, f]) => `${n} <- ${f}`),
      "RPC dipanggil tapi tanpa entri CONTRACTS"
    ).toEqual([]);
  });

  for (const contract of CONTRACTS) {
    it(`${contract.name}: terdefinisi di migrasi dan argumen cocok`, () => {
      const overloads = liveOverloads(contract.name);
      expect(
        overloads.length,
        `tidak ada definisi function public.${contract.name} di supabase/migrations`
      ).toBeGreaterThan(0);

      for (const caller of contract.callers) {
        const sets = extractCallerArgSets(
          readRepo(caller),
          contract.name,
          caller
        );
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
