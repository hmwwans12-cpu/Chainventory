-- ============================================================================
-- Chainventory — 0058: index trigram untuk pencarian produk (temuan audit #24)
-- ============================================================================
-- Masalah: pencarian produk (ILIKE '%term%' pada name/sku/category di
-- app/(dashboard)/inventory/products/page.tsx) tanpa index pendukung —
-- sequential scan yang makin lambat seiring katalog bertambah. Ditemukan
-- saat audit, bukan setelah keluhan user.
--
-- Fix: ekstensi pg_trgm (allowlist Supabase, idempoten) + 3 index GIN
-- terpisah (satu per kolom). Query memakai OR lintas ketiga kolom,
-- sehingga planner menggabungkannya via BitmapOr — satu index komposit
-- tidak akan terpakai untuk pola ini. Index hanya mempercepat pola
-- mengandung ('%term%'); pola prefix ('term%') tetap memakai btree bila
-- ada (tidak dibuat di sini karena query selalu membungkus dua sisi).
--
-- Additive murni: tidak mengubah skema, RLS, RPC, maupun grants.
-- Estimasi build di katalog UMKM (ratusan–ribuan SKU): milidetik; CONCURRENTLY
-- sengaja TIDAK dipakai agar file tetap berlaku untuk `supabase db push`
-- transaksional (CREATE INDEX CONCURRENTLY tidak bisa di dalam blok transaksi).
-- ============================================================================

create extension if not exists pg_trgm with schema extensions;

create index if not exists products_name_trgm_idx
  on public.products using gin (name gin_trgm_ops);

create index if not exists products_sku_trgm_idx
  on public.products using gin (sku gin_trgm_ops);

create index if not exists products_category_trgm_idx
  on public.products using gin (category gin_trgm_ops);
