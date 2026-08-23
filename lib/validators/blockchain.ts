import { z } from "zod";

/**
 * Validators untuk blockchain page server flow (proof retry).
 * Dipakai di Route Handler `/api/warehouses/blockchain/proofs`.
 */
export const proofRetrySchema = z.object({
  proofId: z.string().uuid("Invalid proof id."),
});
