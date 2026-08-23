import { hasPermission, PERMISSIONS, type Role } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { forbidden, getMemberRole, requireUser } from "@/lib/api-handler";
import { toCsv } from "@/lib/inventory/csv";
import { logger } from "@/lib/logger";

/**
 * CSV Export berbasis permission (TODO P2; DESIGN §36 round-trip).
 * Read-only: guard order standar lalu streaming teks sederhana.
 * GET /api/warehouses/export?type=products|movements&warehouseId=<uuid>
 */

const EXPORT_ROW_CAP = 5_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const warehouseId = url.searchParams.get("warehouseId");

  if (
    (type !== "products" && type !== "movements") ||
    !warehouseId ||
    !/^[0-9a-f-]{36}$/i.test(warehouseId)
  ) {
    return new Response("Invalid export parameters.", { status: 400 });
  }

  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  const role = await getMemberRole(supabase, warehouseId, auth.user.id);
  if (!role) return forbidden("Not a member of this warehouse.");

  if (type === "products") {
    if (!hasPermission(role as Role, PERMISSIONS.PRODUCT_EXPORT)) {
      return forbidden("Insufficient permission.");
    }
    const { data, error } = await supabase
      .from("products")
      .select(
        "sku, name, category, unit, description, low_stock_threshold, status"
      )
      .eq("warehouse_id", warehouseId)
      .order("sku")
      .limit(EXPORT_ROW_CAP);

    if (error) {
      logger.warn({ err: error.message }, "products export query failed");
      return new Response("Export failed.", { status: 500 });
    }

    const matrix = [
      [
        "sku",
        "name",
        "category",
        "unit",
        "description",
        "low_stock_threshold",
        "status",
      ],
      ...(data ?? []).map((p) => [
        p.sku ?? "",
        p.name ?? "",
        p.category ?? "",
        p.unit ?? "",
        p.description ?? "",
        String(p.low_stock_threshold ?? ""),
        p.status ?? "",
      ]),
    ];
    return csvResponse(matrix, `products-${warehouseId.slice(0, 8)}.csv`);
  }

  // movements
  if (!hasPermission(role as Role, PERMISSIONS.MOVEMENT_READ)) {
    return forbidden("Insufficient permission.");
  }
  const { data, error } = await supabase
    .from("stock_movements")
    .select(
      "created_at, movement_type, quantity, status, reason, reference, actor_wallet, products(sku)"
    )
    .eq("warehouse_id", warehouseId)
    .order("created_at", { ascending: false })
    .limit(EXPORT_ROW_CAP);

  if (error) {
    logger.warn({ err: error.message }, "movements export query failed");
    return new Response("Export failed.", { status: 500 });
  }

  const matrix = [
    [
      "created_at",
      "type",
      "product_sku",
      "quantity",
      "status",
      "actor_wallet",
      "reason",
      "reference",
    ],
    ...(data ?? []).map((m) => [
      m.created_at ?? "",
      m.movement_type ?? "",
      skuOf(m),
      String(m.quantity ?? ""),
      m.status ?? "",
      m.actor_wallet ?? "",
      m.reason ?? "",
      m.reference ?? "",
    ]),
  ];
  return csvResponse(matrix, `movements-${warehouseId.slice(0, 8)}.csv`);
}

function skuOf(row: unknown): string {
  const products = (
    row as { products?: { sku?: string } | { sku?: string }[] | null }
  )?.products;
  if (Array.isArray(products)) return products[0]?.sku ?? "";
  return products?.sku ?? "";
}

function csvResponse(matrix: string[][], filename: string): Response {
  return new Response(toCsv(matrix), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
