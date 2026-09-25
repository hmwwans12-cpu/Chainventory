import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration(): string {
  return readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "0070_p2_rbac_bounds_and_idempotency.sql"
    ),
    "utf8"
  );
}

describe("P2 database boundary hardening (0070, static)", () => {
  it("normalizes profile email and prevents archive aggregate locks", () => {
    const sql = migration();
    expect(sql).toContain("lower(coalesce(new.email, ''))");
    expect(sql).toContain("where email is distinct from lower(email)");
    expect(sql).toContain("select quantity into v_balance_qty");
    expect(sql).toContain(
      "revoke execute on function public.archive_product(uuid, uuid) from public, anon, authenticated;"
    );
  });

  it("does not let invitation acceptance overwrite an existing membership", () => {
    const sql = migration();
    const functionStart = sql.indexOf(
      "create or replace function public.accept_invitation"
    );
    const functionEnd = sql.indexOf(
      "create or replace function private.revoke_invites_for_membership_change",
      functionStart
    );
    const fn = sql.slice(functionStart, functionEnd);
    expect(fn).toContain("on conflict (warehouse_id, user_id) do nothing");
    expect(fn).not.toContain("on conflict (warehouse_id, user_id) do update");
    expect(sql).toContain("invitations_pending_warehouse_email_idx");
    expect(sql).toContain(
      "perform private.ensure_warehouse_active(p_warehouse_id)"
    );
  });

  it("bounds transaction pagination and uses stable ordering", () => {
    const sql = migration();
    expect(sql).toContain(
      "v_per_page integer := least(greatest(coalesce(p_per_page, 20), 1), 100)"
    );
    expect(sql).toContain("order by sm.created_at desc, sm.id desc");
    expect(sql).toContain("left(");
    expect(sql).toContain("stock_movements_warehouse_created_id_idx");
    expect(sql).toContain("guard_warehouse_delete_dependencies");
    expect(sql).toContain(
      "warehouse has dependent data; manual recovery required"
    );
  });

  it("closes legacy product mutation RPC grants", () => {
    const sql = migration();
    expect(sql).toContain(
      "revoke execute on function public.create_product_rpc(uuid, text, text, text, text, text, numeric) from public, anon, authenticated;"
    );
    expect(sql).toContain(
      "grant execute on function public.update_product_rpc(uuid, uuid, text, text, text, text, text, numeric, uuid) to service_role;"
    );
    expect(sql).toContain(
      "grant execute on function public.archive_product(uuid, uuid, uuid) to service_role;"
    );
    expect(sql).toContain(
      "grant execute on function public.create_invitation_for_user(uuid, text, text, uuid) to service_role;"
    );
    expect(sql).toContain(
      "revoke execute on function public.create_invitation(uuid, text, text) from public, anon, authenticated;"
    );
    expect(sql).toContain(
      "grant execute on function public.register_wallet_for_user(uuid, text, text) to service_role;"
    );
    expect(sql).toContain(
      "revoke execute on function public.register_wallet(text, text) from public, anon, authenticated;"
    );
  });
});
