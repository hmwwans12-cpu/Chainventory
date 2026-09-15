import { render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProductsPage } from "@/components/inventory/products-page";
import type { ProductRow } from "@/lib/inventory/types";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/inventory/products",
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Temuan audit #19: tabel desktop dan card-list mobile HARUS sepakat soal
 * badge Low Stock untuk data yang sama. Keduanya render di DOM yang sama
 * (yang satu disembunyikan CSS), jadi satu render cukup untuk mengunci
 * paritas kedua jalur.
 */
function row(
  id: string,
  patch: Partial<ProductRow> & { status: ProductRow["status"] },
): ProductRow {
  return {
    id,
    sku: `SKU-${id}`,
    name: `Product ${id}`,
    category: "Cat",
    unit: "pcs",
    lowStockThreshold: "10",
    description: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    quantity: "50",
    balanceVersion: 1,
    movementCount: 0,
    ...patch,
  } as ProductRow;
}

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

function namesWith(container: HTMLElement, text: string): string[] {
  return within(container)
    .getAllByText(text, { exact: false })
    .map(
      (el) =>
        el
          .closest("tr, li")
          ?.querySelector("input")
          ?.getAttribute("aria-label") ?? "?",
    );
}

describe("ProductsPage low-stock parity desktop/mobile", () => {
  it("sinyal low-stock identik di tabel dan card-list untuk data edge", () => {
    const products = [
      row("low", { status: "active", quantity: "5" }), // rendah: badge + suffix
      row("ok", { status: "active", quantity: "50" }), // aman
      row("archived", { status: "archived", quantity: "0" }), // arsip dikecualikan
      row("no-threshold", {
        status: "active",
        quantity: "1",
        lowStockThreshold: "0",
      }),
      row("no-balance", { status: "active", quantity: null }),
      row("decimal", {
        status: "active",
        quantity: "10.0",
        lowStockThreshold: "10",
      }),
    ];
    const { container } = render(
      <ProductsPage
        warehouseId="w1"
        warehouses={warehouses}
        role="OWNER"
        products={products}
        query=""
        statusFilter="all"
      />,
    );
    const table = container.querySelector("table") as HTMLElement;
    const list = container.querySelector("ul") as HTMLElement;
    expect(table).toBeTruthy();
    expect(list).toBeTruthy();
    // Desktop: Badge "Low Stock" — hanya "low" dan "decimal".
    expect(namesWith(table, "Low Stock").sort()).toEqual([
      "Select Product decimal",
      "Select Product low",
    ]);
    // Mobile: suffix "· Low stock" — himpunan yang SAMA.
    expect(namesWith(list, "Low stock").sort()).toEqual([
      "Select Product decimal",
      "Select Product low",
    ]);
  });
});
