import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MovementDetailSheet } from "@/components/inventory/movement-detail-sheet";
import type { MovementListItem } from "@/lib/inventory/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/providers/locale-provider", () => ({
  useLocale: () => ({ t: (key: string) => key, locale: "en" }),
}));

vi.mock("@/components/ui/toast", () => ({
  toast: { add: vi.fn() },
}));

function movement(patch: Partial<MovementListItem> = {}): MovementListItem {
  return {
    id: "m-1",
    movementType: "stock_in",
    quantity: "10",
    status: "committed",
    reason: null,
    reference: null,
    actorWallet: null,
    expectedBalanceVersion: 1,
    created_at: "2026-09-01T00:00:00.000Z",
    productName: "Rod",
    productSku: "R-1",
    unit: "pcs",
    proofStatus: "failed",
    proofTxHash: null,
    proofError: "boom",
    proofId: "p-1",
    ...patch,
  };
}

describe("MovementDetailSheet proof retry", () => {
  it("shows retry for failed proofs and calls the given endpoint", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const onRetrySuccess = vi.fn();
    try {
      render(
        <MovementDetailSheet
          movement={movement()}
          open
          onOpenChange={() => undefined}
          retryEndpoint="/api/warehouses/proofs/p-1/retry"
          onRetrySuccess={onRetrySuccess}
        />
      );
      fireEvent.click(screen.getByText("movements.proof_retry"));
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/warehouses/proofs/p-1/retry",
          expect.objectContaining({ method: "POST" })
        );
      });
      expect(onRetrySuccess).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("hides retry without an endpoint", () => {
    render(
      <MovementDetailSheet
        movement={movement()}
        open
        onOpenChange={() => undefined}
      />
    );
    expect(screen.queryByText("movements.proof_retry")).toBeNull();
  });

  it("hides retry for confirmed proofs even with an endpoint", () => {
    render(
      <MovementDetailSheet
        movement={movement({ proofStatus: "confirmed", proofTxHash: "0xabc" })}
        open
        onOpenChange={() => undefined}
        retryEndpoint="/api/warehouses/proofs/p-1/retry"
      />
    );
    expect(screen.queryByText("movements.proof_retry")).toBeNull();
  });
});
