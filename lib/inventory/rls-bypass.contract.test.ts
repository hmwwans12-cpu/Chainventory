import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Kontrak RLS bypass (TODO P3; live-env, auto-skip tanpa env).
 *
 * Klien ANONIM (publishable key tanpa JWT user) TIDAK BOLEH:
 *  - INSERT baris products langsung (RLS tolak -> 401/403)
 *  - SELECT produk warehouse lain (hasil harus array kosong)
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

describe.skipIf(!available)("RLS bypass via anon client", () => {
  it("anon TIDAK bisa insert products dan TIDAK bisa membaca lintas tenant", async () => {
    const whId = randomUUID();
    const userId = randomUUID();

    // Setup: warehouse + membership owner + satu produk (service role).
    const setup = await send(
      "/rest/v1/warehouses",
      {
        method: "POST",
        prefer: "return=minimal",
        body: [
          {
            id: whId,
            name: `RLS-BYPASS-${Date.now()}`,
            code: `RLS${randomUUID().slice(0, 8).toUpperCase()}`,
            owner_id: userId,
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

    try {
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
    }
  }, 20_000);
});
