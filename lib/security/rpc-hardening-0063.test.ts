import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration(): string {
  return readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "0063_relational_rbac_and_race_hardening.sql"
    ),
    "utf8"
  );
}

function functionSection(
  source: string,
  name: string,
  nextName?: string
): string {
  const normalized = source.toLowerCase();
  const start = normalized.indexOf(
    `create or replace function public.${name.toLowerCase()}`
  );
  const end = nextName
    ? normalized.indexOf(
        `create or replace function public.${nextName.toLowerCase()}`,
        start
      )
    : normalized.indexOf("revoke execute", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("relational RBAC and race hardening (0063, static)", () => {
  it("locks the target and authorizes both its current and requested roles", () => {
    const fn = functionSection(
      migration(),
      "update_member_role",
      "archive_product"
    );

    expect(fn).toMatch(/from public\.memberships[\s\S]*?for update;/i);
    expect(fn).toContain("v_actor_role := private.member_role");
    expect(fn).toMatch(/if v_actor_role is null then/i);
    expect(fn).toContain(
      "private.can_assign_role(v_actor_role, v_target.role)"
    );
    expect(fn).toContain("private.can_assign_role(v_actor_role, p_role)");
    expect(fn).toContain("membership_role_changed");
  });

  it("rejects missing roles and inactive warehouses before archive locks", () => {
    const fn = functionSection(
      migration(),
      "archive_product",
      "enforce_product_status_role"
    );

    expect(fn).toMatch(
      /v_role is null or v_role not in \('MANAGER', 'OWNER'\)/i
    );
    expect(fn).toMatch(/from public\.warehouses[\s\S]*?and status = 'active'/i);
    expect(fn).toMatch(/from public\.products[\s\S]*?for update;/i);
    expect(fn).toMatch(/from public\.inventory_balances[\s\S]*?for update;/i);
  });

  it("rejects null roles for user status changes without changing service bypass", () => {
    const fn = functionSection(
      migration(),
      "enforce_product_status_role",
      "update_product_rpc"
    );

    expect(fn).toContain(
      "if v_jwt_role = 'authenticated' or v_is_anonymous then"
    );
    expect(fn).toMatch(
      /v_role is null or v_role not in \('MANAGER', 'OWNER'\)/i
    );
    expect(fn).toContain("anonymous sessions cannot change product status");
    expect(migration()).not.toContain("enforce_warehouse_identity_immutable");
  });

  it("locks products before status checks and keeps active tenant predicates", () => {
    const fn = functionSection(migration(), "update_product_rpc");

    expect(fn).toMatch(/from public\.products[\s\S]*?for update;/i);
    expect(fn).toMatch(/v_product\.status <> 'active'/i);
    expect(fn).toMatch(
      /update public\.products[\s\S]*?where id = p_product_id\s+and warehouse_id = p_warehouse_id\s+and status = 'active'/i
    );
  });

  it("revokes only the obsolete three-argument archive signature", () => {
    const sql = migration();

    expect(sql).toMatch(
      /revoke execute on function public\.archive_product\(uuid,\s*uuid,\s*uuid\)\s+from public,\s*anon,\s*authenticated;/i
    );
    expect(sql).not.toMatch(
      /revoke execute on function public\.archive_product\(uuid,\s*uuid\)/i
    );
    expect(sql).not.toMatch(
      /revoke execute on function public\.update_member_role\(uuid,\s*uuid,\s*text\)/i
    );
    expect(sql).not.toMatch(
      /revoke execute on function public\.update_product_rpc\(uuid,\s*uuid,\s*text,\s*text,\s*text,\s*text,\s*text,\s*numeric\)/i
    );
  });
});
