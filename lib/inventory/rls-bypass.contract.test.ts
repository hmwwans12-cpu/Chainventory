import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Kontrak RLS bypass (TODO P3; live-env, auto-skip tanpa env).
 *
 * 1. Klien ANONIM (publishable key tanpa JWT user) TIDAK BOLEH:
 *  - INSERT baris products langsung (RLS tolak -> 401/403)
 *  - SELECT produk warehouse lain (hasil harus array kosong)
 *
 * 2. ATTACKER TERAUTHENTIKASI (audit 0.1.5 P0-03): STAFF/MANAGER TIDAK
 * BOLEH mutate products via PostgREST langsung (BFF-only mutation,
 * migration 0037 — privilege INSERT/UPDATE/DELETE di-revoke):
 *  - authenticated direct INSERT product -> FAIL
 *  - authenticated direct UPDATE product -> FAIL
 *  - authenticated direct archive/unarchive -> FAIL
 *  - cross-warehouse SELECT non-member -> array kosong
 *
 * Setup memakai service role. Butuh env (SERVER-ONLY):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY.
 */

const BASE = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;

const available = Boolean(BASE && SECRET && PUBLISHABLE);

interface SupaSendInit {
  method?: string;
  body?: unknown;
  prefer?: string;
}

async function send(
  path: string,
  init: SupaSendInit,
  apiKey: string,
  bearer?: string
): Promise<{ status: number; text: string }> {
  const resp = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${bearer ?? apiKey}`,
      "Content-Type": "application/json",
      ...(init.prefer ? { Prefer: init.prefer } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: resp.status, text: await resp.text() };
}

/** Buat user auth nyata via Admin API (trigger bootstrap public.users). */
async function createTestUser(): Promise<{
  id: string;
  email: string;
  password: string;
}> {
  const email = `rls-test-${Date.now()}-${randomUUID().slice(0, 6)}@chainventory.test`;
  const password = `Pw-${randomUUID()}!aA1`;
  const created = await send(
    "/auth/v1/admin/users",
    {
      method: "POST",
      body: { email, password, email_confirm: true },
    },
    SECRET!
  );
  if (created.status >= 400)
    throw new Error(`admin create user: ${created.text.slice(0, 200)}`);
  return {
    id: (JSON.parse(created.text) as { id: string }).id,
    email,
    password,
  };
}

async function deleteUser(id: string): Promise<void> {
  await send(`/auth/v1/admin/users/${id}`, { method: "DELETE" }, SECRET!).catch(
    () => undefined
  );
}

describe.skipIf(!available)("RLS bypass via anon client", () => {
  it("anon TIDAK bisa insert products dan TIDAK bisa membaca lintas tenant", async () => {
    const whId = randomUUID();
    const owner = await createTestUser();

    try {
      // Setup: warehouse + satu produk (service role).
      const setup = await send(
        "/rest/v1/warehouses",
        {
          method: "POST",
          prefer: "return=minimal",
          body: [
            {
              id: whId,
              name: `RLS-BYPASS-${Date.now()}`,
              warehouse_code: `RLS${randomUUID().slice(0, 8).toUpperCase()}`,
              owner_user_id: owner.id,
              on_chain_owner_wallet:
                "0x0000000000000000000000000000000000000000",
              status: "active",
            },
          ],
        },
        SECRET!
      );
      if (setup.status >= 400)
        throw new Error(`setup warehouse: ${setup.text.slice(0, 200)}`);

      const product = await send(
        "/rest/v1/products",
        {
          method: "POST",
          prefer: "return=minimal",
          body: [
            {
              warehouse_id: whId,
              sku: `RLS-${randomUUID().slice(0, 8)}`,
              name: "Secret Product",
              unit: "pcs",
            },
          ],
        },
        SECRET!
      );
      expect(product.status).toBeLessThan(300);

      // 1) Anon INSERT harus ditolak RLS.
      const insert = await send(
        "/rest/v1/products",
        {
          method: "POST",
          prefer: "return=minimal",
          body: [
            { warehouse_id: whId, sku: "HACK-1", name: "Hack", unit: "pcs" },
          ],
        },
        PUBLISHABLE!
      );
      expect(insert.status).toBeGreaterThanOrEqual(400);

      // 2) Anon SELECT lintas tenant harus kosong.
      const select = await send(
        `/rest/v1/products?warehouse_id=eq.${whId}&select=id`,
        {},
        PUBLISHABLE!
      );
      expect(select.status).toBeLessThan(300);
      expect(JSON.parse(select.text || "[]")).toEqual([]);
    } finally {
      // Cleanup terurut (anak dulu).
      await send(
        `/rest/v1/products?warehouse_id=eq.${whId}`,
        { method: "DELETE" },
        SECRET!
      );
      await send(
        "/rest/v1/memberships?warehouse_id=eq." + whId,
        { method: "DELETE" },
        SECRET!
      ).catch(() => undefined);
      await send(
        `/rest/v1/warehouses?id=eq.${whId}`,
        { method: "DELETE" },
        SECRET!
      );
      await deleteUser(owner.id);
    }
  }, 20_000);
});

describe.skipIf(!available)(
  "RLS bypass via authenticated attacker (P0-03)",
  () => {
    it.each(["STAFF", "MANAGER"] as const)(
      "%s direct mutation products harus ditolak database (BFF-only)",
      async (role) => {
        const whId = randomUUID();

        // 1. Buat user attacker via Admin API (service role).
        const attacker = await createTestUser();
        const attackerId = attacker.id;

        try {
          // 2. Sign-in untuk dapat JWT attacker.
          const signin = await send(
            "/auth/v1/token?grant_type=password",
            {
              method: "POST",
              body: { email: attacker.email, password: attacker.password },
            },
            PUBLISHABLE!
          );
          if (signin.status >= 400)
            throw new Error(`attacker sign-in: ${signin.text.slice(0, 200)}`);
          const token = (JSON.parse(signin.text) as { access_token: string })
            .access_token;

          // 3. Setup warehouse + membership attacker + satu produk (service role).
          const setup = await send(
            "/rest/v1/warehouses",
            {
              method: "POST",
              prefer: "return=minimal",
              body: [
                {
                  id: whId,
                  name: `RLS-AUTH-${Date.now()}`,
                  warehouse_code: `RLA${randomUUID().slice(0, 8).toUpperCase()}`,
                  owner_user_id: attackerId,
                  on_chain_owner_wallet:
                    "0x0000000000000000000000000000000000000000",
                  status: "active",
                },
              ],
            },
            SECRET!
          );
          if (setup.status >= 400)
            throw new Error(`setup warehouse: ${setup.text.slice(0, 200)}`);

          // Membership role eksplisit; bila trigger sudah membuat OWNER row,
          // gagal insert tidak fatal — yang diuji adalah privilege global.
          await send(
            "/rest/v1/memberships",
            {
              method: "POST",
              prefer: "return=minimal",
              body: [
                {
                  warehouse_id: whId,
                  user_id: attackerId,
                  role,
                  status: "ACTIVE",
                },
              ],
            },
            SECRET!
          ).catch(() => undefined);

          const product = await send(
            "/rest/v1/products",
            {
              method: "POST",
              prefer: "return=representation",
              body: [
                {
                  warehouse_id: whId,
                  sku: `RLS-${randomUUID().slice(0, 8)}`,
                  name: "Target Product",
                  unit: "pcs",
                },
              ],
            },
            SECRET!
          );
          if (product.status >= 400)
            throw new Error(`setup product: ${product.text.slice(0, 200)}`);
          const productId = (JSON.parse(product.text)[0] as { id: string }).id;

          try {
            // 4. Direct INSERT product -> WAJIB gagal (privilege revoked, 0037).
            const insert = await send(
              "/rest/v1/products",
              {
                method: "POST",
                prefer: "return=minimal",
                body: [
                  {
                    warehouse_id: whId,
                    sku: "HACK-A",
                    name: "Hack",
                    unit: "pcs",
                  },
                ],
              },
              PUBLISHABLE!,
              token
            );
            expect(insert.status).toBeGreaterThanOrEqual(400);

            // 5. Direct UPDATE biasa -> WAJIB gagal.
            const update = await send(
              `/rest/v1/products?id=eq.${productId}`,
              {
                method: "PATCH",
                prefer: "return=minimal",
                body: { name: "Renamed by attacker" },
              },
              PUBLISHABLE!,
              token
            );
            expect(update.status).toBeGreaterThanOrEqual(400);

            // 6. Direct archive (status -> archived) -> WAJIB gagal (P0-02).
            const archive = await send(
              `/rest/v1/products?id=eq.${productId}`,
              {
                method: "PATCH",
                prefer: "return=minimal",
                body: { status: "archived" },
              },
              PUBLISHABLE!,
              token
            );
            expect(archive.status).toBeGreaterThanOrEqual(400);

            // 7. Direct unarchive dari archived -> WAJIB gagal juga.
            await send(
              `/rest/v1/products?id=eq.${productId}`,
              {
                method: "PATCH",
                prefer: "return=minimal",
                body: { status: "archived" },
              },
              SECRET!
            );
            const unarchive = await send(
              `/rest/v1/products?id=eq.${productId}`,
              {
                method: "PATCH",
                prefer: "return=minimal",
                body: { status: "active" },
              },
              PUBLISHABLE!,
              token
            );
            expect(unarchive.status).toBeGreaterThanOrEqual(400);

            // 8. Cross-warehouse SELECT non-member lain -> array kosong.
            const otherWh = randomUUID();
            const crossSelect = await send(
              `/rest/v1/products?warehouse_id=eq.${otherWh}&select=id`,
              {},
              PUBLISHABLE!,
              token
            );
            expect(crossSelect.status).toBeLessThan(300);
            expect(JSON.parse(crossSelect.text || "[]")).toEqual([]);
          } finally {
            await send(
              `/rest/v1/products?warehouse_id=eq.${whId}`,
              { method: "DELETE" },
              SECRET!
            );
          }
        } finally {
          await send(
            `/rest/v1/memberships?warehouse_id=eq.${whId}`,
            { method: "DELETE" },
            SECRET!
          ).catch(() => undefined);
          await send(
            `/rest/v1/warehouses?id=eq.${whId}`,
            { method: "DELETE" },
            SECRET!
          ).catch(() => undefined);
          await send(
            `/auth/v1/admin/users/${attackerId}`,
            { method: "DELETE" },
            SECRET!
          ).catch(() => undefined);
        }
      },
      30_000
    );
  }
);
