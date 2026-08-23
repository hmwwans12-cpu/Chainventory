-- ============================================================================
-- Chainventory — 0018: proof_requeue silent retry (proof_failed no longer notifies)
-- ============================================================================
-- Keputusan produk (halaman "Redefine proof_failed + UI Bell & Notification
-- Center", langkah 1a): transisi proof 'retrying' ADALAH perilaku normal
-- (AGENT.md §5, backoff maksimal 5x), bukan kegagalan yang butuh tindakan
-- manusia. Maka `proof_failed` TIDAK lagi ditulis ke `notifications`.
-- Hanya `proof_manual_review` (kondisi terminal yang benar-benar butuh
-- perhatian) yang tetap dinotifikasi ke actor + OWNER.
--
-- Perubahan: `public.proof_requeue` di-recreate dengan cabang retrying yang
-- TIDAK lagi memanggil `private.notify_proof_event(... 'proof_failed' ...)`.
-- Cabang manual_review (attempts >= 5) TETAP memanggil notify_proof_event
-- dengan tipe 'proof_manual_review' — tidak berubah dari 0017.
--
-- Aliran ADDITIVE: tidak menghapus kolom/tipe/constraint. Tipe 'proof_failed'
-- tetap ada di CHECK constraint `notifications` untuk kompatibilitas mundur
-- terhadap baris lama yang mungkin sudah terlanjur ditulis; tidak ada baris
-- baru lagi yang dibuat oleh pipeline proof.
--
-- Perilaku lain `proof_requeue` (update status, outbox, audit log) byte-identical
-- dengan 0017. `create or replace function` mempertahankan grant yang sudah ada
-- (revoke public/anon + grant service_role dari 0009).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- proof_requeue: retry otomatis diam-diam; hanya manual_review yang notify.
-- ----------------------------------------------------------------------------
create or replace function public.proof_requeue(p_proof_id uuid, p_error text, p_next_attempt_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_attempts int;
  v_wh uuid;
begin
  select ob.attempt_count, pr.warehouse_id into v_attempts, v_wh
  from public.proof_outbox ob
  join public.proofs pr on pr.id = ob.proof_id
  where ob.proof_id = p_proof_id;

  if v_attempts >= 5 then
    update public.proofs set status = 'manual_review', error = p_error, updated_at = now() where id = p_proof_id;
    update public.proof_outbox set status = 'failed', lease_token = null, next_attempt_at = null, error = p_error, updated_at = now() where proof_id = p_proof_id;
    perform private.write_audit(v_wh, null, 'proof_manual_review', 'proofs', p_proof_id::text,
      null, jsonb_build_object('error', p_error, 'attempts', v_attempts), null, 'manual_review');
    perform private.notify_proof_event(
      p_proof_id, 'proof_manual_review',
      'Butuh review manual',
      'Proof {product} masuk review manual: {error}',
      p_error
    );
  else
    update public.proofs set status = 'retrying', error = p_error, updated_at = now() where id = p_proof_id;
    update public.proof_outbox set status = 'failed', lease_token = null, next_attempt_at = p_next_attempt_at, error = p_error, updated_at = now() where proof_id = p_proof_id;
    perform private.write_audit(v_wh, null, 'proof_retrying', 'proofs', p_proof_id::text,
      null, jsonb_build_object('error', p_error, 'attempt', v_attempts, 'next_attempt_at', p_next_attempt_at), null, 'retrying');
    -- 0018: TIDAK ada write_notification di sini. Retry otomatis adalah
    -- perilaku normal, bukan kegagalan yang butuh tindakan (AGENT.md §5).
  end if;
end;
$function$;
