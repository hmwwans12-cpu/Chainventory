import { hasPermission, PERMISSIONS, type Role } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { forbidden, getMemberRole, requireUser } from "@/lib/api-handler";
import { toCsv } from "@/lib/inventory/csv";
import { logger } from "@/lib/logger";

/**
 * CSV Export berbasis permission — SELESAI (DESIGN §36 round-trip + §84.5 encoding).
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
    let productsQuery = supabase
      .from("products")
      .select(
        "sku, name, category, unit, description, low_stock_threshold, status"
      )
      .eq("warehouse_id", warehouseId);

    // Bulk export: filter ke id terpilih (audit: bulk actions).
    const idsParam = url.searchParams.get("ids");
    if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((x) => x.trim())
        .filter((x) => /^[0-9a-f-]{36}$/i.test(x));
      if (ids.length) productsQuery = productsQuery.in("id", ids);
    }

    const { data, error } = await productsQuery
      .order("sku")
      .limit(EXPORT_ROW_CAP + 1);

    if (error) {
      logger.warn({ err: error.message }, "products export query failed");
      return new Response("Export failed.", { status: 500 });
    }

    // Deteksi truncation: bila rows > cap, berarti ada data yang tidak ikut.
    const truncated = (data?.length ?? 0) > EXPORT_ROW_CAP;
    if (truncated) data?.splice(EXPORT_ROW_CAP);

    const matrix = [
      [
        "SKU",
        "Name",
        "Category",
        "Unit",
        "Description",
        "Low Stock Threshold",
        "Status",
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
    return csvResponse(
      matrix,
      `products-${warehouseId.slice(0, 8)}.csv`,
      truncated
    );
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
    .limit(EXPORT_ROW_CAP + 1);

  if (error) {
    logger.warn({ err: error.message }, "movements export query failed");
    return new Response("Export failed.", { status: 500 });
  }

  const movTruncated = (data?.length ?? 0) > EXPORT_ROW_CAP;
  if (movTruncated) data?.splice(EXPORT_ROW_CAP);

  const matrix = [
    [
      "Created At (UTC)",
      "Type",
      "Product SKU",
      "Quantity",
      "Status",
      "Actor Wallet",
      "Reason",
      "Reference",
    ],
    ...(data ?? []).map((m) => [
      fmtUtc(m.created_at),
      humanType(m.movement_type),
      skuOf(m),
      String(m.quantity ?? ""),
      m.status ?? "",
      m.actor_wallet ?? "",
      m.reason ?? "",
      m.reference ?? "",
    ]),
  ];
  return csvResponse(
    matrix,
    `movements-${warehouseId.slice(0, 8)}.csv`,
    movTruncated
  );
}

/** ISO timestamptz -> "YYYY-MM-DD HH:mm:ss" (UTC, detik) untuk Excel/CSV. */
function fmtUtc(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function humanType(type: string | null | undefined): string {
  switch (type) {
    case "stock_in":
      return "Stock In";
    case "stock_out":
      return "Stock Out";
    case "adjustment":
      return "Adjustment";
    case "reversal":
      return "Reversal";
    default:
      return type ?? "";
  }
}

function skuOf(row: unknown): string {
  const products = (
    row as { products?: { sku?: string } | { sku?: string }[] | null }
  )?.products;
  if (Array.isArray(products)) return products[0]?.sku ?? "";
  return products?.sku ?? "";
}

function csvResponse(
  matrix: string[][],
  filename: string,
  truncated = false
): Response {
  // BOM UTF-8 agar Excel membaca file sebagai UTF-8. Catatan: baris hint
  // "sep=," SENGAJA tidak dipakai — ia tidak reliable ketika BOM mendahuluinya,
  // dan tampil sebagai baris sampah. Untuk Excel locale Indonesia (pemisah
  // ";"), buka via Data > From Text/CSV, atau ubah List separator di Region.
  const body = "\uFEFF" + toCsv(matrix);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Export-Truncated": truncated ? "true" : "false",
    },
  });
}
