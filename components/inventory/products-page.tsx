"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  FileUp,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Download,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { PanelCard } from "@/components/shared/panel-card";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/auth/permissions";
import { switchWarehouseUrl } from "@/lib/warehouses/warehouse-url";
import type { ProductRow } from "@/lib/inventory/types";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";
import {
  CreateProductDialog,
  EditProductDialog,
  ArchiveProductDialog,
  StockMovementDialog,
  ProductDetailSheet,
} from "@/components/inventory/product-dialogs";
import { BulkAddDialog } from "@/components/inventory/bulk-add-dialog";
import { archiveProduct } from "@/lib/inventory/products-client";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";

export function ProductsPage({
  warehouseId,
  warehouses,
  role,
  products,
  query,
  statusFilter = "active",
  page = 1,
  perPage = 12,
  total = 0,
}: {
  warehouseId: string;
  warehouses: WarehouseSummary[];
  role: Role;
  products: ProductRow[];
  query: string;
  statusFilter?: "active" | "archived" | "all";
  page?: number;
  perPage?: number;
  total?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // P2-04: satu tempat membangun URL query produk (q + warehouse + status)
  // — sebelumnya logika ini ditulis ulang di tiga titik dan rawan inkonsisten.
  // P0#2: pertahankan `page` agar search/filter tidak me-reset paginasi ke 1.
  const [isPending, startTransition] = React.useTransition();
  const applyFilters = React.useCallback(
    (nextQuery: string, nextStatus: "active" | "archived" | "all") => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      else params.delete("q");
      if (warehouseId) params.set("warehouse", warehouseId);
      else params.delete("warehouse");
      if (nextStatus !== "active") params.set("status", nextStatus);
      else params.delete("status");
      params.delete("page");
      const qs = params.toString();
      // Tampilkan spinner pencarian: navigasi server dijalankan sebagai
      // transition agar isPending mencerminkan loading (audit UX).
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams, warehouseId, startTransition]
  );

  const setStatus = (value: "active" | "archived" | "all") => {
    applyFilters(query, value);
  };

  const [searchInput, setSearchInput] = React.useState(query);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<ProductRow | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<ProductRow | null>(
    null
  );
  const [stockTarget, setStockTarget] = React.useState<{
    product: ProductRow;
    type: "stock_in" | "stock_out";
  } | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<ProductRow | null>(
    null
  );

  // Bulk selection (audit: bulk actions)
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allVisibleSelected =
    products.length > 0 && products.every((p) => selected.has(p.id));
  const toggleSelectAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.size && products.every((p) => next.has(p.id))) {
        products.forEach((p) => next.delete(p.id));
      } else {
        products.forEach((p) => next.add(p.id));
      }
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const archiveSelected = async () => {
    if (!canArchive || selected.size === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        [...selected].map((id) => archiveProduct(warehouseId, id))
      );
      toast.add({
        type: "success",
        title: "Products archived",
        description: `${selected.size} product(s) archived.`,
      });
      clearSelection();
      refresh();
    } catch {
      toast.add({
        type: "error",
        title: "Could not archive all products",
        description: "Some products may not have been archived.",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const exportSelected = () => {
    if (!canExport || selected.size === 0) return;
    const ids = [...selected].join(",");
    const url = `/api/warehouses/export?type=products&warehouseId=${encodeURIComponent(
      warehouseId
    )}&ids=${encodeURIComponent(ids)}`;
    window.open(url, "_blank");
  };

  // Pindah halaman (pagination) — reset scroll, pertahankan q/status/warehouse.
  const goToPage = React.useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next <= 1) params.delete("page");
      else params.set("page", String(next));
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  // Aksi per-produk (dropdown) — dipakai di tabel desktop & card list mobile
  // supaya tidak duplikasi markup (audit: mobile card-list).
  const renderActions = (product: ProductRow) => {
    const archived = product.status === "archived";
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${product.name}`}
            />
          }
        >
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetailTarget(product)}>
            <Eye aria-hidden="true" />
            View
          </DropdownMenuItem>
          {canEdit ? (
            <DropdownMenuItem onClick={() => setEditTarget(product)}>
              <Pencil aria-hidden="true" />
              Edit
            </DropdownMenuItem>
          ) : null}
          {!archived && canStockIn ? (
            <DropdownMenuItem
              onClick={() => setStockTarget({ product, type: "stock_in" })}
            >
              <ArrowDownToLine aria-hidden="true" />
              Stock In
            </DropdownMenuItem>
          ) : null}
          {!archived && canStockOut ? (
            <DropdownMenuItem
              onClick={() => setStockTarget({ product, type: "stock_out" })}
            >
              <ArrowUpFromLine aria-hidden="true" />
              Stock Out
            </DropdownMenuItem>
          ) : null}
          {!archived && canArchive ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setArchiveTarget(product)}
            >
              <Trash2 aria-hidden="true" />
              Archive
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const canCreate = hasPermission(role, PERMISSIONS.PRODUCT_CREATE);
  const canEdit = hasPermission(role, PERMISSIONS.PRODUCT_EDIT);
  const canArchive = hasPermission(role, PERMISSIONS.PRODUCT_ARCHIVE);
  const canBulk = hasPermission(role, PERMISSIONS.PRODUCT_BULK_IMPORT);
  const canExport = hasPermission(role, PERMISSIONS.PRODUCT_EXPORT);
  const canStockIn = hasPermission(role, PERMISSIONS.STOCK_IN);
  const canStockOut = hasPermission(role, PERMISSIONS.STOCK_OUT);

  // Search — debounced, diteruskan ke URL (?q=) sehingga pencarian tetap
  // berjalan di server (Supabase ilike), bukan filter frontend.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      applyFilters(searchInput, statusFilter ?? "active");
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, warehouseId, statusFilter]);

  const refresh = () => router.refresh();

  const switchWarehouse = (id: string) => {
    if (id === warehouseId) return;
    // P2-01: helper terpusat — preserve q/status, reset param warehouse-dependent.
    router.replace(switchWarehouseUrl(pathname, searchParams, id));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products…"
              className="pl-8"
              aria-label="Search products"
            />
            {isPending ? (
              <Loader2
                aria-hidden="true"
                className="text-muted-foreground absolute top-1/2 right-2 size-3.5 -translate-y-1/2 animate-spin"
              />
            ) : searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                aria-label="Clear search"
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none rounded absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center before:absolute before:-inset-2 before:content-['']"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            ) : null}
          </div>
          {warehouses.length > 1 ? (
            <Select
              value={warehouseId}
              onValueChange={(value) => {
                if (value !== null) switchWarehouse(value);
              }}
            >
              <SelectTrigger size="sm" aria-label="Warehouse">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              if (value !== null)
                setStatus(value as "active" | "archived" | "all");
            }}
          >
            <SelectTrigger aria-label="Product status filter">
              <span className="text-muted-foreground mr-1 hidden sm:inline">
                Status:
              </span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {canExport ? (
            <Button
              variant="outline"
              render={
                <a
                  href={`/api/warehouses/export?type=products&warehouseId=${warehouseId}`}
                  download
                />
              }
            >
              <ArrowDownToLine aria-hidden="true" />
              Export CSV
            </Button>
          ) : null}
          {canBulk ? (
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <FileUp aria-hidden="true" />
              Bulk Add
            </Button>
          ) : null}
          {canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              Add Product
            </Button>
          ) : null}
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={query ? "No products found" : "No products yet."}
          description={
            query
              ? `Nothing matches "${query}". Try a different search.`
              : "Start adding products to manage your warehouse inventory."
          }
          primaryAction={
            query
              ? { label: "Clear search", onClick: () => setSearchInput("") }
              : canCreate
                ? { label: "Add Product", onClick: () => setCreateOpen(true) }
                : undefined
          }
          secondaryAction={
            !query && canBulk
              ? { label: "Bulk Add", onClick: () => setBulkOpen(true) }
              : undefined
          }
        />
      ) : (
        <>
        {selected.size > 0 && (canArchive || canExport) ? (
          <div className="bg-card sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 shadow-sm">
            <span className="text-sm font-medium tabular-nums">
              {selected.size} selected
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canExport ? (
                <Button variant="outline" size="sm" onClick={exportSelected}>
                  <Download aria-hidden="true" />
                  Export
                </Button>
              ) : null}
              {canArchive ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={archiveSelected}
                  disabled={bulkBusy}
                >
                  {bulkBusy ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Trash2 aria-hidden="true" />
                  )}
                  Archive
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                <X aria-hidden="true" />
                Clear
              </Button>
            </div>
          </div>
        ) : null}

        <PanelCard padding="none">
          {/* Desktop: tabel (scroll horizontal terbatas) */}
          <div className="hidden md:block overflow-x-auto">
          <Table className="md:min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all products on this page"
                    className="border-border focus-visible:ring-ring size-4 cursor-pointer rounded accent-[var(--primary)] focus-visible:outline-none focus-visible:ring-2"
                  />
                </TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="hidden xl:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Unit</TableHead>
                <TableHead className="text-right">Current Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Updated</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const archived = product.status === "archived";
                const low =
                  !archived &&
                  product.quantity != null &&
                  Number(product.lowStockThreshold) > 0 &&
                  Number(product.quantity) <= Number(product.lowStockThreshold);
                return (
                  <TableRow
                    key={product.id}
                    data-state={archived ? "selected" : undefined}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(product.id)}
                        onChange={() => toggleSelect(product.id)}
                        aria-label={`Select ${product.name}`}
                        className="border-border focus-visible:ring-ring size-4 cursor-pointer rounded accent-[var(--primary)] focus-visible:outline-none focus-visible:ring-2"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-foreground font-medium">
                          {product.name}
                        </span>
                        <span className="text-muted-foreground font-mono text-xs">
                          {product.sku}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden xl:table-cell">
                      {product.category ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell">
                      {product.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span
                          className={`font-mono text-sm tabular-nums ${low ? "text-warning" : ""}`}
                        >
                          {product.quantity ?? "0"}
                        </span>
                        {low ? (
                          <span className="text-warning text-xs">
                            Low stock
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={archived ? "inactive" : "success"}
                        label={archived ? "Archived" : "Active"}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs tabular-nums md:table-cell">
                      {formatDate(product.updatedAt)}
                    </TableCell>
                    <TableCell>{renderActions(product)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
          {/* Mobile: card list ergonomis (audit: mobile card-list) */}
          <ul className="divide-y md:hidden">
            {products.map((product) => {
              const archived = product.status === "archived";
              const low =
                !archived &&
                product.quantity != null &&
                Number(product.lowStockThreshold) > 0 &&
                Number(product.quantity) <= Number(product.lowStockThreshold);
              return (
                <li
                  key={product.id}
                  className="flex items-start justify-between gap-3 p-4"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(product.id)}
                    onChange={() => toggleSelect(product.id)}
                    aria-label={`Select ${product.name}`}
                    className="border-border focus-visible:ring-ring mt-1 size-4 shrink-0 cursor-pointer rounded accent-[var(--primary)] focus-visible:outline-none focus-visible:ring-2"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground truncate font-medium">
                        {product.name}
                      </span>
                      <StatusBadge
                        tone={archived ? "inactive" : "success"}
                        label={archived ? "Archived" : "Active"}
                      />
                    </div>
                    <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                      {product.sku}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {product.category ?? "—"} · {product.unit}
                    </p>
                    <p className="mt-1 text-sm tabular-nums">
                      <span
                        className={
                          low ? "text-warning font-mono" : "text-foreground font-mono"
                        }
                      >
                        {product.quantity ?? "0"}
                      </span>{" "}
                      <span className="text-muted-foreground text-xs">
                        in stock
                      </span>
                      {low ? (
                        <span className="text-warning text-xs"> · Low stock</span>
                      ) : null}
                    </p>
                  </div>
                  {renderActions(product)}
                </li>
              );
            })}
          </ul>
        </PanelCard>
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(total / perPage))}
          onPage={goToPage}
        />
        </>
      )}

      {createOpen ? (
        <CreateProductDialog
          warehouseId={warehouseId}
          open
          onOpenChange={setCreateOpen}
          onCreated={refresh}
        />
      ) : null}
      {bulkOpen ? (
        <BulkAddDialog
          warehouseId={warehouseId}
          open
          onOpenChange={setBulkOpen}
          onImported={refresh}
        />
      ) : null}
      {editTarget ? (
        <EditProductDialog
          product={editTarget}
          open={Boolean(editTarget)}
          onOpenChange={(open) => {
            setEditTarget(open ? editTarget : null);
          }}
          onUpdated={refresh}
        />
      ) : null}
      {archiveTarget ? (
        <ArchiveProductDialog
          warehouseId={warehouseId}
          product={archiveTarget}
          open={Boolean(archiveTarget)}
          onOpenChange={(open) => {
            setArchiveTarget(open ? archiveTarget : null);
          }}
          onArchived={refresh}
        />
      ) : null}
      {stockTarget ? (
        <StockMovementDialog
          warehouseId={warehouseId}
          products={products}
          product={stockTarget.product}
          movementType={stockTarget.type}
          open={Boolean(stockTarget)}
          onOpenChange={(open) => {
            setStockTarget(open ? stockTarget : null);
          }}
          onSuccess={refresh}
        />
      ) : null}
      {detailTarget ? (
        <ProductDetailSheet
          warehouseId={warehouseId}
          product={detailTarget}
          open={Boolean(detailTarget)}
          onOpenChange={(open) => {
            setDetailTarget(open ? detailTarget : null);
          }}
        />
      ) : null}
    </div>
  );
}
