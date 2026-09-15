import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MovementsPage } from "@/components/inventory/movements-page";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";

const replace = vi.fn();
let mockQs = "warehouse=w1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/inventory/movements",
  useSearchParams: () => new URLSearchParams(mockQs),
}));

// Realtime tidak boleh menyentuh network di jsdom: rantai openChannel
// diputus di sini (pola sama dengan use-warehouse-realtime.test.tsx).
vi.mock("@/lib/realtime/channel", () => ({
  openChannel: () => ({
    on: function () {
      return this;
    },
    subscribe: () => () => {},
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ removeChannel: vi.fn().mockResolvedValue({}) }),
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
    <MovementsPage
      warehouseId="w1"
      warehouses={warehouses}
      role="OWNER"
      products={[]}
      initialMovements={[]}
      query={query}
    />,
  );
}

/**
 * Temuan audit #25: pencarian movements harus commit ?q= ke URL
 * (server-side) dan tidak me-reset/menavigasi saat mount.
 */
describe("MovementsPage search", () => {
  beforeEach(() => {
    replace.mockClear();
    mockQs = "warehouse=w1";
  });

  it("mengetik lalu debounce me-replace URL dengan q", () => {
    vi.useFakeTimers();
    try {
      renderPage("");
      const input = screen.getByLabelText("Search movements");
      fireEvent.change(input, { target: { value: "PO-9" } });
      expect(replace).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(replace).toHaveBeenCalledTimes(1);
      expect(String(replace.mock.calls[0][0])).toContain("q=PO-9");
    } finally {
      vi.useRealTimers();
    }
  });

  it("tidak navigasi saat mount bila query sudah ter-commit", () => {
    mockQs = "warehouse=w1&q=PO-9";
    vi.useFakeTimers();
    try {
      renderPage("PO-9");
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
    expect(screen.getByText("No movements match your search")).toBeTruthy();
    unmount();
    renderPage("");
    expect(screen.getByText("No movements recorded yet")).toBeTruthy();
  });

  it("locale id merender empty-state ID dengan param tersubstitusi", () => {
    document.cookie = "locale=id";
    try {
      render(
        <LocaleProvider initialLocale="id">
          <MovementsPage
            warehouseId="w1"
            warehouses={warehouses}
            role="OWNER"
            products={[]}
            initialMovements={[]}
            query="PO-9"
          />
        </LocaleProvider>,
      );
      expect(
        screen.getByText(
          "Tidak ada pergerakan yang cocok dengan pencarian Anda",
        ),
      ).toBeTruthy();
      expect(screen.queryByText(/\{query\}/)).toBeNull();
    } finally {
      document.cookie = "locale=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
  });
});
