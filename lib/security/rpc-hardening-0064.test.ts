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
    name: "create_warehouse_and_deployment",
    oldSignature:
      "public.create_warehouse_and_deployment(text, text, text, text, text, text, bigint, text, bigint, bigint, text, text)",
    newSignature:
      "public.create_warehouse_and_deployment(text, text, text, text, text, text, bigint, text, bigint, bigint, text, text, uuid)",
  },
  {
    name: "update_warehouse_deployment_status",
    oldSignature:
      "public.update_warehouse_deployment_status(uuid, text, text, text)",
    newSignature:
      "public.update_warehouse_deployment_status(uuid, text, text, text, uuid)",
  },
  {
    name: "rollback_warehouse_creation",
    oldSignature: "public.rollback_warehouse_creation(uuid, text)",
    newSignature: "public.rollback_warehouse_creation(uuid, text, uuid)",
  },
];

function readRepositoryFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function migration(): string {
  return readRepositoryFile(
    "supabase/migrations/0064_warehouse_deployment_service_boundary.sql"
  );
}

function route(): string {
  return readRepositoryFile("app/api/warehouses/create/route.ts");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("warehouse deployment service boundary (0064, static)", () => {
  it("drops every old signature and creates actor-appended replacements", () => {
    const sql = migration();

    for (const contract of functionContracts) {
      expect(sql).toContain(`drop function if exists ${contract.oldSignature}`);
      expect(sql).toContain(
        `create or replace function public.${contract.name}`
      );
    }

    expect(sql.match(/p_actor_user_id uuid/gi)).toHaveLength(3);
    expect(sql.match(/security definer/gi)).toHaveLength(3);
    expect(sql.match(/set search_path = ''/gi)).toHaveLength(3);
    expect(sql).not.toMatch(/auth\.uid\s*\(\s*\)/i);
    expect(sql).toContain(
      "returns table (created_warehouse_id uuid, created_deployment_id uuid)"
    );
    expect(sql).toContain("returns public.warehouse_deployments");
    expect(sql).toContain("returns void");
  });

  it("closes direct warehouse inserts before the service RPC cutover", () => {
    const sql = migration();

    expect(sql).toContain(
      "revoke insert on table public.warehouses from authenticated;"
    );
    expect(sql).toContain(
      "drop policy if exists warehouses_insert_own on public.warehouses;"
    );
  });

  it("revokes old and new signatures and grants only service_role", () => {
    const sql = migration();

    for (const contract of functionContracts) {
      expect(sql).toContain(
        `revoke execute on function ${contract.oldSignature} from public, anon, authenticated;`
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
  });

  it("keeps create and lifecycle invariants inside the database functions", () => {
    const sql = migration();

    expect(sql).toContain("verification_state = 'verified'");
    expect(sql).toContain("w.is_primary");
    expect(sql).toContain("idempotency key is required");
    expect(sql).toContain("deployment signature is required");
    expect(sql).toMatch(
      /from public\.warehouse_deployments[\s\S]*?for update;/i
    );
    expect(sql).toContain(
      "v_previous_status = 'pending' and v_next_status = 'submitted'"
    );
    expect(sql).toContain(
      "v_previous_status = 'submitted' and v_next_status in ('confirmed', 'failed')"
    );
    expect(sql).toContain("confirmed deployment cannot regress");
    expect(sql).toContain("^0x[0-9a-f]{64}$");
    expect(sql).toContain("delete from public.warehouses");
    expect(sql).not.toContain("delete from public.warehouse_deployments");
    expect(sql.match(/perform private\.write_audit\(\s*null,/gi)).toHaveLength(
      3
    );
  });

  it("routes deployment writes through one service client with explicit actors", () => {
    const source = route();

    expect(source).toContain('from "@/lib/supabase/service"');
    expect(source).toContain("const service = createServiceClient();");
    expect(source).toMatch(/supabase\s*\.from\("warehouses"\)/);
    expect(source).toMatch(/supabase\s*\.from\("warehouse_deployments"\)/);
    expect(source).not.toContain("service.from");

    for (const contract of functionContracts) {
      if (contract.name === "rollback_warehouse_creation") {
        expect(source).not.toContain(
          'service.rpc("rollback_warehouse_creation"'
        );
        continue;
      }
      expect(source).toMatch(
        new RegExp(`service\\.rpc\\(\\s*["']${escapeRegExp(contract.name)}["']`)
      );
      expect(source).not.toMatch(
        new RegExp(
          `supabase\\.rpc\\(\\s*["']${escapeRegExp(contract.name)}["']`
        )
      );
    }

    expect(source).toMatch(/p_actor_user_id:\s*(?:auth\.user\.id|actorUserId)/);
  });
});
