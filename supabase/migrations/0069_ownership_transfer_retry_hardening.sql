create or replace function public.confirm_ownership_transfer(
  p_warehouse_id uuid,
  p_new_owner_id uuid,
  p_tx_hash text,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := p_actor_user_id;
  v_target public.memberships;
  v_target_wallet text;
  v_actor_name text;
  v_new_owner_name text;
  v_wh_name text;
  v_warehouse public.warehouses;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_warehouse
  from public.warehouses
  where id = p_warehouse_id
  for update;

  if v_warehouse.id is null then
    raise exception 'warehouse not found';
  end if;

  if v_warehouse.contract_address is null then
    raise exception 'warehouse is not deployed on-chain';
  end if;

  if v_warehouse.owner_user_id = p_new_owner_id then
    if exists (
      select 1
      from public.memberships
      where warehouse_id = p_warehouse_id
        and user_id = p_new_owner_id
        and role = 'OWNER'
        and status = 'ACTIVE'
    ) then
      return;
    end if;
    raise exception 'ownership retry is not in a consistent state';
  end if;

  if p_new_owner_id is null or p_new_owner_id = v_actor_id then
    raise exception 'already the owner';
  end if;

  if v_warehouse.owner_user_id is distinct from v_actor_id then
    raise exception 'only owner can confirm ownership transfer';
  end if;

  select * into v_target
  from public.memberships
  where warehouse_id = p_warehouse_id
    and user_id = p_new_owner_id
  for update;

  if v_target.id is null then
    raise exception 'target is not a member';
  end if;

  if v_target.status is distinct from 'ACTIVE' then
    raise exception 'target membership is not active';
  end if;

  select lower(address) into v_target_wallet
  from public.wallets
  where user_id = p_new_owner_id
    and is_primary
    and verification_state = 'verified'
  limit 1
  for update;

  if v_target_wallet is null then
    raise exception 'target has no verified primary wallet';
  end if;

  update public.memberships
  set role = 'OWNER', updated_at = pg_catalog.now()
  where id = v_target.id
    and warehouse_id = p_warehouse_id
    and user_id = p_new_owner_id
    and status = 'ACTIVE'
    and role is distinct from 'OWNER'
  returning * into v_target;

  if not found then
    raise exception 'target membership changed';
  end if;

  update public.memberships
  set role = 'MANAGER', updated_at = pg_catalog.now()
  where warehouse_id = p_warehouse_id
    and user_id = v_actor_id
    and role = 'OWNER'
    and status = 'ACTIVE'
  returning * into v_target;

  if not found then
    raise exception 'owner membership changed';
  end if;

  perform pg_catalog.set_config('app.allow_identity_write', 'true', true);

  update public.warehouses
  set owner_user_id = p_new_owner_id,
      on_chain_owner_wallet = v_target_wallet
  where id = p_warehouse_id
    and owner_user_id = v_actor_id
    and contract_address is not null;

  if not found then
    raise exception 'warehouse ownership changed';
  end if;

  select coalesce(display_name, pg_catalog.split_part(email, '@', 1), 'Pengguna')
    into v_actor_name
  from public.users
  where id = v_actor_id;
  select coalesce(display_name, pg_catalog.split_part(email, '@', 1), 'Pengguna')
    into v_new_owner_name
  from public.users
  where id = p_new_owner_id;
  select name into v_wh_name
  from public.warehouses
  where id = p_warehouse_id;

  perform private.write_notification(
    p_new_owner_id,
    p_warehouse_id,
    'ownership_transferred',
    'Kepemilikan warehouse',
    pg_catalog.format('Kamu kini pemilik %s (dialihkan oleh %s)', v_wh_name, v_actor_name),
    pg_catalog.jsonb_build_object(
      'warehouse_id', p_warehouse_id,
      'previous_owner', v_actor_id,
      'tx_hash', p_tx_hash
    ),
    'ownership:' || p_warehouse_id::text
  );
  perform private.write_notification(
    v_actor_id,
    p_warehouse_id,
    'ownership_transferred',
    'Kepemilikan warehouse',
    pg_catalog.format('Kepemilikan %s berpindah ke %s', v_wh_name, v_new_owner_name),
    pg_catalog.jsonb_build_object(
      'warehouse_id', p_warehouse_id,
      'new_owner', p_new_owner_id,
      'tx_hash', p_tx_hash
    ),
    'ownership:' || p_warehouse_id::text
  );

  perform private.write_audit(
    p_warehouse_id,
    v_actor_id,
    'ownership_transferred',
    'warehouses',
    p_warehouse_id::text,
    null,
    pg_catalog.jsonb_build_object('tx_hash', p_tx_hash, 'new_owner_id', p_new_owner_id),
    p_tx_hash,
    'confirmed'
  );
end;
$$;

revoke all on function public.confirm_ownership_transfer(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.confirm_ownership_transfer(uuid, uuid, text, uuid) to service_role;
