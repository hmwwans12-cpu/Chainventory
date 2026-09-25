import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration(): string {
  return readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "0073_ownership_transfer_intent_generation.sql"
    ),
    "utf8"
  );
}

describe("ownership transfer intent generation (0073, static)", () => {
  it("creates durable intent storage and one active transfer per warehouse", () => {
    const sql = migration();
    expect(sql).toContain(
      "create table if not exists public.ownership_transfer_intents"
    );
    expect(sql).toContain("ownership_generation bigint not null default 0");
    expect(sql).toContain("where status in ('prepared', 'submitted')");
    expect(sql).toContain("expires_at timestamptz not null");
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain(
      "alter table public.ownership_transfer_intents enable row level security"
    );
    expect(sql).toContain(
      "revoke all on table public.ownership_transfer_intents from anon, authenticated"
    );
  });

  it("locks parties and rejects stale or conflicting generations", () => {
    const sql = migration();
    expect(sql).toContain(
      "create or replace function public.prepare_ownership_transfer_intent"
    );
    expect(sql).toContain("for update;");
    expect(sql).toContain("OWNERSHIP_INTENT_CONFLICT");
    expect(sql).toContain("superseded");
    expect(sql).toContain("STALE_GENERATION");
    expect(sql).toContain(
      "create or replace function public.confirm_ownership_transfer_intent"
    );
    expect(sql).toContain(
      "ownership_generation = v_intent.ownership_generation"
    );
  });

  it("keeps intent transitions service-only and auditable", () => {
    const sql = migration();
    for (const fn of [
      "prepare_ownership_transfer_intent",
      "get_active_ownership_transfer_intent",
      "record_ownership_transfer_tx",
      "fail_ownership_transfer_intent",
      "confirm_ownership_transfer_intent",
      "cleanup_ownership_transfer_intents",
    ]) {
      expect(sql).toContain(`grant execute on function public.${fn}`);
    }
    expect(sql).toContain("private.write_audit");
    expect(sql).toContain("'ownership_generation'");
    expect(sql).toContain("intent_id");
  });
});
