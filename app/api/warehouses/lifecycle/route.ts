import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { warehouseLifecycleSchema } from "@/lib/validators/warehouse";
import {
  forbidden,
  fromPostgrestError,
  invalid,
  json,
  notFound,
  ok,
  readJson,
  requireRateLimit,
  requireUser,
} from "@/lib/api-handler";

/**
 * POST /api/warehouses/lifecycle — suspend/reactivate warehouse oleh owner
 * (self-service, RPC 0074 `set_warehouse_status`).
 *
 * Suspend membebaskan slot "satu active per owner" sehingga owner bisa
 * deploy warehouse baru (mis. migrasi v1 treasury → v2 wallet-paid) tanpa
 * SQL mentah. Mutasi warehouse suspended tetap ditolak guard C-02 di
 * semua route — tidak ada jalan memutar.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  const rateLimited = await requireRateLimit(
    "warehouse-lifecycle",
    auth.user.id,
    request
  );
  if (rateLimited) return rateLimited;

  const raw = await readJson(request);
  if (!raw.ok) return invalid("Invalid JSON body.");
  const parsed = warehouseLifecycleSchema.safeParse(raw.body);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  // Pre-check owner via RLS owner-only (non-owner → null → 403). RPC
  // mengikat ulang via p_actor_user_id (trust boundary 0061).
  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id, status")
    .eq("id", parsed.data.warehouseId)
    .eq("owner_user_id", auth.user.id)
    .maybeSingle();
  if (!warehouse) {
    return forbidden("Only the warehouse owner can change its status.");
  }

  const targetStatus =
    parsed.data.action === "suspend" ? "suspended" : "active";
  if (warehouse.status === targetStatus) {
    return invalid(
      parsed.data.action === "suspend"
        ? "Warehouse is already suspended."
        : "Warehouse is already active."
    );
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("set_warehouse_status", {
    p_warehouse_id: parsed.data.warehouseId,
    p_status: targetStatus,
    p_actor_user_id: auth.user.id,
  });
  if (error) {
    const message = error.message ?? "";
    if (/only owner/i.test(message)) {
      return forbidden("Only the warehouse owner can change its status.");
    }
    if (/another active warehouse exists/i.test(message)) {
      return json(
        {
          ok: false,
          error: "You already have another active warehouse. Suspend it first.",
          errorCode: "CONFLICT",
        },
        409
      );
    }
    if (/warehouse not found/i.test(message)) {
      return notFound("Warehouse not found.");
    }
    return fromPostgrestError(message);
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    id: string;
    status: string;
  };
  return ok({ id: row.id, status: row.status });
}
