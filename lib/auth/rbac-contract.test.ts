import { describe, expect, it } from "vitest";

import { canAssignRole, type Role } from "@/lib/auth/permissions";

/**
 * RBAC contract test: TS `canAssignRole` vs SQL `private.can_assign_role`.
 *
 * SQL security-definer `private.can_assign_role` (migration 0005/0008) adalah
 * satu-satunya sumber kebenaran enforcement. TS matrix hanyalah duplikat untuk
 * UX pre-check. Test ini membandingkan hasil keduanya untuk SELURUH kombinasi
 * role (5×5=25) terhadap database LIVE — drift otomatis gagal di CI, bukan
 * ditemukan manual.
 *
 * Butuh env (SERVER-ONLY, tidak pernah ke browser):
 *   SUPABASE_MANAGEMENT_TOKEN  → Management API token
 *   SUPABASE_PROJECT_REF       → project ref (mis. yxsieqqiksqckfrqozlb)
 *
 * Tanpa keduanya test di-skip (tidak butuh DB di CI unit biasa).
 */

const MGMT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

const ROLES: Role[] = ["OWNER", "MANAGER", "STAFF", "AUDITOR", "VIEWER"];

async function sqlCanAssignRole(actor: Role, target: Role): Promise<boolean> {
  const resp = await fetch(
    `https://api.supabase.com/v1/projects/${REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MGMT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `select private.can_assign_role('${actor}', '${target}') as ok;`,
      }),
    }
  );
  const text = await resp.text();
  if (!resp.ok && resp.status !== 201) {
    throw new Error(`Management API ${resp.status}: ${text.slice(0, 300)}`);
  }
  const rows = JSON.parse(text);
  return rows?.[0]?.ok === true;
}

const available = Boolean(MGMT_TOKEN && REF);

(available ? describe : describe.skip)(
  "RBAC contract: TS canAssignRole vs SQL private.can_assign_role",
  () => {
    it("matches for all 5×5 role combinations", async () => {
      const mismatches: string[] = [];
      for (const actor of ROLES) {
        for (const target of ROLES) {
          const ts = canAssignRole(actor, target);
          const sql = await sqlCanAssignRole(actor, target);
          if (ts !== sql) {
            mismatches.push(`${actor}->${target}: TS=${ts} SQL=${sql}`);
          }
        }
      }
      expect(mismatches).toEqual([]);
    }, 30000);
  }
);

if (!available) {
  describe("RBAC contract (skipped)", () => {
    it("needs SUPABASE_MANAGEMENT_TOKEN + SUPABASE_PROJECT_REF to run", () => {
      // Hanya penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
