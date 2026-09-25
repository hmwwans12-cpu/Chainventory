import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type FunctionContract = {
  name: string;
  oldSignature: string;
  newSignature: string;
};

const functionContracts: FunctionContract[] = [
  {
    name: "apply_stock_movement",
    oldSignature:
      "public.apply_stock_movement(uuid, uuid, text, numeric, bigint, text, text, uuid, text, text, uuid, jsonb, text, text)",
    newSignature:
      "public.apply_stock_movement(uuid, uuid, text, numeric, bigint, text, text, uuid, text, text, uuid, jsonb, text, text, uuid)",
  },
  {
    name: "approve_stock_adjustment",
    oldSignature: "public.approve_stock_adjustment(uuid, jsonb, text)",
    newSignature: "public.approve_stock_adjustment(uuid, jsonb, text, uuid)",
  },
  {
    name: "reject_stock_adjustment",
    oldSignature: "public.reject_stock_adjustment(uuid, text)",
    newSignature: "public.reject_stock_adjustment(uuid, text, uuid)",
  },
  {
    name: "create_user_paid_stock_intent",
    oldSignature:
      "public.create_user_paid_stock_intent(uuid, uuid, uuid, text, numeric, bigint, text, text, text, text, jsonb, text, text)",
    newSignature:
      "public.create_user_paid_stock_intent(uuid, uuid, uuid, text, numeric, bigint, text, text, text, text, jsonb, text, text, uuid)",
  },
  {
    name: "submit_user_paid_stock_intent",
    oldSignature: "public.submit_user_paid_stock_intent(uuid, text)",
    newSignature: "public.submit_user_paid_stock_intent(uuid, text, uuid)",
  },
  {
    name: "commit_user_paid_stock_intent",
    oldSignature: "public.commit_user_paid_stock_intent(uuid)",
    newSignature:
      "public.commit_user_paid_stock_intent(uuid, uuid, text, text)",
  },
  {
    name: "create_product_with_initial_stock",
    oldSignature:
      "public.create_product_with_initial_stock(uuid, text, text, text, text, text, numeric, numeric, uuid, uuid, jsonb, text)",
    newSignature:
      "public.create_product_with_initial_stock(uuid, text, text, text, text, text, numeric, numeric, uuid, uuid, jsonb, text, uuid, text, text, text)",
  },
];

function readRepositoryFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function migration(): string {
  return readRepositoryFile(
    "supabase/migrations/0065_inventory_intent_service_boundary.sql"
  );
}

function route(relativePath: string): string {
  return readRepositoryFile(relativePath);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("inventory and intent service boundary (0065, static)", () => {
  it("drops legacy signatures and grants only actor-bound service signatures", () => {
    const sql = migration();

    for (const contract of functionContracts) {
      expect(sql).toContain(`drop function if exists ${contract.oldSignature}`);
      expect(sql).toContain(
        `create or replace function public.${contract.name}`
      );
      expect(sql).toContain(
        `revoke execute on function ${contract.newSignature} from public, anon, authenticated;`
      );
      expect(sql).toContain(
        `grant execute on function ${contract.newSignature} to service_role;`
      );
      expect(sql).not.toMatch(
        new RegExp(
          `grant execute on function ${escapeRegExp(
            contract.newSignature
          )} to (?:public|anon|authenticated)`,
          "i"
        )
      );
    }

    expect(sql).not.toMatch(/auth\.uid\s*\(\s*\)/i);
    expect(sql.match(/p_actor_user_id uuid/gi)?.length).toBeGreaterThanOrEqual(
      7
    );
  });

  it("keeps the movement core private and enforces identity and replay inputs", () => {
    const sql = migration();

    expect(sql).toContain(
      "create or replace function private.apply_stock_movement_core"
    );
    expect(sql).toContain(
      "revoke all on function private.apply_stock_movement_core"
    );
    expect(sql).toContain("w.is_primary = true");
    expect(sql).toContain("w.verification_state = 'verified'");
    expect(sql).toContain("idempotency key is required");
    expect(sql).toContain("request fingerprint is required");
    expect(sql).toContain("IDEMPOTENCY_CONFLICT");
    expect(sql).toContain("deployed stock movement requires proof");
    expect(sql).toMatch(
      /from public\.products[\s\S]*?for update;[\s\S]*?from public\.inventory_balances[\s\S]*?for update;/i
    );
    expect(sql).toContain("from public.apply_stock_movement(");
    expect(sql).not.toContain("old.payload_hash");
  });

  it("locks intent evidence and never accepts an unverified replacement", () => {
    const sql = migration();
    const commitStart = sql.indexOf(
      "create or replace function public.commit_user_paid_stock_intent"
    );
    const commitEnd = sql.indexOf(
      "revoke execute on function public.commit_user_paid_stock_intent",
      commitStart
    );
    const commit = sql.slice(commitStart, commitEnd);

    expect(commit).toContain("p_verified_tx_hash text");
    expect(commit).toContain("p_verified_payload_hash text");
    expect(commit).toMatch(/from public\.stock_intents[\s\S]*?for update;/i);
    expect(commit).toContain(
      "lower(v_intent.tx_hash) is distinct from v_tx_hash"
    );
    expect(commit).toContain(
      "lower(v_intent.payload_hash) is distinct from lower(v_payload_hash)"
    );
    expect(commit).toContain(
      "v_proof.movement_id is distinct from v_intent.id"
    );
    expect(commit).toContain(
      "v_intent.payload_hash, 'confirmed', v_intent.tx_hash, 2"
    );
    expect(commit).toContain("status = 'submitted'");
    expect(commit).toContain("false\n  ) as r");
  });

  it("rechecks the movement permission before submitting an intent", () => {
    const sql = migration();
    const submitStart = sql.indexOf(
      "create or replace function public.submit_user_paid_stock_intent"
    );
    const submitEnd = sql.indexOf(
      "create or replace function public.commit_user_paid_stock_intent",
      submitStart
    );
    const submit = sql.slice(submitStart, submitEnd);
    expect(submit).toContain(
      "v_intent.movement_type in ('stock_in', 'stock_out')"
    );
    expect(submit).toContain("v_role not in ('STAFF', 'MANAGER', 'OWNER')");
  });

  it("routes privileged inventory writes through the service client", () => {
    const movementRoute = route(
      "app/api/warehouses/inventory/movements/route.ts"
    );
    const intentRoute = route("app/api/warehouses/inventory/intents/route.ts");
    const productRoute = route(
      "app/api/warehouses/inventory/products/route.ts"
    );
    const bulkRoute = route(
      "app/api/warehouses/inventory/products/bulk/route.ts"
    );

    for (const source of [
      movementRoute,
      intentRoute,
      productRoute,
      bulkRoute,
    ]) {
      expect(source).toContain('from "@/lib/supabase/service"');
      expect(source).toContain("const service = createServiceClient();");
    }

    for (const [source, names] of [
      [
        movementRoute,
        [
          "apply_stock_movement",
          "approve_stock_adjustment",
          "reject_stock_adjustment",
        ],
      ],
      [
        intentRoute,
        [
          "create_user_paid_stock_intent",
          "submit_user_paid_stock_intent",
          "commit_user_paid_stock_intent",
        ],
      ],
    ] as const) {
      for (const name of names) {
        expect(source).toMatch(
          new RegExp(`service\\.rpc\\(\\s*["']${name}["']`)
        );
        expect(source).not.toMatch(
          new RegExp(`supabase\\.rpc\\(\\s*["']${name}["']`)
        );
      }
    }

    for (const source of [productRoute, bulkRoute]) {
      expect(source).toMatch(
        new RegExp(
          `service\\.rpc\\(\\s*["']create_product_with_initial_stock["']`
        )
      );
      expect(source).not.toMatch(
        new RegExp(
          `supabase\\.rpc\\(\\s*["']create_product_with_initial_stock["']`
        )
      );
    }

    expect(movementRoute).toContain("p_actor_user_id: auth.user.id");
    expect(movementRoute).toContain('.eq("is_primary", true)');
    expect(movementRoute).toContain(
      'parsed.data.movementType !== "adjustment"'
    );
    expect(intentRoute).toContain("p_verified_tx_hash: intent.tx_hash");
    expect(intentRoute).toContain(
      "p_verified_payload_hash: intent.payload_hash"
    );
    expect(intentRoute).toContain('.eq("is_primary", true)');
    expect(productRoute).toContain("p_actor_wallet: primaryWallet");
    expect(productRoute).toContain("p_idempotency_key: idempotencyKey");
    expect(productRoute).toContain("p_request_fingerprint: requestFingerprint");
    expect(bulkRoute).toContain("p_actor_wallet: actorWallet");
    expect(bulkRoute).toContain("p_idempotency_key: idempotencyKey");
    expect(bulkRoute).toContain("p_request_fingerprint: requestFingerprint");
    expect(bulkRoute).toContain(
      'service.rpc("create_product_with_initial_stock"'
    );
  });
});
