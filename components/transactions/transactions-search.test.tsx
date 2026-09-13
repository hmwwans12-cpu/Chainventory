import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TransactionsPage } from "@/components/transactions/transactions-page";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/transactions",
  useSearchParams: () => new URLSearchParams("warehouse=w1"),
}));

const warehouses: WarehouseSummary[] = [
  {
    id: "w1",
    name: "W1",
    code: "W1",
    contractAddress: null,
    role: "OWNER",
    joinedAt: "2026-09-01T00:00:00.000Z",
    status: "active",
    lastActivityAt: "2026-09-01T00:00:00.000Z",
  },
];

function renderPage(query: string) {
  return render(
    <TransactionsPage
      warehouseId="w1"
      warehouses={warehouses}
      role="OWNER"
      items={[]}
      page={1}
      totalPages={1}
      totalCount={0}
      type={undefined}
      proof={undefined}
      query={query}
    />
  );
}

/**
 * Temuan audit #25: pencarian transactions harus commit ?q= ke URL
 * (server-side via RPC) dan reset ke halaman 1 — bukan filter frontend.
 */
describe("TransactionsPage search", () => {
  beforeEach(() => {
    replace.mockClear();
  });
  it("mengetik lalu debounce me-replace URL dengan q + page reset", () => {
    vi.useFakeTimers();
    try {
      renderPage("");
      const input = screen.getByLabelText("Search transactions");
      fireEvent.change(input, { target: { value: "PO-123" } });
      expect(replace).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(replace).toHaveBeenCalledTimes(1);
      const url = String(replace.mock.calls[0][0]);
      expect(url).toContain("q=PO-123");
      expect(url).not.toContain("page=");
    } finally {
      vi.useRealTimers();
    }
  });

  it("tidak navigasi saat mount bila query sudah ter-commit", () => {
    vi.useFakeTimers();
    try {
      renderPage("PO-123");
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(replace).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("empty state membedakan mode pencarian", () => {
    const { unmount } = renderPage("zzz-tidak-ada");
    expect(
      screen.getByText("No transactions match your filters")
    ).toBeTruthy();
    unmount();
    renderPage("");
    expect(screen.getByText("No transactions yet")).toBeTruthy();
  });
});
