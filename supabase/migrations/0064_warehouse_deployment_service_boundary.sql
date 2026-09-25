revoke insert on table public.warehouses from authenticated;
drop policy if exists warehouses_insert_own on public.warehouses;

revoke execute on function public.create_warehouse_and_deployment(text, text, text, text, text, text, bigint, text, bigint, bigint, text, text) from public, anon, authenticated;
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
  p_idempotency_key text,
  p_actor_user_id uuid
)
returns table (created_warehouse_id uuid, created_deployment_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primary_wallet text;
  v_warehouse_id uuid;
  v_deployment_id uuid;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  if not exists (
    select 1
    from public.users
    where id = p_actor_user_id
  ) then
    raise exception 'actor not found';
  end if;

  if p_warehouse_code is null or btrim(p_warehouse_code) = ''
     or p_name is null or btrim(p_name) = '' then
    raise exception 'warehouse code and name are required';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required';
  end if;

  if p_signature is null or btrim(p_signature) = '' then
    raise exception 'deployment signature is required';
  end if;

  if p_on_chain_owner_wallet is null
     or p_on_chain_owner_wallet !~* '^0x[0-9a-f]{40}$' then
    raise exception 'invalid owner wallet';
  end if;

  if p_factory_address is null
     or p_factory_address !~* '^0x[0-9a-f]{40}$' then
    raise exception 'invalid factory address';
  end if;

  if p_warehouse_code_hash is null
     or p_warehouse_code_hash !~* '^0x[0-9a-f]{64}$' then
    raise exception 'invalid warehouse code hash';
  end if;

  if p_signature !~* '^0x[0-9a-f]{130,132}$' then
    raise exception 'invalid deployment signature';
  end if;

  if p_chain_id <= 0 or p_deployment_nonce < 0 or p_expiry <= 0 then
    raise exception 'invalid deployment parameters';
  end if;

  if p_expiry <= extract(epoch from now())::bigint then
    raise exception 'deployment authorization expired';
  end if;

  select lower(w.address)
    into v_primary_wallet
  from public.wallets as w
  where w.user_id = p_actor_user_id
    and w.is_primary
    and w.verification_state = 'verified'
    and lower(w.address) = lower(btrim(p_on_chain_owner_wallet))
  limit 1;

  if v_primary_wallet is null then
    raise exception 'owner wallet is not the actor primary verified wallet';
  end if;

  if exists (
    select 1
    from public.warehouses as w
    where w.owner_user_id = p_actor_user_id
      and w.status = 'active'
  ) then
    raise exception 'already has an active warehouse';
  end if;

  if exists (
    select 1
    from public.warehouse_deployments as d
    where d.idempotency_key = btrim(p_idempotency_key)
  ) then
    raise exception 'idempotency key already used';
  end if;

  insert into public.warehouses (
    warehouse_code,
    name,
    company_name,
    warehouse_type,
    owner_user_id,
    on_chain_owner_wallet,
    status
  ) values (
    btrim(p_warehouse_code),
    btrim(p_name),
    p_company_name,
    p_warehouse_type,
    p_actor_user_id,
    v_primary_wallet,
    'active'
  )
  returning id into v_warehouse_id;

  insert into public.warehouse_deployments (
    warehouse_id,
    factory_address,
    chain_id,
    owner_address,
    warehouse_code_hash,
    deployment_nonce,
    expiry,
    signature,
    status,
    idempotency_key
  ) values (
    v_warehouse_id,
    p_factory_address,
    p_chain_id,
    v_primary_wallet,
    lower(btrim(p_warehouse_code_hash)),
    p_deployment_nonce,
    p_expiry,
    p_signature,
    'pending',
    btrim(p_idempotency_key)
  )
  returning id into v_deployment_id;

  insert into public.memberships (
    warehouse_id,
    user_id,
    role,
    status,
    joined_at
  ) values (
    v_warehouse_id,
    p_actor_user_id,
    'OWNER',
    'ACTIVE',
    now()
  )
  on conflict (warehouse_id, user_id) do update
    set role = 'OWNER',
        status = 'ACTIVE',
        joined_at = now(),
        updated_at = now();

  perform private.write_audit(
    null,
    p_actor_user_id,
    'warehouse_creation_claimed',
    'warehouses',
    v_warehouse_id::text,
    null,
    jsonb_build_object(
      'warehouse_id', v_warehouse_id,
      'deployment_id', v_deployment_id,
      'status', 'pending'
    ),
    null,
    'pending'
  );

  return query select v_warehouse_id, v_deployment_id;
end;
$$;

revoke execute on function public.update_warehouse_deployment_status(uuid, text, text, text) from public, anon, authenticated;
drop function if exists public.update_warehouse_deployment_status(uuid, text, text, text);

create or replace function public.update_warehouse_deployment_status(
  p_deployment_id uuid,
  p_status text,
  p_tx_hash text,
  p_error text,
  p_actor_user_id uuid
)
returns public.warehouse_deployments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deployment public.warehouse_deployments;
  v_warehouse public.warehouses;
  v_next_status text;
  v_previous_status text;
  v_tx_hash text;
  v_error text;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  if p_deployment_id is null then
    raise exception 'deployment id is required';
  end if;

  v_next_status := lower(btrim(coalesce(p_status, '')));
  if v_next_status not in ('pending', 'submitted', 'confirmed', 'failed') then
    raise exception 'invalid deployment status';
  end if;

  if p_tx_hash is not null
     and btrim(p_tx_hash) <> ''
     and btrim(p_tx_hash) !~* '^0x[0-9a-f]{64}$' then
    raise exception 'invalid transaction hash';
  end if;

  select d.*
    into v_deployment
  from public.warehouse_deployments as d
  where d.id = p_deployment_id
  for update;

  if v_deployment.id is null then
    raise exception 'deployment not found';
  end if;

  if v_deployment.warehouse_id is null then
    raise exception 'deployment warehouse not found';
  end if;

  select w.*
    into v_warehouse
  from public.warehouses as w
  where w.id = v_deployment.warehouse_id
  for update;

  if v_warehouse.id is null then
    raise exception 'warehouse not found';
  end if;

  if v_warehouse.owner_user_id is distinct from p_actor_user_id then
    raise exception 'not owner of warehouse';
  end if;

  if v_warehouse.status <> 'active' then
    raise exception 'warehouse is not active';
  end if;

  if not exists (
    select 1
    from public.memberships as m
    where m.warehouse_id = v_warehouse.id
      and m.user_id = p_actor_user_id
      and m.role = 'OWNER'
      and m.status = 'ACTIVE'
  ) then
    raise exception 'owner membership is not active';
  end if;

  if nullif(btrim(v_deployment.tx_hash), '') is not null
     and btrim(v_deployment.tx_hash) !~* '^0x[0-9a-f]{64}$' then
    raise exception 'invalid existing transaction hash';
  end if;

  v_tx_hash := nullif(btrim(coalesce(p_tx_hash, '')), '');
  if v_tx_hash is null then
    v_tx_hash := nullif(btrim(coalesce(v_deployment.tx_hash, '')), '');
  end if;

  if nullif(btrim(v_deployment.tx_hash), '') is not null
     and v_tx_hash is not null
     and lower(v_tx_hash) <> lower(btrim(v_deployment.tx_hash)) then
    raise exception 'transaction hash does not match existing deployment';
  end if;

  if v_next_status in ('submitted', 'confirmed') then
    if v_tx_hash is null or v_tx_hash !~* '^0x[0-9a-f]{64}$' then
      raise exception 'submitted or confirmed deployment requires a valid transaction hash';
    end if;
  end if;

  v_previous_status := v_deployment.status;

  if v_previous_status = 'confirmed' and v_next_status <> 'confirmed' then
    raise exception 'confirmed deployment cannot regress';
  end if;

  if v_next_status = v_previous_status then
    return v_deployment;
  end if;

  if not (
    (v_previous_status = 'pending' and v_next_status = 'submitted')
    or (v_previous_status = 'submitted' and v_next_status in ('confirmed', 'failed'))
  ) then
    raise exception 'invalid deployment status transition';
  end if;

  v_error := coalesce(
    nullif(btrim(p_error), ''),
    nullif(btrim(v_deployment.error), ''),
    'warehouse deployment failed'
  );

  update public.warehouse_deployments as d
  set status = v_next_status,
      tx_hash = case
        when v_next_status in ('submitted', 'confirmed') then v_tx_hash
        else coalesce(v_tx_hash, d.tx_hash)
      end,
      error = case
        when v_next_status = 'failed' then v_error
        else null
      end,
      updated_at = now()
  where d.id = p_deployment_id
    and d.status = v_previous_status
  returning d.* into v_deployment;

  if v_deployment.id is null then
    raise exception 'deployment already processed';
  end if;

  perform private.write_audit(
    null,
    p_actor_user_id,
    'warehouse_deployment_status_changed',
    'warehouse_deployments',
    v_deployment.id::text,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object(
      'warehouse_id', v_warehouse.id,
      'status', v_deployment.status,
      'tx_hash', v_deployment.tx_hash
    ),
    v_deployment.tx_hash,
    v_deployment.status
  );

  return v_deployment;
end;
$$;

revoke execute on function public.rollback_warehouse_creation(uuid, text) from public, anon, authenticated;
drop function if exists public.rollback_warehouse_creation(uuid, text);

create or replace function public.rollback_warehouse_creation(
  p_deployment_id uuid,
  p_error text,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deployment public.warehouse_deployments;
  v_warehouse public.warehouses;
  v_warehouse_id uuid;
  v_previous_status text;
  v_error text;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  if p_deployment_id is null then
    raise exception 'deployment id is required';
  end if;

  select d.*
    into v_deployment
  from public.warehouse_deployments as d
  where d.id = p_deployment_id
  for update;

  if v_deployment.id is null then
    raise exception 'deployment not found';
  end if;

  if v_deployment.status not in ('pending', 'submitted', 'failed') then
    if v_deployment.status = 'confirmed' then
      raise exception 'confirmed deployment cannot be rolled back';
    end if;
    raise exception 'deployment is not rollbackable';
  end if;

  if v_deployment.warehouse_id is null then
    if v_deployment.status = 'failed' then
      return;
    end if;
    raise exception 'deployment warehouse not found';
  end if;

  v_warehouse_id := v_deployment.warehouse_id;

  select w.*
    into v_warehouse
  from public.warehouses as w
  where w.id = v_warehouse_id
  for update;

  if v_warehouse.id is null then
    raise exception 'warehouse not found';
  end if;

  if v_warehouse.owner_user_id is distinct from p_actor_user_id then
    raise exception 'not owner of warehouse';
  end if;

  if v_warehouse.status <> 'active' then
    raise exception 'warehouse is not active';
  end if;

  if not exists (
    select 1
    from public.memberships as m
    where m.warehouse_id = v_warehouse.id
      and m.user_id = p_actor_user_id
      and m.role = 'OWNER'
      and m.status = 'ACTIVE'
  ) then
    raise exception 'owner membership is not active';
  end if;

  v_previous_status := v_deployment.status;
  v_error := coalesce(
    nullif(btrim(p_error), ''),
    nullif(btrim(v_deployment.error), ''),
    'warehouse deployment failed'
  );

  update public.warehouse_deployments as d
  set status = 'failed',
      error = v_error,
      updated_at = now()
  where d.id = p_deployment_id
    and d.status in ('pending', 'submitted', 'failed')
  returning d.* into v_deployment;

  if v_deployment.id is null then
    raise exception 'deployment already processed';
  end if;

  perform private.write_audit(
    null,
    p_actor_user_id,
    'warehouse_creation_rolled_back',
    'warehouse_deployments',
    v_deployment.id::text,
    jsonb_build_object(
      'status', v_previous_status,
      'warehouse_id', v_warehouse_id
    ),
    jsonb_build_object('status', 'failed', 'error', v_error),
    v_deployment.tx_hash,
    'failed'
  );

  delete from public.warehouses
  where id = v_warehouse_id;
end;
$$;

revoke execute on function public.create_warehouse_and_deployment(text, text, text, text, text, text, bigint, text, bigint, bigint, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.update_warehouse_deployment_status(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.rollback_warehouse_creation(uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.create_warehouse_and_deployment(text, text, text, text, text, text, bigint, text, bigint, bigint, text, text, uuid) to service_role;
grant execute on function public.update_warehouse_deployment_status(uuid, text, text, text, uuid) to service_role;
grant execute on function public.rollback_warehouse_creation(uuid, text, uuid) to service_role;
