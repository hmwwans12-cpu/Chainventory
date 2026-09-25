import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "@/lib/supabase/service";

export type OwnershipIntentReconcileResult = {
  ok: boolean;
  processed: number;
  error?: string;
};

export async function reconcileOwnershipTransferIntents(
  service: SupabaseClient = createServiceClient()
): Promise<OwnershipIntentReconcileResult> {
  const { data, error } = await service.rpc(
    "cleanup_ownership_transfer_intents"
  );
  if (error) {
    return { ok: false, processed: 0, error: error.message };
  }
  const value = Array.isArray(data) ? data[0] : data;
  return { ok: true, processed: Number(value ?? 0) };
}
