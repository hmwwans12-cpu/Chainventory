-- ============================================================================
-- Chainventory — 0079: kunci search_path fungsi SECURITY DEFINER (M-1/R-2)
-- ============================================================================
-- Serangan search_path: DEFINER dengan `search_path = public` mengeksekusi
-- referensi tak-terkualifikasi memakai path penelepon — penyerang dengan
-- CREATE di skema awal path bisa membajak tabel/fungsi.
--
-- Basis kebenaran: STATE NYATA DB (pg_proc + pg_get_functiondef), BUKAN
-- sekadar grep migrasi. 33 fungsi di bawah ada di DB dengan path lemah
-- DAN terverifikasi aman dikunci: nol referensi tabel tak-terkualifikasi
-- (alias `tbl.col` + literal bukan ref), nol pemanggilan tak-terkualifikasi
-- selain builtin pg_catalog (selalu resolve walau path ''), nol EXECUTE
-- dinamis, nol temp table/dynamic catalog. Sweep dilakukan atas BODY ASLI
-- dari DB (41.861 char), bukan model statis.
--
-- Pelajaran jujur (didokumentasikan, bukan disembunyikan): model statis
-- awal over-count 54 karena regex DROP buta `if exists` + atribusi
-- definisi-terakhir yang keliru untuk 3 fungsi. DB-truth mengoreksinya.
-- Test statis (definer-search-path-0079.test.ts) diperbaiki sejalan dan
-- menjaga: DEFINER-ber-path-lemah baru tanpa kunci/defer = gagal.
--
-- Semua statement idempotent (ALTER ... SET) — aman di-retry/di-push ulang.
--
-- TULIS + APPLY STAGING via Management API (2026-10-04). Owner: `supabase
-- db push --linked` untuk prod setelah review; lalu verifikasi:
--   SELECT ... pg_proc ... (nol DEFINER dengan search_path=public), dan
--   smoke RPC kritis (apply_stock_movement, analytics_dashboard,
--   mark_notifications_read, membership dispatch).
-- ============================================================================

alter function public.keepalive_ping() set search_path = '';
alter function public.register_wallet(text,text) set search_path = '';
alter function private.ensure_warehouse_active(uuid) set search_path = '';
alter function private.notify_managers_once(uuid,text,text,text,jsonb,text) set search_path = '';
alter function private.notify_proof_event(uuid,text,text,text,text) set search_path = '';
alter function private.notify_warehouse_managers(uuid,text,text,text,jsonb,text) set search_path = '';
alter function private.warehouse_owner_id(uuid) set search_path = '';
alter function private.write_notification(uuid,uuid,text,text,text,jsonb,text) set search_path = '';
alter function public.analytics_dashboard(uuid,integer) set search_path = '';
alter function public.approve_join(uuid,text) set search_path = '';
alter function public.archive_product(uuid,uuid) set search_path = '';
alter function public.cancel_join(uuid) set search_path = '';
alter function public.claim_faucet(uuid,numeric) set search_path = '';
alter function public.confirm_faucet_claim(uuid,text,text) set search_path = '';
alter function public.confirm_ownership_transfer(uuid,uuid,text,uuid) set search_path = '';
alter function public.create_product_rpc(uuid,text,text,text,text,text,numeric) set search_path = '';
alter function public.enforce_product_status_role() set search_path = '';
alter function public.enforce_product_unit_immutable() set search_path = '';
alter function public.enforce_warehouse_active_for_products() set search_path = '';
alter function public.enforce_product_warehouse_immutable() set search_path = '';
alter function public.enforce_warehouse_identity_immutable() set search_path = '';
alter function public.get_invitation_by_token(text) set search_path = '';
alter function public.mark_notifications_read(uuid[]) set search_path = '';
alter function public.proof_manual_retry(uuid,uuid) set search_path = '';
alter function public.proof_retry(uuid,uuid) set search_path = '';
alter function public.proof_set_confirmation(uuid,integer,text) set search_path = '';
alter function public.proof_requeue(uuid,text,timestamp with time zone) set search_path = '';
alter function public.reject_join(uuid,text) set search_path = '';
alter function public.request_join(text) set search_path = '';
alter function public.run_warehouse_lifecycle() set search_path = '';
alter function public.set_warehouse_contract_address(uuid,text,uuid) set search_path = '';
alter function public.transfer_ownership(uuid,uuid) set search_path = '';
alter function public.update_member_role(uuid,uuid,text) set search_path = '';
alter function public.update_product_rpc(uuid,uuid,text,text,text,text,text,numeric) set search_path = '';
alter function public.verify_wallet(uuid,uuid) set search_path = '';
