alter table public.warehouses
  add column if not exists ownership_generation bigint not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'warehouses_ownership_generation_nonnegative'
      and conrelid = 'public.warehouses'::regclass
  ) then
    alter table public.warehouses
      add constraint warehouses_ownership_generation_nonnegative
      check (ownership_generation >= 0);
  end if;
end;
$$;

create table if not exists public.ownership_transfer_intents (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  actor_user_id uuid not null references public.users (id) on delete cascade,
  previous_owner_user_id uuid not null references public.users (id),
  new_owner_user_id uuid not null references public.users (id),
  previous_owner_wallet text not null,
  new_owner_wallet text not null,
  contract_address text not null,
  ownership_generation bigint not null,
  status text not null default 'prepared'
    check (status in ('prepared', 'submitted', 'confirmed', 'failed', 'expired')),
  idempotency_key text not null,
  tx_hash text,
  error text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  constraint ownership_transfer_intents_idempotency_key_not_blank
    check (pg_catalog.btrim(idempotency_key) <> ''),
  constraint ownership_transfer_intents_tx_hash_valid
    check (tx_hash is null or tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  constraint ownership_transfer_intents_generation_nonnegative
    check (ownership_generation >= 0),
  constraint ownership_transfer_intents_distinct_parties
    check (actor_user_id <> new_owner_user_id)
);

create unique index if not exists ownership_transfer_intents_idempotency_idx
  on public.ownership_transfer_intents (warehouse_id, idempotency_key);

create unique index if not exists ownership_transfer_intents_active_warehouse_idx
  on public.ownership_transfer_intents (warehouse_id)
  where status in ('prepared', 'submitted');

create index if not exists ownership_transfer_intents_actor_idx
  on public.ownership_transfer_intents (warehouse_id, actor_user_id, created_at desc);

create or replace function public.set_ownership_transfer_intent_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists ownership_transfer_intents_set_updated_at
  on public.ownership_transfer_intents;
create trigger ownership_transfer_intents_set_updated_at
  before update on public.ownership_transfer_intents
  for each row execute function public.set_ownership_transfer_intent_updated_at();

create or replace function public.guard_warehouse_ownership_generation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    if exists (
      select 1
      from public.ownership_transfer_intents
      where warehouse_id = old.id
        and status in ('prepared', 'submitted')
        and expires_at > pg_catalog.now()
    ) then
      raise exception 'OWNERSHIP_INTENT_PENDING';
    end if;
    new.ownership_generation := old.ownership_generation + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists warehouses_guard_ownership_generation
  on public.warehouses;
create trigger warehouses_guard_ownership_generation
  before update of owner_user_id on public.warehouses
  for each row execute function public.guard_warehouse_ownership_generation();

alter table public.ownership_transfer_intents enable row level security;
revoke all on table public.ownership_transfer_intents from anon, authenticated;
grant select, insert, update, delete on table public.ownership_transfer_intents to service_role;

create or replace function public.prepare_ownership_transfer_intent(
  p_warehouse_id uuid,
  p_new_owner_id uuid,
  p_actor_user_id uuid,
  p_idempotency_key text
)
returns public.ownership_transfer_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warehouse public.warehouses;
  v_actor_membership public.memberships;
  v_target_membership public.memberships;
  v_wallet text;
  v_intent public.ownership_transfer_intents;
  v_now timestamptz := pg_catalog.now();
begin
  if p_actor_user_id is null
     or p_new_owner_id is null
     or p_idempotency_key is null
     or pg_catalog.btrim(p_idempotency_key) = '' then
    raise exception 'INVALID_INPUT';
  end if;

  if p_new_owner_id = p_actor_user_id then
    raise exception 'ALREADY_OWNER';
  end if;

  select * into v_warehouse
  from public.warehouses
  where id = p_warehouse_id
  for update;

  if v_warehouse.id is null then
    raise exception 'WAREHOUSE_NOT_FOUND';
  end if;
  if v_warehouse.status is distinct from 'active' then
    raise exception 'WAREHOUSE_SUSPENDED';
  end if;
  if v_warehouse.contract_address is null then
    raise exception 'WAREHOUSE_NOT_DEPLOYED';
  end if;

  update public.ownership_transfer_intents
  set status = 'expired', error = 'expired'
  where warehouse_id = p_warehouse_id
    and status in ('prepared', 'submitted')
    and expires_at <= v_now;

  select * into v_intent
  from public.ownership_transfer_intents
  where warehouse_id = p_warehouse_id
    and idempotency_key = p_idempotency_key
  for update;

  if found then
    if v_intent.actor_user_id is distinct from p_actor_user_id
       or v_intent.new_owner_user_id is distinct from p_new_owner_id then
      raise exception 'OWNERSHIP_INTENT_CONFLICT';
    end if;
    if v_intent.status = 'confirmed' then
      return v_intent;
    end if;
    if v_intent.status in ('failed', 'expired') then
      raise exception 'OWNERSHIP_INTENT_EXPIRED';
    end if;
    if v_warehouse.owner_user_id is distinct from p_actor_user_id
       or v_warehouse.ownership_generation is distinct from v_intent.ownership_generation then
      raise exception 'STALE_GENERATION';
    end if;
    return v_intent;
  end if;

  if v_warehouse.owner_user_id is distinct from p_actor_user_id then
    raise exception 'ONLY_OWNER';
  end if;

  select * into v_actor_membership
  from public.memberships
  where warehouse_id = p_warehouse_id
    and user_id = p_actor_user_id
  for update;

  if v_actor_membership.id is null
     or v_actor_membership.status is distinct from 'ACTIVE'
     or v_actor_membership.role is distinct from 'OWNER' then
    raise exception 'ONLY_OWNER';
  end if;

  select * into v_target_membership
  from public.memberships
  where warehouse_id = p_warehouse_id
    and user_id = p_new_owner_id
  for update;

  if v_target_membership.id is null then
    raise exception 'TARGET_NOT_MEMBER';
  end if;
  if v_target_membership.status is distinct from 'ACTIVE' then
    raise exception 'TARGET_NOT_ACTIVE';
  end if;
  if v_target_membership.role = 'OWNER' then
    raise exception 'TARGET_ALREADY_OWNER';
  end if;

  select pg_catalog.lower(address) into v_wallet
  from public.wallets
  where user_id = p_new_owner_id
    and is_primary
    and verification_state = 'verified'
  limit 1
  for update;

  if v_wallet is null then
    raise exception 'TARGET_WALLET_NOT_VERIFIED';
  end if;

  select * into v_intent
  from public.ownership_transfer_intents
  where warehouse_id = p_warehouse_id
    and status in ('prepared', 'submitted')
    and expires_at > v_now
  order by created_at desc
  limit 1
  for update;

  if found then
    if v_intent.actor_user_id is distinct from p_actor_user_id
       or v_intent.ownership_generation is distinct from v_warehouse.ownership_generation then
      raise exception 'OWNERSHIP_INTENT_CONFLICT';
    end if;
    if v_intent.new_owner_user_id = p_new_owner_id then
      return v_intent;
    end if;
    if v_intent.status <> 'prepared' or v_intent.tx_hash is not null then
      raise exception 'OWNERSHIP_INTENT_CONFLICT';
    end if;
    update public.ownership_transfer_intents
    set status = 'failed', error = 'superseded'
    where id = v_intent.id
      and status = 'prepared'
      and tx_hash is null;
  end if;

  insert into public.ownership_transfer_intents (
    warehouse_id,
    actor_user_id,
    previous_owner_user_id,
    new_owner_user_id,
    previous_owner_wallet,
    new_owner_wallet,
    contract_address,
    ownership_generation,
    idempotency_key,
    expires_at
  )
  values (
    p_warehouse_id,
    p_actor_user_id,
    v_warehouse.owner_user_id,
    p_new_owner_id,
    pg_catalog.lower(v_warehouse.on_chain_owner_wallet),
    v_wallet,
    v_warehouse.contract_address,
    v_warehouse.ownership_generation,
    p_idempotency_key,
    v_now + interval '24 hours'
  )
  returning * into v_intent;

  return v_intent;
end;
$$;

revoke all on function public.prepare_ownership_transfer_intent(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.prepare_ownership_transfer_intent(uuid, uuid, uuid, text)
  to service_role;

create or replace function public.get_active_ownership_transfer_intent(
  p_warehouse_id uuid,
  p_actor_user_id uuid
)
returns public.ownership_transfer_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.ownership_transfer_intents;
begin
  update public.ownership_transfer_intents
  set status = 'expired', error = 'expired'
  where warehouse_id = p_warehouse_id
    and actor_user_id = p_actor_user_id
    and status in ('prepared', 'submitted')
    and expires_at <= pg_catalog.now();

  select * into v_intent
  from public.ownership_transfer_intents
  where warehouse_id = p_warehouse_id
    and actor_user_id = p_actor_user_id
    and status in ('prepared', 'submitted', 'confirmed')
  order by
    case status when 'confirmed' then 0 else 1 end,
    created_at desc
  limit 1;

  return v_intent;
end;
$$;

revoke all on function public.get_active_ownership_transfer_intent(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_active_ownership_transfer_intent(uuid, uuid)
  to service_role;

create or replace function public.record_ownership_transfer_tx(
  p_intent_id uuid,
  p_actor_user_id uuid,
  p_tx_hash text
)
returns public.ownership_transfer_intents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.ownership_transfer_intents;
  v_warehouse public.warehouses;
begin
  if p_actor_user_id is null
     or p_intent_id is null
     or p_tx_hash is null
     or p_tx_hash !~ '^0x[0-9a-fA-F]{64}$' then
    raise exception 'INVALID_INPUT';
  end if;

  select * into v_intent
  from public.ownership_transfer_intents
  where id = p_intent_id
  for update;

  if v_intent.id is null then
    raise exception 'INTENT_NOT_FOUND';
  end if;
  if v_intent.actor_user_id is distinct from p_actor_user_id then
    raise exception 'FORBIDDEN';
  end if;
  if v_intent.status = 'confirmed' then
    if lower(v_intent.tx_hash) = lower(p_tx_hash) then
      return v_intent;
    end if;
    raise exception 'OWNERSHIP_INTENT_CONFLICT';
  end if;
  if v_intent.status in ('failed', 'expired') then
    raise exception 'OWNERSHIP_INTENT_EXPIRED';
  end if;
  if v_intent.expires_at <= pg_catalog.now() then
    update public.ownership_transfer_intents
    set status = 'expired', error = 'expired'
    where id = p_intent_id;
    raise exception 'OWNERSHIP_INTENT_EXPIRED';
  end if;
  if v_intent.tx_hash is not null
     and lower(v_intent.tx_hash) <> lower(p_tx_hash) then
    raise exception 'OWNERSHIP_INTENT_CONFLICT';
  end if;

  select * into v_warehouse
  from public.warehouses
  where id = v_intent.warehouse_id
  for update;

  if v_warehouse.id is null then
    raise exception 'WAREHOUSE_NOT_FOUND';
  end if;
  if v_warehouse.owner_user_id is distinct from p_actor_user_id
     or v_warehouse.ownership_generation is distinct from v_intent.ownership_generation
     or v_warehouse.contract_address is distinct from v_intent.contract_address then
    raise exception 'STALE_GENERATION';
  end if;

  update public.ownership_transfer_intents
  set tx_hash = lower(p_tx_hash), status = 'submitted', error = null
  where id = p_intent_id
    and status in ('prepared', 'submitted')
  returning * into v_intent;

  if not found then
    raise exception 'OWNERSHIP_INTENT_CONFLICT';
  end if;
  return v_intent;
end;
$$;

revoke all on function public.record_ownership_transfer_tx(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_ownership_transfer_tx(uuid, uuid, text)
  to service_role;

create or replace function public.fail_ownership_transfer_intent(
  p_intent_id uuid,
  p_actor_user_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent public.ownership_transfer_intents;
begin
  select * into v_intent
  from public.ownership_transfer_intents
  where id = p_intent_id
  for update;

  if v_intent.id is null then
    raise exception 'INTENT_NOT_FOUND';
  end if;
  if v_intent.actor_user_id is distinct from p_actor_user_id then
    raise exception 'FORBIDDEN';
  end if;
  if v_intent.status = 'confirmed' then
    return;
  end if;
  if v_intent.status not in ('prepared', 'submitted') then
    return;
  end if;

  update public.ownership_transfer_intents
  set status = 'failed', error = left(coalesce(p_error, 'transaction failed'), 500)
  where id = p_intent_id;
end;
$$;

revoke all on function public.fail_ownership_transfer_intent(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_ownership_transfer_intent(uuid, uuid, text)
  to service_role;

create or replace function public.confirm_ownership_transfer_intent(
  p_intent_id uuid,
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
  v_intent public.ownership_transfer_intents;
  v_warehouse public.warehouses;
  v_target_membership public.memberships;
  v_target_wallet text;
  v_actor_name text;
  v_new_owner_name text;
  v_warehouse_name text;
begin
  if p_intent_id is null
     or p_warehouse_id is null
     or p_new_owner_id is null
     or p_actor_user_id is null
     or p_tx_hash is null
     or p_tx_hash !~ '^0x[0-9a-fA-F]{64}$' then
    raise exception 'INVALID_INPUT';
  end if;

  select * into v_intent
  from public.ownership_transfer_intents
  where id = p_intent_id
  for update;

  if v_intent.id is null then
    raise exception 'INTENT_NOT_FOUND';
  end if;
  if v_intent.warehouse_id is distinct from p_warehouse_id
     or v_intent.new_owner_user_id is distinct from p_new_owner_id
     or v_intent.actor_user_id is distinct from p_actor_user_id then
    raise exception 'OWNERSHIP_INTENT_CONFLICT';
  end if;
  if v_intent.status = 'confirmed' then
    if lower(v_intent.tx_hash) = lower(p_tx_hash) then
      return;
    end if;
    raise exception 'OWNERSHIP_INTENT_CONFLICT';
  end if;
  if v_intent.status in ('failed', 'expired') then
    raise exception 'OWNERSHIP_INTENT_EXPIRED';
  end if;
  if v_intent.tx_hash is null or lower(v_intent.tx_hash) <> lower(p_tx_hash) then
    raise exception 'OWNERSHIP_INTENT_CONFLICT';
  end if;
  if v_intent.expires_at <= pg_catalog.now() then
    update public.ownership_transfer_intents
    set status = 'expired', error = 'expired'
    where id = p_intent_id;
    raise exception 'OWNERSHIP_INTENT_EXPIRED';
  end if;

  select * into v_warehouse
  from public.warehouses
  where id = p_warehouse_id
  for update;

  if v_warehouse.id is null then
    raise exception 'WAREHOUSE_NOT_FOUND';
  end if;
  if v_warehouse.owner_user_id is distinct from p_actor_user_id
     or v_warehouse.ownership_generation is distinct from v_intent.ownership_generation
     or v_warehouse.contract_address is distinct from v_intent.contract_address
     or lower(v_warehouse.on_chain_owner_wallet) <> lower(v_intent.previous_owner_wallet) then
    raise exception 'STALE_GENERATION';
  end if;

  select * into v_target_membership
  from public.memberships
  where warehouse_id = p_warehouse_id
    and user_id = p_new_owner_id
  for update;

  if v_target_membership.id is null then
    raise exception 'TARGET_NOT_MEMBER';
  end if;
  if v_target_membership.status is distinct from 'ACTIVE' then
    raise exception 'TARGET_NOT_ACTIVE';
  end if;
  if v_target_membership.role = 'OWNER' then
    raise exception 'TARGET_ALREADY_OWNER';
  end if;

  select pg_catalog.lower(address) into v_target_wallet
  from public.wallets
  where user_id = p_new_owner_id
    and is_primary
    and verification_state = 'verified'
  limit 1
  for update;

  if v_target_wallet is null
     or v_target_wallet <> lower(v_intent.new_owner_wallet) then
    raise exception 'OWNERSHIP_INTENT_CONFLICT';
  end if;

  update public.ownership_transfer_intents
  set status = 'confirmed', confirmed_at = pg_catalog.now(), error = null
  where id = p_intent_id
    and status in ('prepared', 'submitted');

  if not found then
    raise exception 'OWNERSHIP_INTENT_CONFLICT';
  end if;

  update public.memberships
  set role = 'OWNER', updated_at = pg_catalog.now()
  where id = v_target_membership.id
    and warehouse_id = p_warehouse_id
    and user_id = p_new_owner_id
    and status = 'ACTIVE'
    and role is distinct from 'OWNER';

  if not found then
    raise exception 'TARGET_CHANGED';
  end if;

  update public.memberships
  set role = 'MANAGER', updated_at = pg_catalog.now()
  where warehouse_id = p_warehouse_id
    and user_id = p_actor_user_id
    and status = 'ACTIVE'
    and role = 'OWNER';

  if not found then
    raise exception 'OWNER_CHANGED';
  end if;

  perform pg_catalog.set_config('app.allow_identity_write', 'true', true);

  update public.warehouses
  set owner_user_id = p_new_owner_id,
      on_chain_owner_wallet = v_target_wallet
  where id = p_warehouse_id
    and owner_user_id = p_actor_user_id
    and ownership_generation = v_intent.ownership_generation
    and contract_address = v_intent.contract_address;

  if not found then
    raise exception 'STALE_GENERATION';
  end if;

  perform pg_catalog.set_config('app.allow_identity_write', 'false', true);

  select coalesce(display_name, pg_catalog.split_part(email, '@', 1), 'Pengguna')
    into v_actor_name
  from public.users
  where id = p_actor_user_id;
  select coalesce(display_name, pg_catalog.split_part(email, '@', 1), 'Pengguna')
    into v_new_owner_name
  from public.users
  where id = p_new_owner_id;
  select name into v_warehouse_name
  from public.warehouses
  where id = p_warehouse_id;

  perform private.write_notification(
    p_new_owner_id,
    p_warehouse_id,
    'ownership_transferred',
    'Kepemilikan warehouse',
    pg_catalog.format('Kamu kini pemilik %s (dialihkan oleh %s)', v_warehouse_name, v_actor_name),
    pg_catalog.jsonb_build_object(
      'warehouse_id', p_warehouse_id,
      'previous_owner', p_actor_user_id,
      'tx_hash', p_tx_hash,
      'intent_id', p_intent_id
    ),
    'ownership:' || p_warehouse_id::text || ':' || p_intent_id::text
  );
  perform private.write_notification(
    p_actor_user_id,
    p_warehouse_id,
    'ownership_transferred',
    'Kepemilikan warehouse',
    pg_catalog.format('Kepemilikan %s berpindah ke %s', v_warehouse_name, v_new_owner_name),
    pg_catalog.jsonb_build_object(
      'warehouse_id', p_warehouse_id,
      'new_owner', p_new_owner_id,
      'tx_hash', p_tx_hash,
      'intent_id', p_intent_id
    ),
    'ownership:' || p_warehouse_id::text || ':' || p_intent_id::text
  );

  perform private.write_audit(
    p_warehouse_id,
    p_actor_user_id,
    'ownership_transferred',
    'warehouses',
    p_warehouse_id::text,
    null,
    pg_catalog.jsonb_build_object(
      'tx_hash', p_tx_hash,
      'new_owner_id', p_new_owner_id,
      'intent_id', p_intent_id,
      'ownership_generation', v_intent.ownership_generation
    ),
    p_tx_hash,
    'confirmed'
  );
end;
$$;

revoke all on function public.confirm_ownership_transfer_intent(uuid, uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_ownership_transfer_intent(uuid, uuid, uuid, text, uuid)
  to service_role;

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
  v_intent_id uuid;
begin
  select id into v_intent_id
  from public.ownership_transfer_intents
  where warehouse_id = p_warehouse_id
    and new_owner_user_id = p_new_owner_id
    and actor_user_id = p_actor_user_id
    and lower(tx_hash) = lower(p_tx_hash)
    and status in ('submitted', 'confirmed')
  order by created_at desc
  limit 1;

  if v_intent_id is null then
    raise exception 'INTENT_NOT_FOUND';
  end if;

  perform public.confirm_ownership_transfer_intent(
    v_intent_id,
    p_warehouse_id,
    p_new_owner_id,
    p_tx_hash,
    p_actor_user_id
  );
end;
$$;

revoke all on function public.confirm_ownership_transfer(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_ownership_transfer(uuid, uuid, text, uuid)
  to service_role;

create or replace function public.cleanup_ownership_transfer_intents()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_total integer := 0;
begin
  update public.ownership_transfer_intents
  set status = 'expired', error = 'expired'
  where status in ('prepared', 'submitted')
    and expires_at <= pg_catalog.now();
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  delete from public.ownership_transfer_intents
  where status in ('confirmed', 'failed', 'expired')
    and expires_at <= pg_catalog.now();
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  return v_total;
end;
$$;

revoke all on function public.cleanup_ownership_transfer_intents()
  from public, anon, authenticated;
grant execute on function public.cleanup_ownership_transfer_intents()
  to service_role;
