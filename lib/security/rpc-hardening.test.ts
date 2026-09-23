import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression lock statis untuk hardening trust-boundary RPC
 * (audit v3: migrasi 0061_rpc_trust_boundary_hardening.sql).
 *
 * Akar masalah: verifikasi berat di Next.js route, RPC SECURITY DEFINER
 * yang di-GRANT ke `authenticated` tidak menegakkan ulang — pemanggilan
 * RPC langsung via Data API mem-bypass route (termasuk rate-limit).
 * Test ini mengunci guard di level definisi SQL agar tidak terhapus
 * diam-diam oleh migrasi berikutnya. Perilaku runtime diuji live di
 * `rpc-hardening.contract.test.ts` (auto-skip tanpa env server).
 */
function migration0061(): string {
  // process.cwd() = root repo saat vitest dijalankan (CI maupun lokal).
  return readFileSync(
    join(
      process.cwd(),
      "supabase",
      "migrations",
      "0061_rpc_trust_boundary_hardening.sql"
    ),
    "utf8"
  );
}

describe("rpc trust-boundary hardening (0061, statis)", () => {
  it("transfer_ownership menolak warehouse deployed (v3 §2, Fix A5 di DB)", () => {
    const sql = migration0061();
    expect(sql).toContain("warehouse_deployed_use_onchain_transfer");
    expect(sql).toMatch(
      /where id = p_warehouse_id and contract_address is not null/
    );
  });

  it("signature lama yang longgar di-DROP (tidak tetap callable)", () => {
    const sql = migration0061();
    expect(sql).toContain("drop function if exists public.verify_wallet(uuid)");
    expect(sql).toContain("drop function if exists public.proof_retry(uuid)");
    expect(sql).toContain(
      "drop function if exists public.confirm_ownership_transfer(uuid, uuid, text)"
    );
  });

  it("verify_wallet / proof_retry / confirm_ownership_transfer hanya service_role", () => {
    const sql = migration0061();
    for (const fn of [
      "public.verify_wallet(uuid, uuid)",
      "public.proof_retry(uuid, uuid)",
      "public.confirm_ownership_transfer(uuid, uuid, text, uuid)",
    ]) {
      expect(sql).toContain(`revoke all on function ${fn} from authenticated`);
      expect(sql).toContain(`grant execute on function ${fn} to service_role`);
      expect(sql).not.toMatch(
        new RegExp(
          `grant execute on function ${fn.replace(/[()]/g, (c) => `\\${c}`)} to authenticated`
        )
      );
    }
  });

  it("RPC service_role-only menerima actor eksplisit untuk audit", () => {
    const sql = migration0061();
    expect(sql).toContain("p_user_id uuid");
    expect(sql).toContain("p_actor_user_id uuid");
  });

  it("set_warehouse_contract_address: format 0x + one-way latch (v2 §2.3)", () => {
    const sql = migration0061();
    expect(sql).toContain("^0x[0-9a-f]{40}$");
    expect(sql).toContain("invalid contract address");
    expect(sql).toContain("contract address already recorded");
  });
});
