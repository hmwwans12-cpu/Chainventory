-- ============================================================================
-- Chainventory — 0016: blockchain page (proof retry untuk member)
-- ============================================================================
-- Aliran ADDITIVE. Halaman Blockchain (DESIGN §39, §74) menampilkan proof
-- on-chain per warehouse. Saat proof `failed`/`retrying`, member perlu aksi
-- pulih nyata: `proof_retry` mengembalikan proof ke antrian delivery
-- (proof_outbox → diproses server processor/treasury seperti semula).
--
-- Keamanan:
--   - caller harus member ACTIVE warehouse pemilik proof
--   - hanya proof berstatus 'failed' / 'retrying' yang retry-able
--     (`manual_review` = terminal: hash mismatch / tx revert → jangan auto
--     retry; butuh penanganan manual, konsisten dgn 0009)
--   - attempt_count TIDAK di-reset → backoff max-5 tetap ditegakkan
--   - re-enqueue TIDAK melakukan submit on-chain; submit tetap oleh server
--     processor memakai treasury wallet (DB bukan satu-satunya batas
--     keamanan blockchain-sensitive — PRD §36)
-- ============================================================================

create or replace function public.proof_retry(p_proof_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_wh uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select warehouse_id, status into v_wh, v_status
  from public.proofs
  where id = p_proof_id;

  if v_wh is null then
    raise exception 'proof not found';
  end if;

  if private.member_role(v_wh, v_uid) is null then
    raise exception 'not a member';
  end if;

  if v_status not in ('failed', 'retrying') then
    raise exception 'proof not retryable';
  end if;

  update public.proofs
    set status = 'pending', error = null, updated_at = now()
  where id = p_proof_id;

  update public.proof_outbox
    set status = 'pending', error = null, next_attempt_at = now(),
        lease_token = null, lease_expires_at = null, updated_at = now()
  where proof_id = p_proof_id;

  perform private.write_audit(
    v_wh, v_uid, 'proof_retry', 'proofs', p_proof_id::text,
    null, jsonb_build_object('from', v_status), null, 'pending'
  );
end;
$$;

comment on function public.proof_retry(uuid) is
  'Member ACTIVE mengembalikan proof failed/retrying ke antrian delivery. manual_review TIDAK retry-able. Attempt count dipertahankan.';

revoke all on function public.proof_retry(uuid) from public;
grant execute on function public.proof_retry(uuid) to authenticated;