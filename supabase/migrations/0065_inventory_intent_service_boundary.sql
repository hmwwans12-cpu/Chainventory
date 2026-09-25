revoke execute on function public.create_product_with_initial_stock(uuid, text, text, text, text, text, numeric, numeric, uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function public.commit_user_paid_stock_intent(uuid) from public, anon, authenticated;
revoke execute on function public.create_user_paid_stock_intent(uuid, uuid, uuid, text, numeric, bigint, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.submit_user_paid_stock_intent(uuid, text) from public, anon, authenticated;
revoke execute on function public.approve_stock_adjustment(uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function public.reject_stock_adjustment(uuid, text) from public, anon, authenticated;
revoke execute on function public.apply_stock_movement(uuid, uuid, text, numeric, bigint, text, text, uuid, text, text, uuid, jsonb, text, text) from public, anon, authenticated;

drop function if exists public.create_product_with_initial_stock(uuid, text, text, text, text, text, numeric, numeric, uuid, uuid, jsonb, text);
drop function if exists public.create_product_with_initial_stock(uuid, text, text, text, text, text, numeric, numeric);
drop function if exists public.commit_user_paid_stock_intent(uuid);
drop function if exists public.create_user_paid_stock_intent(uuid, uuid, uuid, text, numeric, bigint, text, text, text, text, jsonb, text, text);
drop function if exists public.create_user_paid_stock_intent(uuid, uuid, uuid, text, numeric, bigint, text, text, text, text, jsonb, text);
drop function if exists public.submit_user_paid_stock_intent(uuid, text);
drop function if exists public.approve_stock_adjustment(uuid, jsonb, text);
drop function if exists public.approve_stock_adjustment(uuid);
drop function if exists public.reject_stock_adjustment(uuid, text);
drop function if exists public.reject_stock_adjustment(uuid);
drop function if exists public.apply_stock_movement(uuid, uuid, text, numeric, bigint, text, text, uuid, text, text, uuid, jsonb, text, text);
drop function if exists public.apply_stock_movement(uuid, uuid, text, numeric, bigint, text, text, uuid, text, text, uuid, jsonb, text);
drop function if exists public.apply_stock_movement(uuid, uuid, text, numeric, bigint, text, text, uuid, text, text);
drop function if exists public.apply_stock_movement(uuid, uuid, text, numeric, integer, text, text, uuid, text, text, uuid, jsonb, text, text);

create or replace function private.guard_stock_movements_append_only()
returns trigger
language plpgsql
as $function$
declare
  v_action text := tg_op;
begin
  if v_action = 'DELETE' then
    perform private.write_audit(
      old.warehouse_id,
      null,
      'append_only_violation',
      'stock_movements',
      coalesce(old.id::text, '?'),
      jsonb_build_object('op', 'DELETE', 'movement_type', old.movement_type),
      null,
      null,
      'rejected'
    );
    raise exception 'stock_movements is append-only (DELETE forbidden)';
  end if;

  if v_action = 'UPDATE' then
    if old.status = 'pending_approval'
       and new.status in ('committed', 'rejected')
       and old.id = new.id
       and old.warehouse_id is not distinct from new.warehouse_id
       and old.product_id is not distinct from new.product_id
       and old.movement_type is not distinct from new.movement_type
       and old.quantity is not distinct from new.quantity
       and old.actor_user_id is not distinct from new.actor_user_id
       and (
         (new.status = 'committed' and old.reason is not distinct from new.reason)
         or new.status = 'rejected'
       ) then
      return new;
    end if;
    perform private.write_audit(
      coalesce(new.warehouse_id, old.warehouse_id),
      null,
      'append_only_violation',
      'stock_movements',
      coalesce(new.id::text, old.id::text, '?'),
      jsonb_build_object('op', 'UPDATE', 'old_status', old.status, 'new_status', new.status),
      null,
      null,
      'rejected'
    );
    raise exception 'stock_movements is append-only (UPDATE forbidden except pending_approval transition)';
  end if;

  return new;
end;
$function$;

create or replace function private.apply_stock_movement_core(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_expected_balance_version bigint,
  p_reason text,
  p_reference text,
  p_reversal_of uuid,
  p_idempotency_key text,
  p_actor_wallet text,
  p_movement_id uuid,
  p_proof_payload jsonb,
  p_proof_payload_hash text,
  p_request_fingerprint text,
  p_actor_user_id uuid,
  p_require_proof boolean
)
returns table (
  movement_id uuid,
  balance_version bigint,
  proof_pending boolean,
  error_code text,
  message text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_wallet text;
  v_actor_role text;
  v_movement_type text;
  v_key text;
  v_fingerprint text;
  v_proof_hash text;
  v_wh_status text;
  v_wh_address text;
  v_deployed boolean;
  v_product public.products;
  v_balance public.inventory_balances;
  v_existing public.stock_movements;
  v_original public.stock_movements;
  v_original_type text;
  v_original_qty numeric;
  v_reversed_total numeric;
  v_movement_id uuid;
  v_inserted_id uuid;
  v_new_qty numeric;
  v_new_version bigint;
  v_proof_id uuid;
  v_proof_pending boolean;
begin
  if p_actor_user_id is null then
    return query select null::uuid, null::bigint, false, 'UNAUTHENTICATED', 'actor required';
    return;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'quantity must be greater than zero';
    return;
  end if;

  v_movement_type := lower(btrim(coalesce(p_movement_type, '')));
  if v_movement_type not in ('stock_in', 'stock_out', 'adjustment', 'reversal') then
    return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'invalid movement type';
    return;
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'idempotency key is required';
    return;
  end if;
  v_key := btrim(p_idempotency_key);

  if p_request_fingerprint is null or btrim(p_request_fingerprint) = '' then
    return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'request fingerprint is required';
    return;
  end if;
  v_fingerprint := btrim(p_request_fingerprint);

  if p_actor_wallet is null or btrim(p_actor_wallet) = '' then
    return query select null::uuid, null::bigint, false, 'WALLET_NOT_VERIFIED', 'actor primary verified wallet is required';
    return;
  end if;

  select lower(w.address)
    into v_actor_wallet
  from public.wallets as w
  where w.user_id = p_actor_user_id
    and w.is_primary = true
    and w.verification_state = 'verified'
    and lower(w.address) = lower(btrim(p_actor_wallet))
  limit 1;

  if v_actor_wallet is null then
    return query select null::uuid, null::bigint, false, 'WALLET_NOT_VERIFIED', 'actor wallet is not the primary verified wallet';
    return;
  end if;

  select w.status, nullif(btrim(w.contract_address), '')
    into v_wh_status, v_wh_address
  from public.warehouses as w
  where w.id = p_warehouse_id;

  if v_wh_status is distinct from 'active' then
    return query select null::uuid, null::bigint, false, 'FORBIDDEN', 'warehouse is not active';
    return;
  end if;
  v_deployed := v_wh_address is not null;

  select m.role
    into v_actor_role
  from public.memberships as m
  where m.warehouse_id = p_warehouse_id
    and m.user_id = p_actor_user_id
    and m.status = 'ACTIVE'
  limit 1;

  if v_actor_role is null then
    return query select null::uuid, null::bigint, false, 'FORBIDDEN', 'actor is not an active member';
    return;
  end if;

  if v_movement_type in ('stock_in', 'stock_out') then
    if v_actor_role not in ('STAFF', 'MANAGER', 'OWNER') then
      return query select null::uuid, null::bigint, false, 'FORBIDDEN', 'insufficient permission';
      return;
    end if;
  elsif v_actor_role not in ('MANAGER', 'OWNER') then
    return query select null::uuid, null::bigint, false, 'FORBIDDEN', 'insufficient permission';
    return;
  end if;

  if (p_proof_payload is null) <> (p_proof_payload_hash is null) then
    return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'proof payload and hash must be provided together';
    return;
  end if;

  if p_proof_payload_hash is not null then
    v_proof_hash := lower(btrim(p_proof_payload_hash));
    if v_proof_hash = '' then
      return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'proof payload hash is required';
      return;
    end if;
  end if;

  if p_require_proof
     and v_deployed
     and v_movement_type in ('stock_in', 'stock_out', 'reversal')
     and (p_proof_payload is null or p_proof_payload_hash is null) then
    return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'deployed stock movement requires proof';
    return;
  end if;

  if p_proof_payload is not null then
    if p_movement_id is null then
      return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'proof requires movement id';
      return;
    end if;
    if not v_deployed then
      return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'proof requires a deployed warehouse';
      return;
    end if;
    if p_proof_payload ->> 'movementId' is distinct from p_movement_id::text
       or lower(coalesce(p_proof_payload ->> 'warehouseAddress', '')) is distinct from lower(v_wh_address)
       or p_proof_payload ->> 'actorUserId' is distinct from p_actor_user_id::text
       or lower(coalesce(p_proof_payload ->> 'actorWallet', '')) is distinct from v_actor_wallet then
      return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'proof does not match the movement actor';
      return;
    end if;
  end if;

  select sm.*
    into v_existing
  from public.stock_movements as sm
  where sm.warehouse_id = p_warehouse_id
    and sm.idempotency_key = v_key
  limit 1;

  if found then
    if v_existing.request_fingerprint is distinct from v_fingerprint
       or v_existing.actor_user_id is distinct from p_actor_user_id then
      return query select null::uuid, null::bigint, false, 'IDEMPOTENCY_CONFLICT', 'idempotency key was already used for a different request';
      return;
    end if;
    return query
      select v_existing.id,
             coalesce((select ib.version from public.inventory_balances as ib where ib.warehouse_id = p_warehouse_id and ib.product_id = v_existing.product_id), 0),
             exists(select 1 from public.proofs as pr where pr.movement_id = v_existing.id),
             'IDEMPOTENT',
             'already processed';
    return;
  end if;

  select pr.*
    into v_product
  from public.products as pr
  where pr.id = p_product_id
    and pr.warehouse_id = p_warehouse_id
  for update;

  if v_product.id is null then
    return query select null::uuid, null::bigint, false, 'NOT_FOUND', 'product not found';
    return;
  end if;

  if v_product.status <> 'active' then
    return query select null::uuid, null::bigint, false, 'NOT_FOUND', 'product is archived';
    return;
  end if;

  if v_movement_type = 'reversal' then
    if p_reversal_of is null then
      return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'reversal_of is required';
      return;
    end if;

    select sm.*
      into v_original
    from public.stock_movements as sm
    where sm.id = p_reversal_of
      and sm.warehouse_id = p_warehouse_id
      and sm.product_id = p_product_id
      and sm.status = 'committed'
    for update;

    if v_original.id is null or v_original.movement_type not in ('stock_in', 'stock_out') then
      return query select null::uuid, null::bigint, false, 'INVALID_REVERSAL', 'reversal target must be a committed stock_in or stock_out movement';
      return;
    end if;

    v_original_type := v_original.movement_type;
    v_original_qty := v_original.quantity;
    select coalesce(sum(sm.quantity), 0)
      into v_reversed_total
    from public.stock_movements as sm
    where sm.reversal_of = p_reversal_of
      and sm.warehouse_id = p_warehouse_id
      and sm.status = 'committed';

    if v_reversed_total + p_quantity > v_original_qty then
      return query
        select null::uuid, null::bigint, false, 'INVALID_REVERSAL',
               format('reversal exceeds original quantity: already reversed %s of %s, tried %s', v_reversed_total, v_original_qty, p_quantity);
      return;
    end if;
  end if;

  v_new_version := 0;
  v_new_qty := 0;

  if v_movement_type in ('stock_in', 'stock_out', 'reversal') then
    select ib.*
      into v_balance
    from public.inventory_balances as ib
    where ib.warehouse_id = p_warehouse_id
      and ib.product_id = p_product_id
    for update;

    if v_balance.id is null then
      insert into public.inventory_balances (warehouse_id, product_id, quantity, version, updated_by)
      values (p_warehouse_id, p_product_id, 0, 0, p_actor_user_id)
      on conflict (warehouse_id, product_id) do nothing;
      select ib.*
        into v_balance
      from public.inventory_balances as ib
      where ib.warehouse_id = p_warehouse_id
        and ib.product_id = p_product_id
      for update;
    end if;

    if p_expected_balance_version is not null
       and v_balance.version <> p_expected_balance_version then
      return query
        select null::uuid, v_balance.version, false, 'STALE_STOCK',
               format('expected version %s but current is %s', p_expected_balance_version, v_balance.version);
      return;
    end if;

    v_new_qty := v_balance.quantity;
    if v_movement_type = 'stock_in' then
      v_new_qty := v_new_qty + p_quantity;
    elsif v_movement_type = 'stock_out' then
      if v_balance.quantity < p_quantity then
        return query
          select null::uuid, v_balance.version, false, 'INSUFFICIENT_STOCK',
                 format('insufficient stock: have %s, need %s', v_balance.quantity, p_quantity);
        return;
      end if;
      v_new_qty := v_new_qty - p_quantity;
    else
      if v_original_type = 'stock_out' then
        v_new_qty := v_new_qty + p_quantity;
      else
        if v_balance.quantity < p_quantity then
          return query
            select null::uuid, v_balance.version, false, 'INSUFFICIENT_STOCK',
                   format('insufficient stock to reverse: have %s, need %s', v_balance.quantity, p_quantity);
          return;
        end if;
        v_new_qty := v_new_qty - p_quantity;
      end if;
    end if;

    v_new_version := v_balance.version + 1;
  end if;

  v_movement_id := coalesce(p_movement_id, gen_random_uuid());
  insert into public.stock_movements (
    id, warehouse_id, product_id, movement_type, quantity,
    actor_user_id, actor_wallet, role_at_time, reason, reference,
    reversal_of, status, expected_balance_version, idempotency_key,
    request_fingerprint
  )
  values (
    v_movement_id, p_warehouse_id, p_product_id, v_movement_type, p_quantity,
    p_actor_user_id, v_actor_wallet, v_actor_role, p_reason, p_reference,
    p_reversal_of,
    case when v_movement_type = 'adjustment' then 'pending_approval' else 'committed' end,
    case when v_movement_type in ('stock_in', 'stock_out', 'reversal') then v_balance.version else null end,
    v_key,
    v_fingerprint
  )
  on conflict (warehouse_id, idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    select sm.*
      into v_existing
    from public.stock_movements as sm
    where sm.warehouse_id = p_warehouse_id
      and sm.idempotency_key = v_key
    limit 1;

    if v_existing.id is null then
      return query select null::uuid, null::bigint, false, 'IDEMPOTENCY_CONFLICT', 'movement could not be created';
      return;
    end if;
    if v_existing.request_fingerprint is distinct from v_fingerprint
       or v_existing.actor_user_id is distinct from p_actor_user_id then
      return query select null::uuid, null::bigint, false, 'IDEMPOTENCY_CONFLICT', 'idempotency key was already used for a different request';
      return;
    end if;
    return query
      select v_existing.id,
             coalesce((select ib.version from public.inventory_balances as ib where ib.warehouse_id = p_warehouse_id and ib.product_id = v_existing.product_id), 0),
             exists(select 1 from public.proofs as pr where pr.movement_id = v_existing.id),
             'IDEMPOTENT',
             'already processed';
    return;
  end if;

  update public.warehouses
    set last_activity_at = now()
  where id = p_warehouse_id;

  if v_movement_type in ('stock_in', 'stock_out', 'reversal') then
    update public.inventory_balances
      set quantity = v_new_qty,
          version = v_new_version,
          updated_at = now(),
          updated_by = p_actor_user_id
      where id = v_balance.id;
  end if;

  perform private.write_audit(
    p_warehouse_id,
    p_actor_user_id,
    v_movement_type,
    'stock_movements',
    v_movement_id::text,
    null,
    jsonb_build_object('type', v_movement_type, 'qty', p_quantity),
    null,
    case when v_movement_type = 'adjustment' then 'pending_approval' else 'committed' end
  );

  if v_movement_type = 'adjustment' then
    perform private.notify_warehouse_managers(
      p_warehouse_id,
      'adjustment_pending',
      'Penyesuaian butuh persetujuan',
      format('Penyesuaian %s (%s %s) menunggu persetujuan', coalesce(v_product.name, 'produk'), p_quantity, coalesce(v_product.unit, 'unit')),
      jsonb_build_object('warehouse_id', p_warehouse_id, 'movement_id', v_movement_id, 'product_id', p_product_id, 'quantity', p_quantity),
      'adjustment_pending:' || v_movement_id::text
    );
  end if;

  v_proof_pending := false;
  if p_proof_payload is not null
     and p_proof_payload_hash is not null
     and v_movement_type <> 'adjustment' then
    v_proof_id := gen_random_uuid();
    insert into public.proofs (
      id, warehouse_id, warehouse_address, movement_id, payload,
      payload_version, payload_hash, status
    )
    values (
      v_proof_id, p_warehouse_id, lower(v_wh_address), v_movement_id,
      p_proof_payload, 1, v_proof_hash, 'pending'
    );

    insert into public.proof_outbox (id, proof_id, status, attempt_count, next_attempt_at)
    values (gen_random_uuid(), v_proof_id, 'pending', 0, now());

    v_proof_pending := true;
    perform private.write_audit(
      p_warehouse_id,
      p_actor_user_id,
      'proof_created',
      'proofs',
      v_proof_id::text,
      null,
      jsonb_build_object('movement_id', v_movement_id, 'payload_hash', v_proof_hash),
      null,
      'pending'
    );
  end if;

  return query select v_movement_id, v_new_version, v_proof_pending, null::text, null::text;
end;
$function$;

revoke all on function private.apply_stock_movement_core(uuid, uuid, text, numeric, bigint, text, text, uuid, text, text, uuid, jsonb, text, text, uuid, boolean) from public, anon, authenticated, service_role;

create or replace function public.apply_stock_movement(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_expected_balance_version bigint,
  p_reason text,
  p_reference text,
  p_reversal_of uuid,
  p_idempotency_key text,
  p_actor_wallet text,
  p_movement_id uuid,
  p_proof_payload jsonb,
  p_proof_payload_hash text,
  p_request_fingerprint text,
  p_actor_user_id uuid
)
returns table (
  movement_id uuid,
  balance_version bigint,
  proof_pending boolean,
  error_code text,
  message text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_require_proof boolean;
begin
  select coalesce(
    nullif(btrim(w.contract_address), '') is not null
      and lower(coalesce(p_movement_type, '')) in ('stock_in', 'stock_out', 'reversal'),
    false
  )
    into v_require_proof
  from public.warehouses as w
  where w.id = p_warehouse_id;

  return query
    select *
    from private.apply_stock_movement_core(
      p_warehouse_id,
      p_product_id,
      p_movement_type,
      p_quantity,
      p_expected_balance_version,
      p_reason,
      p_reference,
      p_reversal_of,
      p_idempotency_key,
      p_actor_wallet,
      p_movement_id,
      p_proof_payload,
      p_proof_payload_hash,
      p_request_fingerprint,
      p_actor_user_id,
      coalesce(v_require_proof, false)
    );
end;
$function$;

revoke execute on function public.apply_stock_movement(uuid, uuid, text, numeric, bigint, text, text, uuid, text, text, uuid, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_stock_movement(uuid, uuid, text, numeric, bigint, text, text, uuid, text, text, uuid, jsonb, text, text, uuid) to service_role;

create or replace function public.approve_stock_adjustment(
  p_movement_id uuid,
  p_proof_payload jsonb,
  p_proof_payload_hash text,
  p_actor_user_id uuid
)
returns public.stock_movements
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_movement public.stock_movements;
  v_balance public.inventory_balances;
  v_wh public.warehouses;
  v_role text;
  v_new_qty numeric;
  v_wh_address text;
  v_proof_id uuid;
  v_approver_name text;
  v_wh_name text;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  select sm.*
    into v_movement
  from public.stock_movements as sm
  where sm.id = p_movement_id
  for update;

  if v_movement.id is null then
    raise exception 'movement not found';
  end if;
  if v_movement.movement_type <> 'adjustment' or v_movement.status <> 'pending_approval' then
    raise exception 'movement not awaiting approval';
  end if;
  if v_movement.actor_user_id is not null and v_movement.actor_user_id = p_actor_user_id then
    raise exception 'self_approval_forbidden' using errcode = '42501';
  end if;

  select w.*
    into v_wh
  from public.warehouses as w
  where w.id = v_movement.warehouse_id
  for update;

  if v_wh.id is null or v_wh.status is distinct from 'active' then
    raise exception 'warehouse is not active';
  end if;

  select m.role
    into v_role
  from public.memberships as m
  where m.warehouse_id = v_movement.warehouse_id
    and m.user_id = p_actor_user_id
    and m.status = 'ACTIVE'
  limit 1;

  if v_role is null or v_role not in ('MANAGER', 'OWNER') then
    raise exception 'insufficient permission';
  end if;

  v_wh_address := nullif(btrim(v_wh.contract_address), '');
  if v_wh_address is not null then
    if p_proof_payload is null or p_proof_payload_hash is null then
      raise exception 'deployed adjustment requires proof';
    end if;
    if btrim(p_proof_payload_hash) = ''
       or p_proof_payload ->> 'movementId' is distinct from p_movement_id::text
       or lower(coalesce(p_proof_payload ->> 'warehouseAddress', '')) is distinct from lower(v_wh_address)
       or p_proof_payload ->> 'actorUserId' is distinct from v_movement.actor_user_id::text
       or lower(coalesce(p_proof_payload ->> 'actorWallet', '')) is distinct from lower(coalesce(v_movement.actor_wallet, '')) then
      raise exception 'proof does not match the adjustment';
    end if;
  elsif p_proof_payload is not null or p_proof_payload_hash is not null then
    raise exception 'proof requires a deployed warehouse';
  end if;

  select ib.*
    into v_balance
  from public.inventory_balances as ib
  where ib.warehouse_id = v_movement.warehouse_id
    and ib.product_id = v_movement.product_id
  for update;

  if v_balance.id is null then
    insert into public.inventory_balances (warehouse_id, product_id, quantity, version, updated_by)
    values (v_movement.warehouse_id, v_movement.product_id, 0, 0, p_actor_user_id);
    select ib.*
      into v_balance
    from public.inventory_balances as ib
    where ib.warehouse_id = v_movement.warehouse_id
      and ib.product_id = v_movement.product_id
    for update;
  end if;

  v_new_qty := v_balance.quantity + v_movement.quantity;
  if v_new_qty < 0 then
    raise exception 'insufficient stock for adjustment';
  end if;

  update public.stock_movements
    set status = 'committed',
        approved_by = p_actor_user_id,
        approved_at = now()
  where id = p_movement_id
    and movement_type = 'adjustment'
    and status = 'pending_approval'
  returning * into v_movement;

  if v_movement.id is null then
    raise exception 'movement already processed';
  end if;

  update public.inventory_balances
    set quantity = v_new_qty,
        version = v_balance.version + 1,
        updated_at = now(),
        updated_by = p_actor_user_id
  where id = v_balance.id;

  if v_wh_address is not null then
    v_proof_id := gen_random_uuid();
    insert into public.proofs (
      id, warehouse_id, warehouse_address, movement_id, payload,
      payload_version, payload_hash, status
    )
    values (
      v_proof_id, v_movement.warehouse_id, lower(v_wh_address), p_movement_id,
      p_proof_payload, 1, lower(btrim(p_proof_payload_hash)), 'pending'
    );
    insert into public.proof_outbox (id, proof_id, status, attempt_count, next_attempt_at)
    values (gen_random_uuid(), v_proof_id, 'pending', 0, now());
    perform private.write_audit(
      v_movement.warehouse_id, p_actor_user_id, 'proof_created', 'proofs', v_proof_id::text,
      null, jsonb_build_object('movement_id', p_movement_id, 'payload_hash', btrim(p_proof_payload_hash)),
      null, 'pending'
    );
  end if;

  select coalesce(u.display_name, split_part(u.email, '@', 1), 'Pengguna')
    into v_approver_name
  from public.users as u
  where u.id = p_actor_user_id;
  select w.name into v_wh_name
  from public.warehouses as w
  where w.id = v_movement.warehouse_id;
  perform private.write_notification(
    v_movement.actor_user_id,
    v_movement.warehouse_id,
    'adjustment_approved',
    'Penyesuaian disetujui',
    format('Penyesuaianmu di %s disetujui oleh %s', v_wh_name, v_approver_name),
    jsonb_build_object('warehouse_id', v_movement.warehouse_id, 'movement_id', p_movement_id),
    'adjustment_result:' || p_movement_id::text
  );

  return v_movement;
end;
$function$;

revoke execute on function public.approve_stock_adjustment(uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.approve_stock_adjustment(uuid, jsonb, text, uuid) to service_role;

create or replace function public.reject_stock_adjustment(
  p_movement_id uuid,
  p_reason text,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_movement public.stock_movements;
  v_wh public.warehouses;
  v_role text;
  v_rejector_name text;
  v_wh_name text;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  select sm.*
    into v_movement
  from public.stock_movements as sm
  where sm.id = p_movement_id
  for update;

  if v_movement.id is null then
    raise exception 'movement not found';
  end if;
  if v_movement.movement_type <> 'adjustment' or v_movement.status <> 'pending_approval' then
    raise exception 'movement not awaiting approval';
  end if;

  select w.*
    into v_wh
  from public.warehouses as w
  where w.id = v_movement.warehouse_id
  for update;

  if v_wh.id is null or v_wh.status is distinct from 'active' then
    raise exception 'warehouse is not active';
  end if;

  select m.role
    into v_role
  from public.memberships as m
  where m.warehouse_id = v_movement.warehouse_id
    and m.user_id = p_actor_user_id
    and m.status = 'ACTIVE'
  limit 1;

  if v_role is null or v_role not in ('MANAGER', 'OWNER') then
    raise exception 'insufficient permission';
  end if;

  update public.stock_movements
    set status = 'rejected',
        approved_by = p_actor_user_id,
        approved_at = now(),
        reason = coalesce(nullif(btrim(p_reason), ''), reason)
  where id = p_movement_id
    and movement_type = 'adjustment'
    and status = 'pending_approval';

  if not found then
    raise exception 'movement already processed';
  end if;

  select coalesce(u.display_name, split_part(u.email, '@', 1), 'Pengguna')
    into v_rejector_name
  from public.users as u
  where u.id = p_actor_user_id;
  select w.name into v_wh_name
  from public.warehouses as w
  where w.id = v_movement.warehouse_id;
  perform private.write_notification(
    v_movement.actor_user_id,
    v_movement.warehouse_id,
    'adjustment_rejected',
    'Penyesuaian ditolak',
    format('Penyesuaianmu di %s ditolak oleh %s', v_wh_name, v_rejector_name),
    jsonb_build_object('warehouse_id', v_movement.warehouse_id, 'movement_id', p_movement_id, 'reason', p_reason),
    'adjustment_result:' || p_movement_id::text
  );
end;
$function$;

revoke execute on function public.reject_stock_adjustment(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.reject_stock_adjustment(uuid, text, uuid) to service_role;

create or replace function public.create_user_paid_stock_intent(
  p_id uuid,
  p_warehouse_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_expected_balance_version bigint,
  p_reason text,
  p_reference text,
  p_actor_wallet text,
  p_idempotency_key text,
  p_payload jsonb,
  p_payload_hash text,
  p_request_fingerprint text,
  p_actor_user_id uuid
)
returns public.stock_intents
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_wh_status text;
  v_primary_wallet text;
  v_key text;
  v_fingerprint text;
  v_payload_hash text;
  v_intent public.stock_intents;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;
  if p_id is null then
    raise exception 'intent id is required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_QUANTITY' using errcode = '22023';
  end if;
  if p_movement_type not in ('stock_in', 'stock_out') then
    raise exception 'INVALID_MOVEMENT_TYPE' using errcode = '22023';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency key is required';
  end if;
  v_key := btrim(p_idempotency_key);
  if p_request_fingerprint is null or btrim(p_request_fingerprint) = '' then
    raise exception 'request fingerprint is required';
  end if;
  v_fingerprint := btrim(p_request_fingerprint);
  if p_payload is null then
    raise exception 'payload is required';
  end if;
  if p_payload_hash is null or btrim(p_payload_hash) = '' then
    raise exception 'payload hash is required';
  end if;
  v_payload_hash := lower(btrim(p_payload_hash));

  select w.status
    into v_wh_status
  from public.warehouses as w
  where w.id = p_warehouse_id;

  if v_wh_status is distinct from 'active' then
    raise exception 'FORBIDDEN';
  end if;

  select m.role
    into v_role
  from public.memberships as m
  where m.warehouse_id = p_warehouse_id
    and m.user_id = p_actor_user_id
    and m.status = 'ACTIVE'
  limit 1;

  if v_role is null or v_role not in ('OWNER', 'MANAGER', 'STAFF') then
    raise exception 'FORBIDDEN';
  end if;

  if p_actor_wallet is null or btrim(p_actor_wallet) = '' then
    raise exception 'WALLET_NOT_VERIFIED' using errcode = '28000';
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
    raise exception 'WALLET_NOT_VERIFIED' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.products as pr
    where pr.id = p_product_id
      and pr.warehouse_id = p_warehouse_id
      and pr.status = 'active'
  ) then
    raise exception 'NOT_FOUND';
  end if;

  select si.*
    into v_intent
  from public.stock_intents as si
  where si.actor_user_id = p_actor_user_id
    and si.idempotency_key = v_key
  limit 1;

  if found then
    if v_intent.request_fingerprint is distinct from v_fingerprint
       or lower(v_intent.payload_hash) is distinct from v_payload_hash
       or v_intent.payload is distinct from p_payload then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return v_intent;
  end if;

  insert into public.stock_intents (
    id, warehouse_id, product_id, actor_user_id, actor_wallet,
    movement_type, quantity, expected_balance_version, reason, reference,
    idempotency_key, payload, payload_hash, request_fingerprint
  )
  values (
    p_id, p_warehouse_id, p_product_id, p_actor_user_id, v_primary_wallet,
    p_movement_type, p_quantity, p_expected_balance_version, p_reason,
    p_reference, v_key, p_payload, v_payload_hash, v_fingerprint
  )
  on conflict (actor_user_id, idempotency_key) do nothing
  returning * into v_intent;

  if not found then
    select si.*
      into v_intent
    from public.stock_intents as si
    where si.actor_user_id = p_actor_user_id
      and si.idempotency_key = v_key
    limit 1;
  end if;

  if v_intent.id is null then
    raise exception 'intent could not be created';
  end if;
  if v_intent.request_fingerprint is distinct from v_fingerprint
     or lower(v_intent.payload_hash) is distinct from v_payload_hash
     or v_intent.payload is distinct from p_payload then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
  end if;
  return v_intent;
end;
$function$;

revoke execute on function public.create_user_paid_stock_intent(uuid, uuid, uuid, text, numeric, bigint, text, text, text, text, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_user_paid_stock_intent(uuid, uuid, uuid, text, numeric, bigint, text, text, text, text, jsonb, text, text, uuid) to service_role;

create or replace function public.submit_user_paid_stock_intent(
  p_id uuid,
  p_tx_hash text,
  p_actor_user_id uuid
)
returns public.stock_intents
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_intent public.stock_intents;
  v_wh_status text;
  v_role text;
  v_tx_hash text;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;
  if p_tx_hash is null or btrim(p_tx_hash) !~* '^0x[0-9a-f]{64}$' then
    raise exception 'invalid transaction hash';
  end if;
  v_tx_hash := lower(btrim(p_tx_hash));

  select si.*
    into v_intent
  from public.stock_intents as si
  where si.id = p_id
    and si.actor_user_id = p_actor_user_id
  for update;

  if v_intent.id is null then
    raise exception 'NOT_FOUND';
  end if;

  select w.status
    into v_wh_status
  from public.warehouses as w
  where w.id = v_intent.warehouse_id;
  if v_wh_status is distinct from 'active' then
    raise exception 'warehouse is not active';
  end if;

  select m.role
    into v_role
  from public.memberships as m
  where m.warehouse_id = v_intent.warehouse_id
    and m.user_id = p_actor_user_id
    and m.status = 'ACTIVE'
  limit 1;
  if v_role is null then
    raise exception 'FORBIDDEN';
  end if;
  if v_intent.movement_type in ('stock_in', 'stock_out')
     and v_role not in ('STAFF', 'MANAGER', 'OWNER') then
    raise exception 'FORBIDDEN';
  end if;

  if v_intent.status in ('submitted', 'committed') then
    if lower(coalesce(v_intent.tx_hash, '')) <> v_tx_hash then
      raise exception 'IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return v_intent;
  end if;

  if v_intent.status <> 'pending' or v_intent.expires_at <= now() then
    raise exception 'INTENT_NOT_ACTIVE';
  end if;

  update public.stock_intents
    set status = 'submitted',
        tx_hash = v_tx_hash,
        updated_at = now()
  where id = p_id
    and actor_user_id = p_actor_user_id
    and status = 'pending'
  returning * into v_intent;

  if v_intent.id is null then
    raise exception 'INTENT_NOT_ACTIVE';
  end if;
  return v_intent;
end;
$function$;

revoke execute on function public.submit_user_paid_stock_intent(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_user_paid_stock_intent(uuid, text, uuid) to service_role;

create or replace function public.commit_user_paid_stock_intent(
  p_id uuid,
  p_actor_user_id uuid,
  p_verified_tx_hash text,
  p_verified_payload_hash text
)
returns table (
  movement_id uuid,
  balance_version bigint,
  error_code text,
  message text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_intent public.stock_intents;
  v_wh public.warehouses;
  v_role text;
  v_primary_wallet text;
  v_result record;
  v_movement public.stock_movements;
  v_proof public.proofs;
  v_tx_hash text;
  v_payload_hash text;
begin
  if p_actor_user_id is null then
    return query select null::uuid, null::bigint, 'UNAUTHENTICATED', 'actor required';
    return;
  end if;
  if p_verified_tx_hash is null or btrim(p_verified_tx_hash) !~* '^0x[0-9a-f]{64}$' then
    return query select null::uuid, null::bigint, 'INVALID_TX_HASH', 'invalid verified transaction hash';
    return;
  end if;
  if p_verified_payload_hash is null or btrim(p_verified_payload_hash) = '' then
    return query select null::uuid, null::bigint, 'INVALID_PAYLOAD_HASH', 'verified payload hash is required';
    return;
  end if;
  v_tx_hash := lower(btrim(p_verified_tx_hash));
  v_payload_hash := btrim(p_verified_payload_hash);

  select si.*
    into v_intent
  from public.stock_intents as si
  where si.id = p_id
    and si.actor_user_id = p_actor_user_id
  for update;

  if v_intent.id is null then
    return query select null::uuid, null::bigint, 'NOT_FOUND', 'intent not found';
    return;
  end if;

  select w.*
    into v_wh
  from public.warehouses as w
  where w.id = v_intent.warehouse_id;
  if v_wh.id is null or v_wh.status is distinct from 'active' then
    return query select null::uuid, null::bigint, 'FORBIDDEN', 'warehouse is not active';
    return;
  end if;
  if nullif(btrim(v_wh.contract_address), '') is null then
    return query select null::uuid, null::bigint, 'NOT_DEPLOYED', 'warehouse is not deployed';
    return;
  end if;

  select m.role
    into v_role
  from public.memberships as m
  where m.warehouse_id = v_intent.warehouse_id
    and m.user_id = p_actor_user_id
    and m.status = 'ACTIVE'
  limit 1;
  if v_role is null then
    return query select null::uuid, null::bigint, 'FORBIDDEN', 'actor is not an active member';
    return;
  end if;

  select lower(w.address)
    into v_primary_wallet
  from public.wallets as w
  where w.user_id = p_actor_user_id
    and w.is_primary = true
    and w.verification_state = 'verified'
    and lower(w.address) = lower(v_intent.actor_wallet)
  limit 1;
  if v_primary_wallet is null then
    return query select null::uuid, null::bigint, 'WALLET_NOT_VERIFIED', 'intent wallet is not the primary verified wallet';
    return;
  end if;

  if v_intent.tx_hash is null
     or lower(v_intent.tx_hash) is distinct from v_tx_hash
     or lower(v_intent.payload_hash) is distinct from lower(v_payload_hash) then
    return query select null::uuid, null::bigint, 'EVIDENCE_MISMATCH', 'verified evidence does not match the locked intent';
    return;
  end if;

  if v_intent.status = 'committed' then
    select sm.*
      into v_movement
    from public.stock_movements as sm
    where sm.id = v_intent.id;
    select pr.*
      into v_proof
    from public.proofs as pr
    where pr.warehouse_id = v_intent.warehouse_id
      and pr.payload_hash = v_intent.payload_hash;
    if v_movement.id is null
       or v_movement.warehouse_id is distinct from v_intent.warehouse_id
       or v_movement.product_id is distinct from v_intent.product_id
       or v_movement.movement_type is distinct from v_intent.movement_type
       or v_movement.actor_user_id is distinct from p_actor_user_id
       or lower(coalesce(v_movement.actor_wallet, '')) is distinct from lower(v_intent.actor_wallet)
       or v_movement.idempotency_key is distinct from v_intent.idempotency_key
       or v_movement.request_fingerprint is distinct from v_intent.request_fingerprint
       or v_proof.id is null
       or v_proof.movement_id is distinct from v_intent.id
       or v_proof.payload is distinct from v_intent.payload
       or v_proof.payload_hash is distinct from v_intent.payload_hash
       or v_proof.tx_hash is distinct from v_intent.tx_hash
       or v_proof.status is distinct from 'confirmed' then
      return query select null::uuid, null::bigint, 'EVIDENCE_MISMATCH', 'committed intent evidence is not exact';
      return;
    end if;
    return query
      select v_movement.id,
             coalesce((select ib.version from public.inventory_balances as ib where ib.warehouse_id = v_intent.warehouse_id and ib.product_id = v_intent.product_id), 0),
             null::text,
             'already committed';
    return;
  end if;

  if v_intent.status <> 'submitted' or v_intent.expires_at <= now() then
    return query select null::uuid, null::bigint, 'INTENT_NOT_ACTIVE', 'intent is not active';
    return;
  end if;

  select r.*
    into v_result
  from private.apply_stock_movement_core(
    v_intent.warehouse_id,
    v_intent.product_id,
    v_intent.movement_type,
    v_intent.quantity,
    v_intent.expected_balance_version,
    v_intent.reason,
    v_intent.reference,
    null,
    v_intent.idempotency_key,
    v_intent.actor_wallet,
    v_intent.id,
    null,
    null,
    v_intent.request_fingerprint,
    p_actor_user_id,
    false
  ) as r;

  if v_result.error_code is not null and v_result.error_code <> 'IDEMPOTENT' then
    update public.stock_intents
      set status = 'failed',
          error = v_result.message,
          updated_at = now()
    where id = p_id;
    return query select null::uuid, v_result.balance_version, v_result.error_code, v_result.message;
    return;
  end if;

  select sm.*
    into v_movement
  from public.stock_movements as sm
  where sm.id = v_intent.id;
  if v_movement.id is null
     or v_movement.warehouse_id is distinct from v_intent.warehouse_id
     or v_movement.product_id is distinct from v_intent.product_id
     or v_movement.movement_type is distinct from v_intent.movement_type
     or v_movement.actor_user_id is distinct from p_actor_user_id
     or lower(coalesce(v_movement.actor_wallet, '')) is distinct from lower(v_intent.actor_wallet)
     or v_movement.idempotency_key is distinct from v_intent.idempotency_key
     or v_movement.request_fingerprint is distinct from v_intent.request_fingerprint then
    raise exception 'EVIDENCE_MISMATCH: movement does not match the locked intent';
  end if;

  insert into public.proofs (
    id, warehouse_id, warehouse_address, movement_id, payload,
    payload_version, payload_hash, status, tx_hash, confirmation_count
  )
  values (
    gen_random_uuid(), v_intent.warehouse_id, lower(v_wh.contract_address), v_intent.id,
    v_intent.payload, 2, v_intent.payload_hash, 'confirmed', v_intent.tx_hash, 2
  )
  on conflict (warehouse_id, payload_hash) do nothing;

  select pr.*
    into v_proof
  from public.proofs as pr
  where pr.warehouse_id = v_intent.warehouse_id
    and pr.payload_hash = v_intent.payload_hash
  for update;

  if v_proof.id is null
     or v_proof.movement_id is distinct from v_intent.id
     or v_proof.payload is distinct from v_intent.payload
     or v_proof.payload_hash is distinct from v_intent.payload_hash
     or lower(coalesce(v_proof.warehouse_address, '')) is distinct from lower(v_wh.contract_address)
     or v_proof.tx_hash is distinct from v_intent.tx_hash
     or v_proof.status is distinct from 'confirmed' then
    raise exception 'EVIDENCE_MISMATCH: confirmed proof does not match the locked intent';
  end if;

  update public.stock_intents
    set status = 'committed',
        error = null,
        updated_at = now()
  where id = p_id
    and status = 'submitted'
  returning * into v_intent;

  if v_intent.id is null then
    raise exception 'INTENT_NOT_ACTIVE: intent is no longer submitted';
  end if;

  perform private.write_audit(
    v_intent.warehouse_id,
    p_actor_user_id,
    'stock_movement_committed',
    'stock_movements',
    v_intent.id::text,
    null,
    jsonb_build_object('tx_hash', v_intent.tx_hash, 'payload_hash', v_intent.payload_hash),
    v_intent.tx_hash,
    'confirmed'
  );

  return query
    select v_intent.id,
           v_result.balance_version,
           null::text,
           'ok';
end;
$function$;

revoke execute on function public.commit_user_paid_stock_intent(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.commit_user_paid_stock_intent(uuid, uuid, text, text) to service_role;

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
  p_request_fingerprint text
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
  v_product public.products;
  v_move record;
  v_product_id uuid := coalesce(p_product_id, gen_random_uuid());
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  if not exists (
    select 1
    from public.warehouses as w
    where w.id = p_warehouse_id
      and w.status = 'active'
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
  end if;

  return v_product;
end;
$function$;

revoke execute on function public.create_product_with_initial_stock(uuid, text, text, text, text, text, numeric, numeric, uuid, uuid, jsonb, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_product_with_initial_stock(uuid, text, text, text, text, text, numeric, numeric, uuid, uuid, jsonb, text, uuid, text, text, text) to service_role;
