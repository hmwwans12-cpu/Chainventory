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
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { EntityName } from "@/components/shared/entity-name";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { PanelCard } from "@/components/shared/panel-card";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/auth/permissions";
import { useSwitchWarehouse } from "@/lib/warehouses/use-switch-warehouse";
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
import { isLowStock } from "@/lib/inventory/low-stock";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";

export function ProductsPage({
  warehouseId,
  warehouses,
  role,
  products,
  query,
  statusFilter = "active",
  categoryFilter = "",
  categories = [],
  page = 1,
  perPage = 12,
  total = 0,
  paginationDisabled = false,
}: {
  warehouseId: string;
  statusFilter: "active" | "archived" | "all";
  categoryFilter?: string;
  categories?: string[];
  role: Role;
  products: ProductRow[];
  query: string;
  warehouses: WarehouseSummary[];
  page?: number;
  perPage?: number;
  total?: number;
  /**
   * Audit v0.3.0 §2.4: saat count query gagal, pagination tidak boleh
   * muncul dengan angka palsu (0). Pagination di-hide + banner ditampilkan.
   */
  paginationDisabled?: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // P2-04: satu tempat membangun URL query produk (q + warehouse + status
  // + category) — sebelumnya logika ini ditulis ulang di tiga titik dan
  // rawan inkonsisten. Hapus `page` agar filter/search baru mulai dari
  // halaman 1.
  const [isPending, startTransition] = React.useTransition();
  const applyFilters = React.useCallback(
    (
      nextQuery: string,
      nextStatus: "active" | "archived" | "all",
      nextCategory: string,
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      else params.delete("q");
      if (warehouseId) params.set("warehouse", warehouseId);
      else params.delete("warehouse");
      if (nextStatus !== "active") params.set("status", nextStatus);
      else params.delete("status");
      if (nextCategory.trim()) params.set("category", nextCategory.trim());
      else params.delete("category");
      params.delete("page");
      const qs = params.toString();
      // Guard anti-loop: jangan replace ke query string identik. Tanpa ini,
      // effect debounce di bawah menembak ulang setiap kali searchParams
      // berganti identitas object (walau URL sama) → replace berulang →
      // isPending/spinner permanen + fetch server berulang.
      if (qs === searchParams.toString()) return;
      // Tampilkan spinner pencarian: navigasi server dijalankan sebagai
      // transition agar isPending mencerminkan loading (audit UX).
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams, warehouseId, startTransition],
  );

  const setStatus = (value: "active" | "archived" | "all") => {
    applyFilters(query, value, categoryFilterRef.current ?? "");
  };

  const setCategory = (value: string) => {
    applyFilters(query, statusFilter, value);
  };

  const [searchInput, setSearchInput] = React.useState(query);
  // Sinkronkan input bila `q` URL berubah dari luar (back/forward button).
  // Aman dari clobber saat mengetik: hanya berjalan saat prop query berubah,
  // dan setelah commit nilainya selalu sama dengan input.
  React.useEffect(() => {
    setSearchInput(query);
  }, [query]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<ProductRow | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<ProductRow | null>(
    null,
  );
  const [stockTarget, setStockTarget] = React.useState<{
    product: ProductRow;
    type: "stock_in" | "stock_out";
  } | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<ProductRow | null>(
    null,
  );

  // Bulk selection (audit: bulk actions)
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [confirmBulkArchive, setConfirmBulkArchive] = React.useState(false);
  const [bulkCategoryOpen, setBulkCategoryOpen] = React.useState(false);
  const [bulkCategoryValue, setBulkCategoryValue] = React.useState("");
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
      const allVisible = products.every((p) => prev.has(p.id));
      if (allVisible) {
        const next = new Set(prev);
        products.forEach((p) => next.delete(p.id));
        return next;
      }
      const next = new Set(prev);
      products.forEach((p) => next.add(p.id));
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  const archiveSelected = async () => {
    if (!canArchive || selected.size === 0) return;
    setBulkBusy(true);
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) => archiveProduct(warehouseId, id)),
    );
    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.ok,
    ).length;
    const failed = results.length - succeeded;
    if (failed === 0) {
      toast.add({
        type: "success",
        title: t("products.toast_archived_title"),
        description: t("products.toast_archived_desc", {
          count: String(succeeded),
        }),
      });
      clearSelection();
      refresh();
    } else if (succeeded > 0) {
      toast.add({
        type: "warning",
        title: t("products.toast_partial_title"),
        description:
          failed === 1
            ? t("products.toast_partial_desc_one", {
                succeeded: String(succeeded),
                failed: String(failed),
              })
            : t("products.toast_partial_desc_other", {
                succeeded: String(succeeded),
                failed: String(failed),
              }),
      });
      // Keep selection for retry, but refresh to reflect partial success
      refresh();
    } else {
      toast.add({
        type: "error",
        title: t("products.toast_archive_failed_title"),
        description: t("products.toast_archive_failed_desc"),
      });
    }
    setBulkBusy(false);
  };

  const exportSelected = () => {
    if (!canExport || selected.size === 0) return;
    const ids = [...selected];
    const url = `/api/warehouses/export?type=products&warehouseId=${encodeURIComponent(
      warehouseId,
    )}&ids=${encodeURIComponent(ids.join(","))}`;
    window.open(url, "_blank");
    toast.add({
      type: "info",
      title: t("products.toast_export_title"),
      description:
        ids.length === 1
          ? t("products.toast_export_desc_one", {
              count: String(ids.length),
            })
          : t("products.toast_export_desc_other", {
              count: String(ids.length),
            }),
    });
  };

  const bulkChangeCategory = async () => {
    if (!canEdit || selected.size === 0 || !bulkCategoryValue.trim()) return;
    setBulkBusy(true);
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) =>
        // reuse updateProduct with only category change — keep other fields.
        // Audit v0.3.11 M-18: throw on non-OK so Promise.allSettled's
        // "rejected" status correctly counts network/HTTP failures. The
        // previous version always resolved (`.then(r => r.json())`),
        // which made 4xx/5xx responses invisible to the partial-update
        // count below and gave the user a false "all updated" success.
        fetch("/api/warehouses/inventory/products", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: id,
            category: bulkCategoryValue.trim(),
          }),
        }).then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(
              (body as { error?: string })?.error ??
                `HTTP ${r.status} for product ${id}`,
            );
          }
          return r.json();
        }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    setBulkBusy(false);
    setBulkCategoryOpen(false);
    setBulkCategoryValue("");
    if (failed === 0) {
      toast.add({
        type: "success",
        title: t("products.toast_bulk_updated_title", {
          count: String(ids.length),
        }),
        description: t("products.toast_bulk_updated_desc", {
          category: bulkCategoryValue.trim(),
        }),
      });
      clearSelection();
      refresh();
    } else {
      toast.add({
        type: "warning",
        title: t("products.toast_partial_update_title"),
        description: t("products.toast_partial_update_desc", {
          updated: String(ids.length - failed),
          failed: String(failed),
        }),
      });
      refresh();
    }
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
    [pathname, router, searchParams],
  );

  // Aksi per-produk (dropdown) — dipakai di tabel desktop & card list mobile
  // supaya tidak duplikasi markup (audit: mobile card-list).
  const renderActions = (
    product: ProductRow,
    mode: "dropdown" | "inline" = "dropdown",
  ) => {
    const archived = product.status === "archived";
    const inlineStockActions = !archived && (canStockIn || canStockOut);
    if (mode === "inline" && inlineStockActions) {
      return (
        <div className="flex items-center gap-1.5">
          {canStockIn && !archived ? (
            <Button
              size="sm"
              onClick={() => setStockTarget({ product, type: "stock_in" })}
              aria-label={t("products.stock_in_aria", {
                name: product.name,
              })}
            >
              <ArrowDownToLine aria-hidden="true" />
              {t("products.stock_in")}
            </Button>
          ) : null}
          {canStockOut && !archived ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStockTarget({ product, type: "stock_out" })}
              aria-label={t("products.stock_out_aria", {
                name: product.name,
              })}
            >
              <ArrowUpFromLine aria-hidden="true" />
              {t("products.stock_out")}
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("products.more_actions_for_aria", {
                    name: product.name,
                  })}
                />
              }
            >
              <MoreHorizontal aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDetailTarget(product)}>
                <Eye aria-hidden="true" />
                {t("products.view")}
              </DropdownMenuItem>
              {canEdit ? (
                <DropdownMenuItem onClick={() => setEditTarget(product)}>
                  <Pencil aria-hidden="true" />
                  {t("products.edit")}
                </DropdownMenuItem>
              ) : null}
              {canArchive && !archived ? (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setArchiveTarget(product)}
                >
                  <Trash2 aria-hidden="true" />
                  {t("products.archive")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("products.actions_for_aria", {
                name: product.name,
              })}
            />
          }
        >
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetailTarget(product)}>
            <Eye aria-hidden="true" />
            {t("products.view")}
          </DropdownMenuItem>
          {canEdit ? (
            <DropdownMenuItem onClick={() => setEditTarget(product)}>
              <Pencil aria-hidden="true" />
              {t("products.edit")}
            </DropdownMenuItem>
          ) : null}
          {!archived && canStockIn ? (
            <DropdownMenuItem
              onClick={() => setStockTarget({ product, type: "stock_in" })}
            >
              <ArrowDownToLine aria-hidden="true" />
              {t("products.stock_in")}
            </DropdownMenuItem>
          ) : null}
          {!archived && canStockOut ? (
            <DropdownMenuItem
              onClick={() => setStockTarget({ product, type: "stock_out" })}
            >
              <ArrowUpFromLine aria-hidden="true" />
              {t("products.stock_out")}
            </DropdownMenuItem>
          ) : null}
          {!archived && canArchive ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setArchiveTarget(product)}
            >
              <Trash2 aria-hidden="true" />
              {t("products.archive")}
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
  // FE-26: effect HANYA menonton searchInput — statusFilter dibaca via ref.
  // Sebelumnya setStatus() memanggil applyFilters LANGSUNG lalu effect ikut
  // menembak replace kedua dengan nilai sama (navigasi ganda).
  // Anti-loop: applyFilters dibaca via ref (identitasnya ikut searchParams
  // yang bisa berganti tiap render) + guard query-identik di dalamnya.
  // Tanpa ini effect menembak replace tiap 350ms walau user diam.
  const statusFilterRef = React.useRef(statusFilter);
  React.useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);
  const categoryFilterRef = React.useRef(categoryFilter);
  React.useEffect(() => {
    categoryFilterRef.current = categoryFilter;
  }, [categoryFilter]);
  const applyFiltersRef = React.useRef(applyFilters);
  React.useEffect(() => {
    applyFiltersRef.current = applyFilters;
  });
  React.useEffect(() => {
    const timer = setTimeout(() => {
      applyFiltersRef.current(
        searchInput,
        statusFilterRef.current ?? "active",
        categoryFilterRef.current ?? "",
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const SAVED_VIEWS_KEY = `chainventory:savedViews:${warehouseId}`;
  type SavedView = {
    id: string;
    name: string;
    q: string;
    status: "active" | "archived" | "all";
    category: string;
  };
  const [savedViews, setSavedViews] = React.useState<SavedView[]>([]);
  const [saveName, setSaveName] = React.useState("");
  const [showSave, setShowSave] = React.useState(false);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_VIEWS_KEY);
      if (raw) setSavedViews(JSON.parse(raw));
      else setSavedViews([]);
    } catch {
      setSavedViews([]);
    }
  }, [SAVED_VIEWS_KEY]);
  const persistViews = (next: SavedView[]) => {
    setSavedViews(next);
    try {
      localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
    } catch {}
  };
  const saveCurrentView = () => {
    const name =
      saveName.trim() ||
      `${query || t("products.filter_all")} · ${statusFilter}`;
    // FE-18: randomUUID (bukan Date.now) — dua klik simpan dalam 1ms
    // tidak boleh menghasilkan id kembar.
    const next: SavedView = {
      id: crypto.randomUUID(),
      name,
      q: query,
      status: statusFilter,
      category: categoryFilter,
    };
    persistViews([...savedViews, next]);
    setSaveName("");
    setShowSave(false);
    toast.add({
      type: "success",
      title: t("products.toast_view_saved_title", { name }),
      description: t("products.toast_view_saved_desc"),
    });
  };
  const applySavedView = (v: SavedView) => {
    setSearchInput(v.q);
    applyFilters(v.q, v.status, v.category ?? "");
  };
  const deleteView = (id: string) =>
    persistViews(savedViews.filter((v) => v.id !== id));

  const refresh = () => router.refresh();

  const switchWarehouse = useSwitchWarehouse(warehouseId);

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card flex flex-col gap-3 rounded-xl border p-3 shadow-(--shadow-card) xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("products.search_placeholder")}
              className="pl-8"
              aria-label={t("products.search_aria")}
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
                aria-label={t("products.clear_search_aria")}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded before:absolute before:-inset-[10px] before:content-[''] focus-visible:ring-3 focus-visible:outline-none"
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
              <SelectTrigger
                aria-label={t("settings.warehouse")}
                className="min-w-36"
              >
                <SelectValue
                  getLabel={(v) => warehouses.find((w) => w.id === v)?.name}
                />
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
            <SelectTrigger
              aria-label={t("products.status_filter_aria")}
              className="min-w-32"
            >
              <span className="text-muted-foreground mr-1 hidden sm:inline">
                {t("products.status_label")}
              </span>
              <SelectValue
                getLabel={(v) =>
                  v === "active"
                    ? t("products.status_active")
                    : v === "archived"
                      ? t("products.status_archived")
                      : v === "all"
                        ? t("products.filter_all")
                        : v
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">
                {t("products.status_active")}
              </SelectItem>
              <SelectItem value="archived">
                {t("products.status_archived")}
              </SelectItem>
              <SelectItem value="all">{t("products.filter_all")}</SelectItem>
            </SelectContent>
          </Select>
          {categories.length > 0 ? (
            <Select
              value={categoryFilter || "all"}
              onValueChange={(value) => {
                if (value !== null) setCategory(value === "all" ? "" : value);
              }}
            >
              <SelectTrigger
                aria-label={t("products.category_filter_aria")}
                className="min-w-32"
              >
                <span className="text-muted-foreground mr-1 hidden sm:inline">
                  {t("products.category_label_prefix")}
                </span>
                <SelectValue
                  getLabel={(v) => (v === "all" ? t("products.filter_all") : v)}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("products.filter_all")}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {canExport ? (
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              render={
                <a
                  href={`/api/warehouses/export?type=products&warehouseId=${encodeURIComponent(warehouseId)}`}
                  download
                />
              }
            >
              <ArrowDownToLine aria-hidden="true" />
              {t("products.export_csv")}
            </Button>
          ) : null}
          {canBulk ? (
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => setBulkOpen(true)}
            >
              <FileUp aria-hidden="true" />
              {t("products.bulk_add")}
            </Button>
          ) : null}
          {canExport || canBulk ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="sm:hidden"
                    aria-label={t("products.more_actions_aria")}
                  />
                }
              >
                <MoreHorizontal aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canExport ? (
                  <DropdownMenuItem
                    render={
                      <a
                        href={`/api/warehouses/export?type=products&warehouseId=${encodeURIComponent(warehouseId)}`}
                        download
                      />
                    }
                  >
                    <ArrowDownToLine aria-hidden="true" />
                    {t("products.export_csv")}
                  </DropdownMenuItem>
                ) : null}
                {canBulk ? (
                  <DropdownMenuItem onClick={() => setBulkOpen(true)}>
                    <FileUp aria-hidden="true" />
                    {t("products.bulk_add")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" />
              {t("products.add_product")}
            </Button>
          ) : null}
        </div>
      </div>
      {/* Active filter chips — I03 progressive disclosure + F05 saved views */}
      {(query.trim() || statusFilter !== "active" || categoryFilter) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground t-label-md uppercase">
            {t("products.active_filters")}
          </span>
          {query.trim() && (
            <span className="bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium">
              {t("products.chip_search", { query: query.trim() })}
              <button
                type="button"
                aria-label={t("products.clear_search_filter_aria")}
                onClick={() => setSearchInput("")}
                className="hover:bg-primary/20 relative -mr-1 rounded-full p-1 transition-colors before:absolute before:-inset-[8px] before:content-['']"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          )}
          {statusFilter !== "active" && (
            <span className="bg-secondary/20 text-secondary-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium">
              {t("products.chip_status", {
                status:
                  statusFilter === "archived"
                    ? t("products.status_archived")
                    : t("products.filter_all"),
              })}
              <button
                type="button"
                aria-label={t("products.clear_status_filter_aria")}
                onClick={() => setStatus("active")}
                className="hover:bg-secondary/30 relative -mr-1 rounded-full p-1 transition-colors before:absolute before:-inset-[8px] before:content-['']"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          )}
          {categoryFilter ? (
            <span className="bg-card text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium">
              {t("products.chip_category", { category: categoryFilter })}
              <button
                type="button"
                aria-label={t("products.clear_category_filter_aria")}
                onClick={() => setCategory("")}
                className="hover:bg-muted relative -mr-1 rounded-full p-1 transition-colors before:absolute before:-inset-[8px] before:content-['']"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setStatus("active");
              setCategory("");
            }}
            className="text-muted-foreground hover:text-foreground text-sm font-medium underline-offset-4 hover:underline"
          >
            {t("products.clear_all_filters")}
          </button>
          <span className="text-border hidden sm:inline">|</span>
          {!showSave ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSave(true)}
            >
              {t("products.save_view")}
            </Button>
          ) : (
            <span className="flex items-center gap-1.5">
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={t("products.saved_view_placeholder")}
                className="h-11 w-40"
                aria-label={t("products.saved_view_name_aria")}
              />
              <Button size="sm" onClick={saveCurrentView}>
                {t("products.save")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSave(false)}
              >
                {t("products.discard")}
              </Button>
            </span>
          )}
        </div>
      )}
      {/* Saved views — F05 repeat-work efficiency, local first (no backend) */}
      {savedViews.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">
            {t("products.saved_views")}
          </span>
          {savedViews.map((v) => (
            <span
              key={v.id}
              className="bg-card border-border inline-flex items-center gap-1.5 rounded-full border px-2.5 py-2 text-sm"
            >
              <button
                type="button"
                onClick={() => applySavedView(v)}
                className="hover:text-primary font-medium"
              >
                {v.name}
              </button>
              <span className="text-muted-foreground text-sm">
                · {v.q || t("products.filter_all")} ·{" "}
                {v.status === "active"
                  ? t("products.status_active")
                  : v.status === "archived"
                    ? t("products.status_archived")
                    : t("products.filter_all")}
                {v.category ? ` · ${v.category}` : ""}
              </span>
              <button
                type="button"
                aria-label={t("products.delete_view_aria", { name: v.name })}
                onClick={() => deleteView(v.id)}
                className="hover:text-destructive hover:bg-destructive/10 -mr-1 rounded-full p-1 transition-colors"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          ))}
          {savedViews.length > 0 &&
            (query.trim() || statusFilter !== "active") && (
              <span className="text-muted-foreground hidden text-sm sm:inline">
                {t("products.reapply_hint")}
              </span>
            )}
        </div>
      )}

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title={
            query
              ? t("products.empty_search_title")
              : statusFilter === "archived"
                ? t("products.empty_archived_title")
                : t("products.empty_title")
          }
          description={
            query
              ? t("products.empty_search_desc", { query })
              : statusFilter === "archived"
                ? t("products.empty_archived_desc")
                : t("products.empty_desc")
          }
          primaryAction={
            query
              ? {
                  label: t("products.clear_search"),
                  onClick: () => setSearchInput(""),
                }
              : statusFilter === "archived"
                ? {
                    label: t("products.clear_filter"),
                    onClick: () => setStatus("active"),
                  }
                : canCreate
                  ? {
                      label: t("products.add_product"),
                      onClick: () => setCreateOpen(true),
                    }
                  : undefined
          }
          secondaryAction={
            !query && statusFilter !== "archived" && canBulk
              ? {
                  label: t("products.import_products"),
                  onClick: () => setBulkOpen(true),
                }
              : undefined
          }
        />
      ) : (
        <>
          {selected.size > 0 && (canArchive || canExport || canEdit) ? (
            <div className="bg-surface-high sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 shadow-(--shadow-elevated)">
              <Badge variant="default" className="font-mono tabular-nums">
                {selected.size}
              </Badge>
              <span className="text-muted-foreground hidden text-sm sm:inline">
                {t("products.selected_hint")}
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkCategoryOpen(true)}
                    disabled={bulkBusy}
                  >
                    <Pencil aria-hidden="true" />
                    {t("products.category_label")}
                  </Button>
                )}
                {canExport ? (
                  <Button variant="outline" size="sm" onClick={exportSelected}>
                    <Download aria-hidden="true" />
                    {t("products.export")}
                  </Button>
                ) : null}
                {canArchive ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmBulkArchive(true)}
                    disabled={bulkBusy}
                  >
                    {bulkBusy ? (
                      <Loader2 aria-hidden="true" className="animate-spin" />
                    ) : (
                      <Trash2 aria-hidden="true" />
                    )}
                    {t("products.archive")}
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  <X aria-hidden="true" />
                  {t("products.clear")}
                </Button>
              </div>
            </div>
          ) : null}

          <PanelCard padding="none" className="bg-card">
            {/* Desktop: tabel (scroll horizontal terbatas) */}
            <div className="hidden overflow-x-auto lg:block">
              <Table className="lg:min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        aria-label={t("products.select_all_aria")}
                        className="border-border focus-visible:ring-ring relative size-5 cursor-pointer rounded accent-[var(--primary)] before:absolute before:-inset-[12px] before:content-[''] focus-visible:ring-3 focus-visible:outline-none"
                      />
                    </TableHead>
                    <TableHead>{t("products.col_product")}</TableHead>
                    <TableHead className="hidden xl:table-cell">
                      {t("products.category_label")}
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      {t("products.col_unit")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("products.col_stock")}
                    </TableHead>
                    <TableHead>{t("products.col_status")}</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      {t("products.col_updated")}
                    </TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">
                        {t("products.col_actions")}
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const archived = product.status === "archived";
                    // FE-23: satu aturan dengan dashboard (lib/inventory/low-stock).
                    const low = isLowStock({
                      status: product.status,
                      quantity: product.quantity,
                      threshold: product.lowStockThreshold,
                    });
                    return (
                      <TableRow
                        key={product.id}
                        data-status={archived ? "archived" : undefined}
                        className={archived ? "opacity-70" : undefined}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selected.has(product.id)}
                            onChange={() => toggleSelect(product.id)}
                            aria-label={t("products.select_aria", {
                              name: product.name,
                            })}
                            className="border-border focus-visible:ring-ring relative size-5 cursor-pointer rounded accent-[var(--primary)] before:absolute before:-inset-[12px] before:content-[''] focus-visible:ring-3 focus-visible:outline-none"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <EntityName title={product.name}>
                              {product.name}
                            </EntityName>
                            <span className="t-code text-primary bg-surface-container w-fit rounded border px-1.5 py-px">
                              {product.sku}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <Badge variant="neutral">
                            {product.category ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden lg:table-cell">
                          {product.unit}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span
                              className={`font-mono text-sm font-semibold tabular-nums ${low ? "text-status-warn-fg" : ""}`}
                            >
                              {product.quantity ?? "0"} {product.unit}
                            </span>
                            {Number(product.lowStockThreshold) > 0 ? (
                              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                                {t("products.min_alert", {
                                  threshold: String(
                                    product.lowStockThreshold ?? "",
                                  ),
                                })}
                              </span>
                            ) : null}
                            {low ? (
                              <Badge variant="warning" data-icon="inline-start">
                                <TriangleAlert aria-hidden="true" />
                                Low Stock
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            tone={archived ? "inactive" : "success"}
                            label={
                              archived
                                ? t("products.status_archived")
                                : t("products.status_active")
                            }
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden text-sm tabular-nums lg:table-cell">
                          {formatDate(product.updatedAt)}
                        </TableCell>
                        <TableCell>
                          <div className="hidden xl:flex">
                            {renderActions(product, "inline")}
                          </div>
                          <div className="xl:hidden">
                            {renderActions(product, "dropdown")}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {/* Mobile: card list ergonomis (audit: mobile card-list) */}
            <ul className="divide-y lg:hidden">
              {products.map((product) => {
                const archived = product.status === "archived";
                // FE-23 + temuan audit #19: JANGAN inline ulang logika —
                // pakai helper yang sama dengan tabel desktop & dashboard.
                const low = isLowStock({
                  status: product.status,
                  quantity: product.quantity,
                  threshold: product.lowStockThreshold,
                });
                return (
                  <li
                    key={product.id}
                    className="flex items-start justify-between gap-3 p-4"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggleSelect(product.id)}
                      aria-label={t("products.select_aria", {
                        name: product.name,
                      })}
                      className="border-border focus-visible:ring-ring relative mt-1 size-5 shrink-0 cursor-pointer rounded accent-[var(--primary)] before:absolute before:-inset-[12px] before:content-[''] focus-visible:ring-3 focus-visible:outline-none"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <EntityName title={product.name} className="min-w-0">
                          {product.name}
                        </EntityName>
                        <StatusBadge
                          tone={archived ? "inactive" : "success"}
                          label={
                            archived
                              ? t("products.status_archived")
                              : t("products.status_active")
                          }
                        />
                      </div>
                      <p className="text-muted-foreground mt-0.5 font-mono text-sm">
                        {product.sku}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {product.category ?? "—"} · {product.unit}
                      </p>
                      <p className="mt-1 text-sm tabular-nums">
                        <span
                          className={
                            low
                              ? "text-warning font-mono"
                              : "text-foreground font-mono"
                          }
                        >
                          {product.quantity ?? "0"}
                        </span>{" "}
                        <span className="text-muted-foreground text-sm">
                          {t("products.in_stock")}
                        </span>
                        {low ? (
                          <span className="text-warning text-sm font-medium">
                            {" "}
                            · Low stock
                          </span>
                        ) : null}
                      </p>
                      {!archived && (canStockIn || canStockOut) ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {canStockIn ? (
                            <Button
                              size="sm"
                              onClick={() =>
                                setStockTarget({ product, type: "stock_in" })
                              }
                            >
                              {t("products.stock_in")}
                            </Button>
                          ) : null}
                          {canStockOut ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setStockTarget({ product, type: "stock_out" })
                              }
                            >
                              {t("products.stock_out")}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {renderActions(product)}
                  </li>
                );
              })}
            </ul>
          </PanelCard>
          {/* FE-20: spacer saat bulk bar sticky aktif agar tidak menutupi pagination di layar kecil. */}
          {selected.size > 0 && (canArchive || canExport || canEdit) ? (
            <div aria-hidden="true" className="h-16" />
          ) : null}
          {!paginationDisabled ? (
            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(total / perPage))}
              onPage={goToPage}
            />
          ) : (
            <p
              role="alert"
              className="bg-destructive/15 text-destructive rounded-lg px-3 py-2 text-sm"
            >
              {t("products.count_failed")}
            </p>
          )}
        </>
      )}

      {createOpen ? (
        <CreateProductDialog
          warehouseId={warehouseId}
          warehouseName={warehouses.find((w) => w.id === warehouseId)?.name}
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
          key={editTarget.id}
          product={editTarget}
          open
          onOpenChange={(open) => {
            if (!open) setEditTarget(null);
          }}
          onUpdated={refresh}
        />
      ) : null}
      {archiveTarget ? (
        <ArchiveProductDialog
          warehouseId={warehouseId}
          product={archiveTarget}
          open
          onOpenChange={(open) => {
            if (!open) setArchiveTarget(null);
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
          open
          onOpenChange={(open) => {
            if (!open) setStockTarget(null);
          }}
          onSuccess={refresh}
        />
      ) : null}
      {detailTarget ? (
        // NFE-15: key per produk — ganti produk = remount = state
        // loading/movements/error segar (tanpa setState-in-effect).
        <ProductDetailSheet
          key={detailTarget.id}
          warehouseId={warehouseId}
          product={detailTarget}
          open
          onOpenChange={(open) => {
            if (!open) setDetailTarget(null);
          }}
          onEdit={(p) => setEditTarget(p)}
          onRecordMovement={(p) =>
            setStockTarget({ product: p, type: "stock_in" })
          }
        />
      ) : null}

      <Dialog open={confirmBulkArchive} onOpenChange={setConfirmBulkArchive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("products.bulk_archive_title", {
                count: String(selected.size),
              })}
            </DialogTitle>
            <DialogDescription>
              {t("products.bulk_archive_desc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmBulkArchive(false)}
            >
              {t("products.keep_active")}
            </Button>
            <Button
              variant="destructive"
              disabled={bulkBusy}
              onClick={() => {
                setConfirmBulkArchive(false);
                void archiveSelected();
              }}
            >
              {bulkBusy ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                t("products.archive_products")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={bulkCategoryOpen}
        onOpenChange={(open) => {
          setBulkCategoryOpen(open);
          if (!open) setBulkCategoryValue("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("products.bulk_category_title", {
                count: String(selected.size),
              })}
            </DialogTitle>
            <DialogDescription>
              {t("products.bulk_category_desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bulk-cat" className="text-sm font-medium">
              {t("products.category_label")}
            </label>
            <Input
              id="bulk-cat"
              value={bulkCategoryValue}
              onChange={(e) => setBulkCategoryValue(e.target.value)}
              placeholder={t("products.bulk_category_placeholder")}
              aria-invalid={Boolean(
                bulkCategoryValue && !bulkCategoryValue.trim(),
              )}
              aria-describedby={
                bulkCategoryValue && !bulkCategoryValue.trim()
                  ? "err-bulk-cat"
                  : undefined
              }
            />
            {bulkCategoryValue && !bulkCategoryValue.trim() ? (
              <p id="err-bulk-cat" className="text-destructive text-sm">
                {t("products.bulk_category_error")}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkCategoryOpen(false)}
            >
              {t("products.keep_current")}
            </Button>
            <Button
              onClick={bulkChangeCategory}
              disabled={bulkBusy || !bulkCategoryValue.trim()}
            >
              {bulkBusy ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Pencil aria-hidden="true" />
              )}
              {t("products.bulk_update", {
                count: String(selected.size),
              })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
