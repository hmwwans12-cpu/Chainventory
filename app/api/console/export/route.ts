import { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getConsoleActor } from "@/lib/console/guard";
import { createProofServiceClient } from "@/lib/proof/supabase";
import { csvFilename, toCsv } from "@/lib/console/csv";
import { invalid, serverError } from "@/lib/api-handler";

/**
 * Export DB → CSV (Developer Console).
 *
 * Hanya dua tabel yang diekspor: `proofs` dan `audit_logs`. Kolom dipilih
 * eksplisit — kolom sensitif (proofs.payload jsonb yang bisa memuat actor
 * wallet, dst.) TIDAK pernah diekspor. Akses digate allowlist server-side.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const actor = await getConsoleActor(supabase);
  if (!actor.ok) return actor.res;

  const table = request.nextUrl.searchParams.get("table");
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? 5000);
  const limit = Math.min(
    Math.max(Number.isFinite(limitParam) ? limitParam : 5000, 1),
    10_000
  );

  const service = createProofServiceClient();

  try {
    if (table === "proofs") {
      const { data, error } = await service
        .from("proofs")
        .select(
          "id, created_at, updated_at, warehouse_id, warehouse_address, movement_id, payload_hash, payload_version, status, tx_hash, confirmation_count, attempt_count, error"
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return serverError(error.message);
      return csvResponse(
        toCsv((data ?? []) as Record<string, unknown>[]),
        csvFilename("proofs")
      );
    }

    if (table === "audit_logs") {
      const { data, error } = await service
        .from("audit_logs")
        .select(
          "id, created_at, warehouse_id, actor_user_id, action, entity, entity_id, status, related_tx_hash, before_state, after_state"
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return serverError(error.message);
      return csvResponse(
        toCsv((data ?? []) as Record<string, unknown>[]),
        csvFilename("audit-logs")
      );
    }

    return invalid(
      "Unknown export table. Use ?table=proofs or ?table=audit_logs."
    );
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "export failed");
  }
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
