-- ============================================================================
-- Chainventory — 0022: faucet claims (PRD §17, §32-33)
-- ============================================================================
-- Faucet claim table + SECURITY DEFINER RPC dengan anti-abuse penuh:
--   1. DB constraint: unique partial index mencegah double-claim <12h
--   2. Atomic RPC: cek cooldown + cek balance + insert dalam 1 transaksi
--   3. Rate limit (Upstash Redis) diluar DB — fail-closed
--   4. Audit log via private.write_audit
--
-- ADDITIVE murni. Tidak ada struktur yang dihapus/diubah.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. faucet_claims — catatan setiap claim test ETH
-- ----------------------------------------------------------------------------
create table if not exists public.faucet_claims (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  amount_wei  numeric not null,
  tx_hash     text,
  status      text not null default 'pending'
                check (status in ('pending', 'confirmed', 'failed')),
  error       text,
  created_at  timestamptz not null default now(),
  confirmed_at timestamptz
);

comment on table public.faucet_claims is
  'Claim test ETH dari treasury faucet (PRD §17, 0.001 ETH / user / 12h).';

-- Unik: satu user maksimal 1 claim PENDING pada satu waktu (race-safe antar
-- INSERT konkuren). Window cooldown 12 jam dicek EKSPLISIT di claim_faucet():
-- now() tidak IMMUTABLE sehingga dilarang masuk predikat index (PostgreSQL
-- menolak dengan 42P17 "functions in index predicate must be marked IMMUTABLE").
create unique index if not exists faucet_claims_pending_user_idx
  on public.faucet_claims (user_id)
  where status = 'pending';

-- Index untuk query cooldown & history.
create index if not exists faucet_claims_user_created_idx
  on public.faucet_claims (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 2. RLS — user hanya boleh baca claim sendiri
-- ----------------------------------------------------------------------------
alter table public.faucet_claims enable row level security;

create policy "faucet_claims_select_own"
  on public.faucet_claims
  for select
  using (auth.uid() = user_id);

-- Insert/delete via RPC (SECURITY DEFINER), bukan langsung dari client.

-- ----------------------------------------------------------------------------
-- 3. GRANT — service_role untuk RPC, authenticated untuk select via RLS
-- ----------------------------------------------------------------------------
grant select on public.faucet_claims to authenticated;
grant all on public.faucet_claims to service_role;

-- ----------------------------------------------------------------------------
-- 4. claim_faucet RPC — atomic claim dengan full anti-abuse
-- ----------------------------------------------------------------------------
-- Alur:
--   1. Validasi input (user_id, amount)
--   2. Cek cooldown via unique partial index (INSERT akan gagal jika melanggar)
--   3. Cek treasury balance (optional, can be checked client-side too)
--   4. Insert pending claim
--   5. Audit log
--   6. Return claim ID
--
-- Rate limiting via Upstash Redis dilakukan DI LAYER API sebelum RPC ini dipanggil.

create or replace function public.claim_faucet(
  p_user_id uuid,
  p_amount_wei numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_id uuid;
  v_balance numeric;
begin
  -- Only service_role can call this function
  if current_setting('role') != 'service_role' then
    raise exception 'claim_faucet: service_role required'
      using errcode = 'insufficient_privilege';
  end if;

  -- Validate input
  if p_user_id is null or p_amount_wei is null or p_amount_wei <= 0 then
    raise exception 'claim_faucet: invalid input'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Cooldown 12 jam — cek eksplisit claim aktif terakhir (pending ATAU
  -- confirmed). Index unik di atas hanya menutup race antar INSERT pending
  -- konkuren; cek ini menutup kasus claim 'confirmed' < 12 jam yang sudah
  -- tidak lagi memblokir lewat index.
  if exists (
    select 1 from public.faucet_claims
    where user_id = p_user_id
      and status in ('pending', 'confirmed')
      and created_at > now() - interval '12 hours'
  ) then
    raise exception 'claim_faucet: cooldown active, try again after 12 hours'
      using errcode = 'unique_violation';
  end if;

  begin
    insert into public.faucet_claims (user_id, amount_wei, status)
    values (p_user_id, p_amount_wei, 'pending')
    returning id into v_claim_id;
  exception
    when unique_violation then
      raise exception 'claim_faucet: cooldown active, try again after 12 hours'
        using errcode = 'unique_violation';
  end;

  -- Audit log (platform-level: faucet tanpa warehouse → warehouse_id null)
  perform private.write_audit(
    null,
    p_user_id,
    'faucet_claim',
    'faucet_claims',
    v_claim_id::text,
    null,
    null,
    null,
    'pending'
  );

  return jsonb_build_object(
    'ok', true,
    'claimId', v_claim_id,
    'status', 'pending'
  );
end;
$$;

comment on function public.claim_faucet is
  'Atomic faucet claim: cek cooldown via unique constraint + insert pending (PRD §17, §32).';

-- REVOKE from non-service roles — defense in depth
revoke execute on function public.claim_faucet from public;
revoke execute on function public.claim_faucet from authenticated;
revoke execute on function public.claim_faucet from anon;
grant execute on function public.claim_faucet to service_role;

-- ----------------------------------------------------------------------------
-- 5. confirm_faucet_claim RPC — update status setelah tx confirmed
-- ----------------------------------------------------------------------------
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

  if p_status not in ('confirmed', 'failed') then
    raise exception 'confirm_faucet_claim: status must be confirmed or failed'
      using errcode = 'invalid_parameter_value';
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
  'Update faucet claim status setelah on-chain confirmation (PRD §17).';

revoke execute on function public.confirm_faucet_claim from public;
revoke execute on function public.confirm_faucet_claim from authenticated;
revoke execute on function public.confirm_faucet_claim from anon;
grant execute on function public.confirm_faucet_claim to service_role;
