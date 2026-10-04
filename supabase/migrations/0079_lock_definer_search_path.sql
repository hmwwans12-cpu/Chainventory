-- ============================================================================
-- Chainventory — 0079: kunci search_path 54 fungsi SECURITY DEFINER (M-1/R-2)
-- ============================================================================
-- Serangan search_path: DEFINER dengan `search_path = public` mengeksekusi
-- referensi tak-terkualifikasi memakai path penelepon — penyerang dengan
-- CREATE di skema awal path bisa membajak tabel/fungsi. 58 DEFINER lain
-- sudah terkunci (`set search_path = ''`, pola 0064+); 54 di bawah adalah
-- sisa live yang terverifikasi AMAN dikunci:
--   * live-set dihitung drop/overload-aware (CREATE terakhir per signature
--     menang; DROP setelahnya menghapus — bukan sekadar grep terakhir),
--   * tiap body disapu: nol referensi tabel tak-terkualifikasi (alias
--     `proofs.col` + literal string bukan ref), nol pemanggilan fungsi
--     tak-terkualifikasi selain builtin pg_catalog (lower/format/...) yang
--     selalu ter-resolve walau path '', nol temp table / dynamic catalog,
--   * sintaks `SET search_path TO 'x'` ikut diparse (bukan hanya `=`).
-- Daftar DEFERRED kosong — tidak ada yang ragu.
--
-- Test: lib/security/definer-search-path-0079.test.ts (gagal bila DEFINER
-- baru ber-path lemah tanpa kunci/defer).
--
-- TULIS SAJA, JANGAN DI-APPLY OTOMATIS. Owner apply manual di staging:
--   supabase db push --linked   (setelah review; lihat WORKFLOW.md §4)
-- Verifikasi pasca-apply: SELECT proname, prosecdef, proconfig FROM
-- pg_proc WHERE prosecdef AND 'search_path=' || ... ; panggil RPC kritis
-- (apply_stock_movement, analytics_dashboard, mark_notifications_read).
-- ============================================================================

alter function public.keepalive_ping() set search_path = '';
alter function public.register_wallet(text,text) set search_path = '';
alter function public.verify_wallet(uuid) set search_path = '';
alter function public.cancel_join(uuid) set search_path = '';
alter function public.enforce_product_unit_immutable() set search_path = '';
alter function public.apply_stock_movement(uuid,uuid,text,numeric,bigint,text,text,uuid,text,text) set search_path = '';
alter function public.approve_stock_adjustment(uuid) set search_path = '';
alter function public.create_warehouse_and_deployment(text,text,text,text,text,text,bigint,text,bigint,bigint,text,text) set search_path = '';
alter function public.rollback_warehouse_creation(uuid,text) set search_path = '';
alter function public.update_warehouse_deployment_status(uuid,text,text,text) set search_path = '';
alter function public.list_transactions(uuid,text,text,integer,integer) set search_path = '';
alter function public.proof_retry(uuid) set search_path = '';
alter function private.notify_proof_event(uuid,text,text,text,text) set search_path = '';
alter function private.notify_warehouse_managers(uuid,text,text,text,jsonb,text) set search_path = '';
alter function private.warehouse_owner_id(uuid) set search_path = '';
alter function private.write_notification(uuid,uuid,text,text,text,jsonb,text) set search_path = '';
alter function public.mark_notifications_read(uuid[]) set search_path = '';
alter function public.request_join(text) set search_path = '';
alter function public.proof_requeue(uuid,text,timestamp with time zone) set search_path = '';
alter function public.analytics_dashboard(uuid,integer) set search_path = '';
alter function private.ensure_warehouse_active(uuid) set search_path = '';
alter function private.notify_managers_once(uuid,text,text,text,jsonb,text) set search_path = '';
alter function public.approve_join(uuid,text) set search_path = '';
alter function public.proof_set_confirmation(uuid,integer,text) set search_path = '';
alter function public.reject_join(uuid,text) set search_path = '';
alter function public.reject_stock_adjustment(uuid,text) set search_path = '';
alter function public.run_warehouse_lifecycle() set search_path = '';
alter function public.proof_manual_retry(uuid,uuid) set search_path = '';
alter function public.claim_faucet(uuid,numeric) set search_path = '';
alter function public.submit_user_paid_stock_intent(uuid,text) set search_path = '';
alter function public.enforce_warehouse_identity_immutable() set search_path = '';
alter function public.enforce_warehouse_active_for_products() set search_path = '';
alter function public.enforce_product_warehouse_immutable() set search_path = '';
alter function public.apply_stock_movement(uuid,uuid,text,numeric,bigint,text,text,uuid,text,text,uuid,jsonb,text) set search_path = '';
alter function public.create_user_paid_stock_intent(uuid,uuid,uuid,text,numeric,bigint,text,text,text,text,jsonb,text) set search_path = '';
alter function public.create_product_rpc(uuid,text,text,text,text,text,numeric) set search_path = '';
alter function public.create_product_with_initial_stock(uuid,text,text,text,text,text,numeric,numeric) set search_path = '';
alter function public.create_product_with_initial_stock(uuid,text,text,text,text,text,numeric,numeric,uuid,uuid,jsonb,text) set search_path = '';
alter function public.approve_stock_adjustment(uuid,jsonb,text) set search_path = '';
alter function public.apply_stock_movement(uuid,uuid,text,numeric,integer,text,text,uuid,text,text,uuid,jsonb,text,text) set search_path = '';
alter function public.confirm_faucet_claim(uuid,text,text) set search_path = '';
alter function public.apply_stock_movement(uuid,uuid,text,numeric,bigint,text,text,uuid,text,text,uuid,jsonb,text,text) set search_path = '';
alter function public.purge_expired_idempotency_keys(interval,integer) set search_path = '';
alter function public.get_invitation_by_token(text) set search_path = '';
alter function public.commit_user_paid_stock_intent(uuid) set search_path = '';
alter function public.create_user_paid_stock_intent(uuid,uuid,uuid,text,numeric,bigint,text,text,text,text,jsonb,text,text) set search_path = '';
alter function public.confirm_ownership_transfer(uuid,uuid,text) set search_path = '';
alter function public.proof_retry(uuid,uuid) set search_path = '';
alter function public.set_warehouse_contract_address(uuid,text) set search_path = '';
alter function public.verify_wallet(uuid,uuid) set search_path = '';
alter function public.set_warehouse_contract_address(uuid,text,uuid) set search_path = '';
alter function public.archive_product(uuid,uuid) set search_path = '';
alter function public.enforce_product_status_role() set search_path = '';
alter function public.update_product_rpc(uuid,uuid,text,text,text,text,text,numeric) set search_path = '';
