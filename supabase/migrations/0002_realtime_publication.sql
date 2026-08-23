-- ============================================================================
-- Chainventory — 0002: Realtime publication (whitelist eksplisit)
-- ============================================================================
-- ARSITEKTUR §6: Realtime hanya untuk tabel yang dibutuhkan (free-tier hemat).
-- Subscription per-warehouse mengikuti RLS (policy SELECT OWN/tenant).
--
-- CATATAN: publication PostgreSQL bersifat global per database. Supabase
-- menandai tabel untuk Realtime via `supabase_realtime` publication.
-- Tabel yang TIDAK masuk publication tidak memancarkan perubahan.
--
-- Tabel berikut baru tersedia setelah migration P1 masing-masing dibuat.
-- Migration ini adalah TEMPLATE whitelist; jangan mengaktifkan tabel yang
-- belum ada (supabase db reset akan gagal pada publikasi tabel non-eksist).
-- ============================================================================

-- Aktifkan Realtime hanya untuk `users` pada fase ini. Tabel lain ditambahkan
-- pada migration P1-nya masing-masing (expand–migrate–contract, WORKFLOW §4),
-- yaitu: warehouses, memberships, join_requests, products, inventory_balances,
-- stock_movements, proofs, notifications — SESUAI KEBUTUHAN ARSITEKTUR §6.1,
-- dan hanya tabel yang benar-benar dibutuhkan klien secara live.

alter publication supabase_realtime add table public.users;