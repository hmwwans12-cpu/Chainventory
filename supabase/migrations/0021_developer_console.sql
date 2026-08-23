-- ============================================================================
-- Chainventory — 0021: Developer Console (ARSITEKTUR §7.4)
-- ============================================================================
-- Developer Console adalah satu-satunya jalur yang boleh MENJADWALKAN ULANG
-- proof berstatus `manual_review` (AGENT.md — "Hanya Developer Console dapat
-- menjadwalkan ulang manual review"). Status `manual_review` bersifat terminal
-- untuk semua jalur biasa (proof_retry member-facing, processor, reconciliation)
-- sehingga retry dari console memakai RPC khusus ini.
--
-- Kebijakan:
--   * SECURITY DEFINER dengan pengecekan status ketat (manual_review wajib).
--   * Actor (siapa yang melakukan retry) WAJIB dikirim server-side (Developer
--     Console hanya bisa diakses user allowlist) dan dicatat ke audit_logs.
--   * Semantik retry = sama dengan `proof_requeue` (pipeline async):
--       - proofs.status pending, error dibersihkan
--       - proof_outbox status pending, lease dibersihkan, next_attempt_at = now
--         → processor boleh langsung lease (QStash job diterbitkan oleh console)
--       - attempt_count PERTAHANAN (budget retry ≤ 5 tidak di-reset).
--   * EXECUTE hanya untuk service_role — TIDAK untuk authenticated/anon
--     (user aplikasi tidak pernah memanggil ini; hanya server Developer
--     Console lewat service client).
-- ============================================================================

create or replace function public.proof_manual_retry(
  p_proof_id uuid,
  p_actor_user_id uuid
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_warehouse_id uuid;
  v_status text;
begin
  if p_actor_user_id is null then
    raise exception 'developer console actor required';
  end if;

  select warehouse_id, status
    into v_warehouse_id, v_status
  from public.proofs
  where id = p_proof_id;

  if v_warehouse_id is null then
    raise exception 'proof not found';
  end if;

  if v_status <> 'manual_review' then
    raise exception 'proof not retryable from console (current status: %)', v_status;
  end if;

  update public.proofs
    set status = 'pending',
        error = null,
        updated_at = now()
  where id = p_proof_id;

  update public.proof_outbox
    set status = 'pending',
        error = null,
        next_attempt_at = now(),
        lease_token = null,
        lease_expires_at = null,
        updated_at = now()
  where proof_id = p_proof_id;

  perform private.write_audit(
    p_warehouse_id  => v_warehouse_id,
    p_actor_user_id => p_actor_user_id,
    p_action        => 'proof_manual_retry',
    p_entity        => 'proofs',
    p_entity_id     => p_proof_id::text,
    p_before_state  => jsonb_build_object('status', v_status),
    p_after_state   => jsonb_build_object('status', 'pending'),
    p_status        => 'pending'
  );
end;
$$;

comment on function public.proof_manual_retry(uuid, uuid) is
  'Developer Console: kembalikan proof manual_review ke antrian delivery (QStash). Actor (user id) wajib; attempt_count dipertahankan; audit tercatat. EXECUTE hanya service_role.';

revoke all on function public.proof_manual_retry(uuid, uuid) from public;
revoke all on function public.proof_manual_retry(uuid, uuid) from anon;
revoke all on function public.proof_manual_retry(uuid, uuid) from authenticated;
grant execute on function public.proof_manual_retry(uuid, uuid) to service_role;