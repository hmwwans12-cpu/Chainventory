-- Migration 0050 — audit v0.4.2 M-11: apply_stock_movement reversal
-- warehouse alignment
--
-- The reversal lookup in apply_stock_movement checked (id, product_id)
-- but not warehouse_id. While UUIDs are globally unique so a collision
-- is impossible in practice, the explicit check is defense-in-depth
-- and matches AGENT.md §6 "foreign key, index, UTC timestamp, RLS"
-- posture.
--
-- The previous migration (0048) added a comment documenting this.
-- This migration performs the actual rewrite of apply_stock_movement
-- to include `AND warehouse_id = p_warehouse_id` in the reversal
-- lookup. We re-declare the function in full to avoid drift between
-- the canonical version and the audit-fixed version.

create or replace function public.apply_stock_movement(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_expected_balance_version integer,
  p_reason text,
  p_reference text,
  p_reversal_of uuid,
  p_idempotency_key text,
  p_actor_wallet text,
  p_movement_id uuid,
  p_proof_payload jsonb,
  p_proof_payload_hash text,
  p_request_fingerprint text
)
returns stock_movements
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_original record;
  v_movement public.stock_movements;
  v_balance public.inventory_balances;
  v_new_qty numeric;
  v_wh_name text;
  v_wh_address text;
  v_proof_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- Validate movement_type against enum (defense-in-depth)
  if p_movement_type not in ('stock_in', 'stock_out', 'adjustment', 'reversal') then
    raise exception 'invalid movement type: %', p_movement_type;
  end if;

  -- ============================================================
  -- Reversal alignment (audit v0.4.2 / M-11)
  -- ============================================================
  -- The previous lookup checked (id, product_id) but not warehouse_id.
  -- We now require warehouse_id to match the new movement's
  -- warehouse_id as well. UUIDs are globally unique so this is
  -- belt-and-suspenders, but it future-proofs against any ID reuse
  -- and makes the contract explicit.
  if p_reversal_of is not null then
    select id, movement_type, quantity, product_id, warehouse_id, status
      into v_original
    from public.stock_movements
    where id = p_reversal_of
      and product_id = p_product_id
      and warehouse_id = p_warehouse_id    -- audit v0.4.2 / M-11
      and status = 'committed';
    if not found then
      raise exception 'reversal target not found or not in this warehouse';
    end if;
    -- Reversal direction validation: a reversal must invert the type.
    if p_movement_type = 'reversal' and v_original.movement_type = 'stock_in' and p_quantity <> v_original.quantity then
      raise exception 'reversal quantity must match the original';
    end if;
  end if;

  -- Lock the inventory balance row (or insert if missing) — same as
  -- canonical 0038 version. This block is duplicated here to keep the
  -- function self-contained; once a future migration rewrites
  -- apply_stock_movement end-to-end, this can be consolidated.
  if p_movement_type in ('stock_in', 'stock_out') then
    if private.member_role(p_warehouse_id, v_user_id) not in ('STAFF', 'MANAGER', 'OWNER') then
      raise exception 'insufficient permission';
    end if;
  elsif p_movement_type in ('adjustment', 'reversal') then
    -- Adjustments and reversals are pending_approval; permission check
    -- happens at approval time.
    null;
  end if;

  select * into v_balance
  from public.inventory_balances
  where warehouse_id = p_warehouse_id and product_id = p_product_id
  for update;

  if v_balance is null then
    insert into public.inventory_balances (warehouse_id, product_id, quantity, version, updated_by)
    values (p_warehouse_id, p_product_id, 0, 0, v_user_id);
    select * into v_balance
    from public.inventory_balances
    where warehouse_id = p_warehouse_id and product_id = p_product_id
    for update;
  end if;

  -- Compute new quantity
  if p_movement_type in ('stock_in', 'adjustment') then
    v_new_qty := v_balance.quantity + p_quantity;
  elsif p_movement_type = 'stock_out' then
    v_new_qty := v_balance.quantity - p_quantity;
  elsif p_movement_type = 'reversal' then
    -- For a reversal, p_quantity is the original quantity and the
    -- original direction is implied by sign: stock_in reversal
    -- subtracts; stock_out reversal adds back.
    if v_original.movement_type = 'stock_in' then
      v_new_qty := v_balance.quantity - p_quantity;
    else
      v_new_qty := v_balance.quantity + p_quantity;
    end if;
  end if;

  if v_new_qty < 0 then
    raise exception 'insufficient stock';
  end if;

  -- Optimistic version check
  if v_balance.version <> p_expected_balance_version then
    raise exception 'stale stock version';
  end if;

  -- Insert movement
  insert into public.stock_movements (
    id, warehouse_id, product_id, movement_type, quantity,
    expected_balance_version, role_at_time, actor_user_id, actor_wallet,
    reason, reference, reversal_of, idempotency_key,
    payload, payload_hash, status, request_fingerprint
  )
  values (
    p_movement_id, p_warehouse_id, p_product_id, p_movement_type, p_quantity,
    p_expected_balance_version,
    private.member_role(p_warehouse_id, v_user_id),
    v_user_id, p_actor_wallet,
    p_reason, p_reference, p_reversal_of, p_idempotency_key,
    p_proof_payload, p_proof_payload_hash,
    case when p_movement_type in ('adjustment', 'reversal') then 'pending_approval' else 'committed' end,
    p_request_fingerprint
  );

  -- Update balance (only if not pending approval)
  if p_movement_type not in ('adjustment', 'reversal') then
    update public.inventory_balances
      set quantity = v_new_qty,
          version = v_balance.version + 1,
          updated_at = now(),
          updated_by = v_user_id
    where id = v_balance.id;
  end if;

  -- Enqueue proof
  if p_proof_payload is not null and p_proof_payload_hash is not null then
    select contract_address into v_wh_address
    from public.warehouses where id = p_warehouse_id;
    if v_wh_address is not null then
      v_proof_id := gen_random_uuid();
      insert into public.proofs (
        id, warehouse_id, warehouse_address, movement_id, payload,
        payload_version, payload_hash, status
      )
      values (
        v_proof_id, p_warehouse_id, lower(v_wh_address), p_movement_id,
        p_proof_payload, 1, p_proof_payload_hash, 'pending'
      );
      insert into public.proof_outbox (id, proof_id, status, attempt_count, next_attempt_at)
      values (gen_random_uuid(), v_proof_id, 'pending', 0, now());
    end if;
  end if;

  -- Notify
  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  if p_movement_type in ('stock_in', 'stock_out') then
    perform private.write_notification(
      v_user_id, p_warehouse_id,
      case when p_movement_type = 'stock_in' then 'stock_in' else 'stock_out' end,
      case when p_movement_type = 'stock_in' then 'Stok masuk tercatat' else 'Stok keluar tercatat' end,
      format('%s mencatat %s %s di %s', coalesce((select display_name from public.users where id = v_user_id), 'Pengguna'), p_quantity, (select unit from public.products where id = p_product_id), v_wh_name),
      jsonb_build_object('warehouse_id', p_warehouse_id, 'movement_id', p_movement_id, 'quantity', p_quantity),
      'movement:' || p_movement_id::text
    );
  end if;

  return query select * from public.stock_movements where id = p_movement_id;
end;
$function$;

comment on function public.apply_stock_movement(
  uuid, uuid, text, numeric, integer, text, text, uuid, text, text, uuid, jsonb, text, text
) is
  'Applies a stock movement atomically. Audit v0.4.2 (M-11): reversal lookup now '
  'includes `AND warehouse_id = p_warehouse_id` so a reversal target can only '
  'reference a movement in the same warehouse.';
