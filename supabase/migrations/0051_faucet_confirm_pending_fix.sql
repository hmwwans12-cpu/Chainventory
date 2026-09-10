-- ============================================================================
-- Chainventory — 0051: faucet confirm pending fix (audit Bagian A A2)
-- ============================================================================
-- Bug: lib/faucet/claim.ts memanggil confirm_faucet_claim(p_claim_id,
-- tx_hash, 'pending') setelah broadcast sukses ("status stays pending until
-- confirmed"), tetapi 0022 hanya mengizinkan p_status IN
-- ('confirmed','failed') → selalu raise invalid_parameter_value. Akibat:
-- tx_hash tidak pernah tersimpan, klaim terjebak pending tanpa hash,
-- rekonsiliasi yatim tidak punya hash.
--
-- Fix: izinkan p_status = 'pending' sebagai state "broadcasted, awaiting
-- confirmation" — update tx_hash, pertahankan status pending, jangan set
-- confirmed_at/error. 'confirmed'/'failed' tetap seperti semula.
-- ADDITIVE murni. Signature tidak berubah. Grants tetap.
-- ============================================================================

create or replace function public.confirm_faucet_claim(
  p_claim_id uuid,
  p_tx_hash text,
  p_status text default 'confirmed'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('role') != 'service_role' then
    raise exception 'confirm_faucet_claim: service_role required'
      using errcode = 'insufficient_privilege';
  end if;

  if p_status not in ('pending', 'confirmed', 'failed') then
    raise exception 'confirm_faucet_claim: status must be pending, confirmed or failed'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_status = 'pending' then
    -- Broadcast sukses, belum confirmed: simpan tx_hash, tetap pending.
    update public.faucet_claims
    set tx_hash = p_tx_hash
    where id = p_claim_id and status = 'pending';

    if not found then
      raise exception 'confirm_faucet_claim: claim not found or not pending'
        using errcode = 'no_data_found';
    end if;

    return jsonb_build_object('ok', true, 'status', 'pending');
  end if;

  update public.faucet_claims
  set tx_hash = p_tx_hash,
      status = p_status,
      error = case when p_status = 'failed' then 'transaction failed on-chain' else null end,
      confirmed_at = case when p_status = 'confirmed' then now() else null end
  where id = p_claim_id and status = 'pending';

  if not found then
    raise exception 'confirm_faucet_claim: claim not found or not pending'
      using errcode = 'no_data_found';
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.confirm_faucet_claim is
  'Update faucet claim status setelah broadcast/confirmation (PRD §17). pending = broadcasted, tx_hash tersimpan, menunggu konfirmasi.';

revoke execute on function public.confirm_faucet_claim from public;
revoke execute on function public.confirm_faucet_claim from authenticated;
revoke execute on function public.confirm_faucet_claim from anon;
grant execute on function public.confirm_faucet_claim to service_role;
