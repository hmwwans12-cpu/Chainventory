import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration(): string {
  return readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "0066_identity_rbac_wallet_hardening.sql"
    ),
    "utf8"
  );
}

function section(source: string, name: string, nextName?: string): string {
  const normalized = source.toLowerCase();
  const start = normalized.indexOf(
    `create or replace function public.${name.toLowerCase()}`
  );
  const end = nextName
    ? normalized.indexOf(
        `create or replace function public.${nextName.toLowerCase()}`,
        start
      )
    : normalized.indexOf("revoke all on function", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("identity, RBAC, and wallet hardening (0066, static)", () => {
  it("locks transfer state and rejects a null OWNER role", () => {
    const sql = migration();
    const fn = section(sql, "transfer_ownership");

    expect(fn).toContain("set search_path = ''");
    expect(fn).toMatch(/from public\.warehouses[\s\S]*?for update;/i);
    expect(fn).toMatch(/from public\.memberships[\s\S]*?for update;/i);
    expect(fn).toMatch(/v_actor_role is null[\s\S]*?v_actor_role <> 'OWNER'/i);
    expect(fn).toMatch(
      /update public\.memberships[\s\S]*?set role = 'OWNER'[\s\S]*?status = 'ACTIVE'[\s\S]*?returning \* into v_target_membership;/i
    );
    expect(fn).toMatch(
      /update public\.warehouses[\s\S]*?owner_user_id = v_actor_id[\s\S]*?contract_address is null[\s\S]*?returning name into v_wh_name;/i
    );
    expect(fn).toContain("warehouse_deployed_use_onchain_transfer");
    expect(fn).toContain("warehouse_deployment_pending");
    expect(fn).toContain("ownership_transferred");
    expect(fn).toContain("private.write_notification");
  });

  it("makes users fields immutable except the intended profile columns", () => {
    const sql = migration();

    expect(sql).toContain(
      "revoke insert, update, delete on table public.users from anon, authenticated;"
    );
    expect(sql).toContain(
      "revoke update (email, privy_user_id, notification_preferences)"
    );
    expect(sql).toContain(
      "grant update (display_name, avatar_url)\n  on table public.users to authenticated;"
    );
    expect(sql).not.toMatch(
      /grant update\s*\([^)]*(email|privy_user_id|notification_preferences)/i
    );
  });

  it("binds invitation acceptance to auth.users and keeps retries idempotent", () => {
    const sql = migration();
    const fn = section(sql, "accept_invitation", "transfer_ownership");

    expect(fn).toContain("set search_path = ''");
    expect(fn).toMatch(/from auth\.users/i);
    expect(fn).not.toMatch(/from public\.users/i);
    expect(fn).toMatch(/from public\.invitations[\s\S]*?for update;/i);
    expect(fn).toMatch(
      /from public\.warehouses[\s\S]*?status is distinct from 'active'/i
    );
    expect(fn).toContain("status = 'ACTIVE'");
    expect(fn).toContain("on conflict (warehouse_id, user_id) do update");
    expect(fn).toContain(
      "revoke all on function public.accept_invitation(text) from public, anon, authenticated;"
    );
    expect(fn).toContain(
      "grant execute on function public.accept_invitation(text) to authenticated;"
    );
  });

  it("uses a service-only Privy binding RPC", () => {
    const fn = section(
      migration(),
      "bind_privy_user",
      "upsert_notification_preferences"
    );

    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path = ''");
    expect(fn).toContain(
      "revoke all on function public.bind_privy_user(uuid, text) from public, anon, authenticated;"
    );
    expect(fn).toContain(
      "grant execute on function public.bind_privy_user(uuid, text) to service_role;"
    );
  });

  it("removes direct authenticated warehouse updates and the broad policy", () => {
    const sql = migration();

    expect(sql).toContain(
      "revoke update on table public.warehouses from authenticated;"
    );
    expect(sql).toContain(
      "drop policy if exists warehouses_update_own on public.warehouses;"
    );
    expect(sql).not.toContain("create policy warehouses_update_own");
  });
});
