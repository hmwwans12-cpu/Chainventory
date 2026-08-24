-- ============================================================================
-- Chainventory — 0030: P0 + P1 database hardening (audit v0.1.2)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- P0-02: products.warehouse_id IMMUTABLE setelah insert.
-- Mencegah product "dipindah" antar warehouse via direct Data API UPDATE,
-- yang merusak tenant integrity (ledger history tetap di warehouse lama).
-- ----------------------------------------------------------------------------

create or replace function public.enforce_product_warehouse_immutable()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if NEW.warehouse_id is distinct from OLD.warehouse_id then
    raise exception 'product warehouse_id is immutable'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists products_warehouse_immutable on public.products;
create trigger products_warehouse_immutable
  before update of warehouse_id on public.products
  for each row
  execute function public.enforce_product_warehouse_immutable();

-- ----------------------------------------------------------------------------
-- P1-05: wallet ownership binding pada create_user_paid_stock_intent.
-- actor_wallet harus terdaftar & terverifikasi milik auth.uid().
-- ----------------------------------------------------------------------------

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
  p_payload_hash text
)
returns public.stock_intents
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
  v_intent public.stock_intents;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- P1-02: warehouse suspended menolak intent (user jangan buang gas).
  if not exists (
    select 1 from public.warehouses
    where id = p_warehouse_id and status = 'active'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  v_role := private.member_role(p_warehouse_id, auth.uid());
  if v_role not in ('OWNER', 'MANAGER', 'STAFF') then
    raise exception 'FORBIDDEN';
  end if;

  -- P1-05: wallet harus milik user & verified.
  if not exists (
    select 1 from public.wallets
    where user_id = auth.uid()
      and lower(address) = lower(p_actor_wallet)
  ) then
    raise exception 'WALLET_NOT_OWNED';
  end if;

  if not exists (
    select 1 from public.products
    where id = p_product_id
      and warehouse_id = p_warehouse_id
      and status = 'active'
  ) then
    raise exception 'NOT_FOUND';
  end if;

  select * into v_intent
  from public.stock_intents
  where actor_user_id = auth.uid()
    and idempotency_key = p_idempotency_key;
  if found then
    return v_intent;
  end if;

  insert into public.stock_intents (
    id, warehouse_id, product_id, actor_user_id, actor_wallet,
    movement_type, quantity, expected_balance_version, reason, reference,
    idempotency_key, payload, payload_hash
  )
  values (
    p_id, p_warehouse_id, p_product_id, auth.uid(), lower(p_actor_wallet),
    p_movement_type, p_quantity, p_expected_balance_version, p_reason,
    p_reference, p_idempotency_key, p_payload, p_payload_hash
  )
  on conflict (actor_user_id, idempotency_key) do nothing
  returning * into v_intent;

  if not found then
    select * into v_intent
    from public.stock_intents
    where actor_user_id = auth.uid()
      and idempotency_key = p_idempotency_key;
  end if;

  return v_intent;
end;
$$;
