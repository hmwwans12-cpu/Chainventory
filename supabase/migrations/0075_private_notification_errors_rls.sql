-- ============================================================================
-- Chainventory — 0075: RLS defense-in-depth untuk private.notification_errors
-- ============================================================================
-- Tabel ditulis HANYA dari dalam fungsi DB (SECURITY DEFINER, berjalan
-- sebagai postgres → bypass RLS apa pun). Selama ini RLS tidak aktif:
-- bila skema `private` suatu hari terekspos ke Data API (atauGRANT keliru),
-- baris error (berisi user_id/warehouse_id/payload) langsung terbaca
-- publik. Aktifkan RLS TANPA policy = deny-by-default untuk anon +
-- authenticated; service_role/postgres tetap bypass (penulis sah).
-- ============================================================================

alter table private.notification_errors enable row level security;
