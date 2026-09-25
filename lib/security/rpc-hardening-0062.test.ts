import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression lock statis untuk 0062 (tutup front-run
 * `set_warehouse_contract_address` sisa 0061).
 *
 * 0061 menambahkan format + latch tetapi masih GRANT ke `authenticated`
 * → first-write-wins: owner bisa mengunci address palsu sebelum
 * finalizeIfMined sah. 0062 memindahkan ke pola BFF-only yang sama
 * seperti verify_wallet / proof_retry / confirm_ownership_transfer.
 */
function migration0062(): string {
  return readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "0062_set_contract_address_service_role.sql"
    ),
    "utf8"
  );
}

describe("rpc trust-boundary hardening (0062, statis)", () => {
  it("signature lama (uuid, text) di-DROP agar tidak tetap callable", () => {
    const sql = migration0062();
    expect(sql).toContain(
      "drop function if exists public.set_warehouse_contract_address(uuid, text)"
    );
  });

  it("signature baru (uuid, text, uuid) hanya service_role", () => {
    const sql = migration0062();
    const fn = "public.set_warehouse_contract_address(uuid, text, uuid)";
    expect(sql).toContain(`revoke all on function ${fn} from authenticated`);
    expect(sql).toContain(`grant execute on function ${fn} to service_role`);
    expect(sql).not.toMatch(
      new RegExp(
        `grant execute on function ${fn.replace(/[()]/g, (c) => `\\${c}`)} to authenticated`
      )
    );
  });

  it("menerima actor eksplisit + mempertahankan format & latch 0061", () => {
    const sql = migration0062();
    expect(sql).toContain("p_actor_user_id uuid");
    expect(sql).toContain("actor required");
    expect(sql).toContain("^0x[0-9a-f]{40}$");
    expect(sql).toContain("invalid contract address");
    expect(sql).toContain("not owner of warehouse");
    expect(sql).toContain("contract address already recorded");
  });
});
