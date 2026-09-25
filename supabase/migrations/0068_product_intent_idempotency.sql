create table if not exists public.product_intents (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  idempotency_key text not null,
  request_fingerprint text not null,
  product_id uuid not null unique references public.products(id) on delete restrict,
  movement_id uuid references public.stock_movements(id) on delete restrict,
  initial_stock_applied boolean not null default false,
  created_at timestamptz not null default now(),
  constraint product_intents_key_not_blank check (btrim(idempotency_key) <> ''),
  constraint product_intents_fingerprint_not_blank check (btrim(request_fingerprint) <> ''),
  unique (actor_user_id, idempotency_key)
);

create index if not exists product_intents_warehouse_actor_idx
  on public.product_intents (warehouse_id, actor_user_id, created_at desc);

alter table public.product_intents enable row level security;

drop policy if exists product_intents_select_own on public.product_intents;
create policy product_intents_select_own
  on public.product_intents
  for select
  to authenticated
  using ((select auth.uid()) = actor_user_id);

revoke all on table public.product_intents from public, anon, authenticated;
grant select on table public.product_intents to authenticated;

drop function if exists public.create_product_with_initial_stock(
  uuid, text, text, text, text, text, numeric, numeric,
  uuid, uuid, jsonb, text, uuid, text, text, text
);

create or replace function public.create_product_with_initial_stock(
  p_warehouse_id uuid,
  p_sku text,
  p_name text,
  p_category text,
  p_unit text,
  p_description text,
  p_low_stock_threshold numeric,
  p_initial_quantity numeric,
  p_product_id uuid,
  p_movement_id uuid,
  p_proof_payload jsonb,
  p_proof_payload_hash text,
  p_actor_user_id uuid,
  p_actor_wallet text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_product_idempotency_key text,
  p_product_request_fingerprint text
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_wh_address text;
  v_primary_wallet text;
  v_product_key text;
  v_product_fingerprint text;
  v_product_id uuid;
  v_product public.products;
  v_existing_intent public.product_intents;
  v_existing_movement public.stock_movements;
  v_move record;
  v_product_intent public.product_intents;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;
  if p_product_idempotency_key is null or btrim(p_product_idempotency_key) = '' then
    raise exception 'product idempotency key is required' using errcode = '22023';
  end if;
  if p_product_request_fingerprint is null or btrim(p_product_request_fingerprint) = '' then
    raise exception 'product request fingerprint is required' using errcode = '22023';
  end if;
  v_product_key := btrim(p_product_idempotency_key);
  v_product_fingerprint := lower(btrim(p_product_request_fingerprint));

  if not exists (
    select 1
    from public.warehouses
    where id = p_warehouse_id
      and status = 'active'
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select m.role
    into v_role
  from public.memberships as m
  where m.warehouse_id = p_warehouse_id
    and m.user_id = p_actor_user_id
    and m.status = 'ACTIVE'
  limit 1;
  if v_role is null or v_role not in ('STAFF', 'MANAGER', 'OWNER') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_initial_quantity is not null and p_initial_quantity <= 0 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  select nullif(btrim(w.contract_address), '')
    into v_wh_address
  from public.warehouses as w
  where w.id = p_warehouse_id;

  if p_initial_quantity is not null then
    if p_actor_wallet is null or btrim(p_actor_wallet) = '' then
      raise exception 'actor primary verified wallet is required' using errcode = '28000';
    end if;
    select lower(w.address)
      into v_primary_wallet
    from public.wallets as w
    where w.user_id = p_actor_user_id
      and w.is_primary = true
      and w.verification_state = 'verified'
      and lower(w.address) = lower(btrim(p_actor_wallet))
    limit 1;
    if v_primary_wallet is null then
      raise exception 'actor wallet is not the primary verified wallet' using errcode = '28000';
    end if;
    if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
      raise exception 'idempotency key is required';
    end if;
    if p_request_fingerprint is null or btrim(p_request_fingerprint) = '' then
      raise exception 'request fingerprint is required';
    end if;
    if v_wh_address is not null and p_movement_id is null then
      raise exception 'deployed initial stock requires movement id';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_actor_user_id::text || ':' || v_product_key, 0)
  );

  select pi.*
    into v_existing_intent
  from public.product_intents as pi
  where pi.actor_user_id = p_actor_user_id
    and pi.idempotency_key = v_product_key
  for update;

  if found then
    if v_existing_intent.warehouse_id is distinct from p_warehouse_id
       or lower(v_existing_intent.request_fingerprint) is distinct from v_product_fingerprint then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;

    select pr.*
      into v_product
    from public.products as pr
    where pr.id = v_existing_intent.product_id
      and pr.warehouse_id = p_warehouse_id;
    if v_product.id is null then
      raise exception 'PRODUCT_INTENT_CONFLICT' using errcode = '23505';
    end if;

    if v_existing_intent.initial_stock_applied then
      if v_existing_intent.movement_id is null then
        raise exception 'PRODUCT_INTENT_CONFLICT' using errcode = '23505';
      end if;
      select sm.*
        into v_existing_movement
      from public.stock_movements as sm
      where sm.id = v_existing_intent.movement_id;
      if v_existing_movement.id is null
         or v_existing_movement.warehouse_id is distinct from p_warehouse_id
         or v_existing_movement.product_id is distinct from v_product.id
         or v_existing_movement.movement_type is distinct from 'stock_in'
         or v_existing_movement.quantity is distinct from p_initial_quantity
         or v_existing_movement.idempotency_key is distinct from p_idempotency_key
         or v_existing_movement.request_fingerprint is distinct from p_request_fingerprint
         or v_existing_movement.actor_user_id is distinct from p_actor_user_id then
        raise exception 'PRODUCT_INTENT_CONFLICT' using errcode = '23505';
      end if;
    end if;

    return v_product;
  end if;

  v_product_id := coalesce(p_product_id, gen_random_uuid());
  insert into public.products (
    id, warehouse_id, sku, name, category, unit,
    description, low_stock_threshold, status
  )
  values (
    v_product_id, p_warehouse_id, p_sku, p_name, p_category, p_unit,
    p_description, p_low_stock_threshold, 'active'
  )
  returning * into v_product;

  perform private.write_audit(
    p_warehouse_id,
    p_actor_user_id,
    'product_created',
    'products',
    v_product.id::text,
    null,
    jsonb_build_object('sku', p_sku, 'name', p_name),
    null,
    'active'
  );

  if p_initial_quantity is not null then
    select m.*
      into v_move
    from public.apply_stock_movement(
      p_warehouse_id,
      v_product.id,
      'stock_in',
      p_initial_quantity,
      0,
      'Initial stock',
      null,
      null,
      p_idempotency_key,
      v_primary_wallet,
      p_movement_id,
      p_proof_payload,
      p_proof_payload_hash,
      p_request_fingerprint,
      p_actor_user_id
    ) as m;

    if v_move.error_code is not null and v_move.error_code <> 'IDEMPOTENT' then
      raise exception 'INITIAL_STOCK_FAILED %', v_move.error_code using errcode = 'check_violation';
    end if;
    if v_move.movement_id is null then
      raise exception 'INITIAL_STOCK_FAILED MOVEMENT_NOT_CREATED' using errcode = 'check_violation';
    end if;

    select sm.*
      into v_existing_movement
    from public.stock_movements as sm
    where sm.id = v_move.movement_id;
    if v_existing_movement.id is null
       or v_existing_movement.warehouse_id is distinct from p_warehouse_id
       or v_existing_movement.product_id is distinct from v_product.id
       or v_existing_movement.movement_type is distinct from 'stock_in'
       or v_existing_movement.quantity is distinct from p_initial_quantity
       or v_existing_movement.idempotency_key is distinct from p_idempotency_key
       or v_existing_movement.request_fingerprint is distinct from p_request_fingerprint
       or v_existing_movement.actor_user_id is distinct from p_actor_user_id then
      raise exception 'PRODUCT_INTENT_CONFLICT' using errcode = '23505';
    end if;
  end if;

  insert into public.product_intents (
    warehouse_id, actor_user_id, idempotency_key, request_fingerprint,
    product_id, movement_id, initial_stock_applied
  )
  values (
    p_warehouse_id,
    p_actor_user_id,
    v_product_key,
    v_product_fingerprint,
    v_product.id,
    case when p_initial_quantity is not null then v_move.movement_id else null end,
    p_initial_quantity is not null
  )
  returning * into v_product_intent;

  if v_product_intent.id is null then
    raise exception 'product intent could not be created';
  end if;

  return v_product;
end;
$function$;

revoke execute on function public.create_product_with_initial_stock(
  uuid, text, text, text, text, text, numeric, numeric,
  uuid, uuid, jsonb, text, uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_product_with_initial_stock(
  uuid, text, text, text, text, text, numeric, numeric,
  uuid, uuid, jsonb, text, uuid, text, text, text, text, text
) to service_role;
