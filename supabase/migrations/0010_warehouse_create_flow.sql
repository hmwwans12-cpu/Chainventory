-- ============================================================================
-- Chainventory — 0010: Create Warehouse flow RPC (EIP-712 relay, PRD §6.4/§7)
-- ============================================================================
-- Aliran: ADDITIVE murni (expand–migrate–contract, WORKFLOW §4). Hanya fungsi
-- baru + grant; tidak mengubah tabel/RLS existing.
--
-- Backend create warehouse (P1 Step 1 sisa):
--   - `create_warehouse_and_deployment`   : ATOMIK membuat warehouses +
--                                           warehouse_deployments + membership
--                                           OWNER untuk creator (PRD §6.1).
--                                           Dipanggil SERVER flow SETELAH
--                                           signature EIP-712 diverifikasi &
--                                           relay on-chain siap (write-intent
--                                           lalu execute, seperti proof_outbox).
--   - `update_warehouse_deployment_status`: update lifecycle deployment
--                                           (submitting → submitted/confirmed/
--                                           failed) hanya oleh owner.
--   - `rollback_warehouse_creation`       : batalkan klaim off-chain bila tx
--                                           revert/menolak (hapus warehouses;
--                                           deployment dicatat 'failed' utk
--                                           audit; FK deployment set null).
--
-- warehouses INSERT sudah diizinkan `warehouses_insert_own` (0003), tapi
-- warehouse_deployments & memberships deny-by-default → lewat fungsi security
-- definer ini (konsisten dengan pola 0005: cek auth.uid() eksplisit, search_path
-- dijaga, JANGAN andalkan RLS untuk fungsi mutasi — PLAN_04 §9.6).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. create_warehouse_and_deployment — klaim atomik (warehouses + deployment + OWNER)
-- ----------------------------------------------------------------------------
-- DROP dahulu: perubahan `returns table` (kolom output di-prefix) tidak bisa
-- `create or replace` (return type berubah) — idempotent untuk re-apply.
drop function if exists public.create_warehouse_and_deployment(text, text, text, text, text, text, bigint, text, bigint, bigint, text, text);
create or replace function public.create_warehouse_and_deployment(
  p_warehouse_code text,
  p_name text,
  p_company_name text,
  p_warehouse_type text,
  p_on_chain_owner_wallet text,
  p_factory_address text,
  p_chain_id bigint,
  p_warehouse_code_hash text,
  p_deployment_nonce bigint,
  p_expiry bigint,
  p_signature text,
  p_idempotency_key text
)
-- Kolom output diberi prefix agar TIDAK ambigu dengan kolom INSERT
-- (OUT param bernama sama dengan kolom tabel → "column reference is ambiguous").
returns table (created_warehouse_id uuid, created_deployment_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_warehouse_id uuid;
  v_deployment_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- Satu warehouse aktif per user (off-chain claim; enforcement on-chain di Factory).
  if exists (
    select 1 from public.warehouses w
    where w.owner_user_id = v_user_id and w.status = 'active'
  ) then
    raise exception 'already has an active warehouse';
  end if;

  if btrim(p_warehouse_code) = '' or btrim(p_name) = '' then
    raise exception 'warehouse code and name are required';
  end if;

  insert into public.warehouses (
    warehouse_code, name, company_name, warehouse_type,
    owner_user_id, on_chain_owner_wallet, status
  ) values (
    p_warehouse_code, p_name, p_company_name, p_warehouse_type,
    v_user_id, lower(p_on_chain_owner_wallet), 'active'
  ) returning id into v_warehouse_id;

  insert into public.warehouse_deployments (
    warehouse_id, factory_address, chain_id, owner_address,
    warehouse_code_hash, deployment_nonce, expiry, signature,
    status, idempotency_key
  ) values (
    v_warehouse_id, p_factory_address, p_chain_id, lower(p_on_chain_owner_wallet),
    p_warehouse_code_hash, p_deployment_nonce, p_expiry, p_signature,
    'pending', p_idempotency_key
  ) returning id into v_deployment_id;

  -- Creator otomatis menjadi OWNER (PRD §6.1). Idempotent.
  insert into public.memberships (warehouse_id, user_id, role, status, joined_at)
  values (v_warehouse_id, v_user_id, 'OWNER', 'ACTIVE', now())
  on conflict (warehouse_id, user_id) do nothing;

  return query select v_warehouse_id, v_deployment_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. update_warehouse_deployment_status — lifecycle oleh owner
-- ----------------------------------------------------------------------------
create or replace function public.update_warehouse_deployment_status(
  p_deployment_id uuid,
  p_status text,
  p_tx_hash text default null,
  p_error text default null
)
returns public.warehouse_deployments
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_deployment public.warehouse_deployments;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_status not in ('pending', 'submitting', 'submitted', 'confirmed', 'failed') then
    raise exception 'invalid deployment status';
  end if;

  select * into v_deployment
  from public.warehouse_deployments
  where id = p_deployment_id;

  if v_deployment is null then
    raise exception 'deployment not found';
  end if;

  if not exists (
    select 1 from public.warehouses w
    where w.id = v_deployment.warehouse_id and w.owner_user_id = v_user_id
  ) then
    raise exception 'not owner of warehouse';
  end if;

  update public.warehouse_deployments
    set status = p_status,
        tx_hash = coalesce(p_tx_hash, tx_hash),
        error = coalesce(p_error, error),
        updated_at = now()
  where id = p_deployment_id
  returning * into v_deployment;

  return v_deployment;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. rollback_warehouse_creation — batalkan klaim off-chain saat tx gagal
-- ----------------------------------------------------------------------------
create or replace function public.rollback_warehouse_creation(
  p_deployment_id uuid,
  p_error text default 'warehouse deployment failed'
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_deployment public.warehouse_deployments;
  v_warehouse_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_deployment
  from public.warehouse_deployments
  where id = p_deployment_id;

  if v_deployment is null then
    raise exception 'deployment not found';
  end if;

  if not exists (
    select 1 from public.warehouses w
    where w.id = v_deployment.warehouse_id and w.owner_user_id = v_user_id
  ) then
    raise exception 'not owner of warehouse';
  end if;

  -- Catat kegagalan untuk audit, lalu hapus klaim off-chain (FK deployment
  -- on delete set null → baris deployment tetap tersimpan dengan status failed).
  update public.warehouse_deployments
    set status = 'failed', error = p_error, updated_at = now()
  where id = p_deployment_id;

  delete from public.warehouses
  where id = v_deployment.warehouse_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. GRANT execute (server flow).
-- ----------------------------------------------------------------------------
grant execute on function public.create_warehouse_and_deployment(text, text, text, text, text, text, bigint, text, bigint, bigint, text, text) to authenticated;
grant execute on function public.update_warehouse_deployment_status(uuid, text, text, text) to authenticated;
grant execute on function public.rollback_warehouse_creation(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Realtime (whitelist eksplisit, ARSITEKTUR §6): UI deployment UX (DESIGN §28)
--    butuh status deployment live per-warehouse.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'warehouse_deployments'
  ) then
    alter publication supabase_realtime add table public.warehouse_deployments;
  end if;
end;
$$;