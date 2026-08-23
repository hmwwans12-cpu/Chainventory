-- User-paid stock proof v2: inventory is committed only after the member's
-- wallet has recorded the proof on Base Sepolia. Old proof_outbox remains for
-- historical v1 records only.

create table if not exists public.stock_intents (
  id uuid primary key,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  actor_wallet text not null,
  movement_type text not null check (movement_type in ('stock_in', 'stock_out')),
  quantity numeric(24,3) not null check (quantity > 0),
  expected_balance_version bigint,
  reason text,
  reference text,
  idempotency_key text not null,
  payload jsonb not null,
  payload_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'committed', 'failed', 'cancelled')),
  tx_hash text,
  error text,
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (actor_user_id, idempotency_key)
);

create index if not exists stock_intents_warehouse_status_idx on public.stock_intents (warehouse_id, status, created_at desc);
alter table public.stock_intents enable row level security;
create policy stock_intents_select_own on public.stock_intents for select to authenticated using (actor_user_id = auth.uid());

create or replace function public.create_user_paid_stock_intent(
  p_id uuid, p_warehouse_id uuid, p_product_id uuid, p_movement_type text,
  p_quantity numeric, p_expected_balance_version bigint, p_reason text,
  p_reference text, p_actor_wallet text, p_idempotency_key text,
  p_payload jsonb, p_payload_hash text
) returns public.stock_intents language plpgsql security definer set search_path = public as $$
declare v_role text; v_intent public.stock_intents;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  v_role := private.member_role(p_warehouse_id, auth.uid());
  if v_role not in ('OWNER', 'MANAGER', 'STAFF') then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.products where id = p_product_id and warehouse_id = p_warehouse_id and status = 'active') then raise exception 'NOT_FOUND'; end if;
  select * into v_intent from public.stock_intents where actor_user_id = auth.uid() and idempotency_key = p_idempotency_key;
  if found then return v_intent; end if;
  insert into public.stock_intents (id, warehouse_id, product_id, actor_user_id, actor_wallet, movement_type, quantity, expected_balance_version, reason, reference, idempotency_key, payload, payload_hash)
  values (p_id, p_warehouse_id, p_product_id, auth.uid(), lower(p_actor_wallet), p_movement_type, p_quantity, p_expected_balance_version, p_reason, p_reference, p_idempotency_key, p_payload, p_payload_hash)
  returning * into v_intent;
  return v_intent;
end; $$;

create or replace function public.submit_user_paid_stock_intent(p_id uuid, p_tx_hash text)
returns public.stock_intents language plpgsql security definer set search_path = public as $$
declare v_intent public.stock_intents;
begin
  select * into v_intent from public.stock_intents where id = p_id and actor_user_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_intent.status = 'committed' then return v_intent; end if;
  if v_intent.status <> 'pending' or v_intent.expires_at < now() then raise exception 'INTENT_NOT_ACTIVE'; end if;
  update public.stock_intents set status = 'submitted', tx_hash = p_tx_hash, updated_at = now() where id = p_id returning * into v_intent;
  return v_intent;
end; $$;

-- Called only after the BFF has independently verified the wallet transaction
-- and its ProofRecorded event. It reuses the existing locked movement RPC and
-- writes a confirmed proof without creating a treasury outbox job.
create or replace function public.commit_user_paid_stock_intent(p_id uuid)
returns table (movement_id uuid, balance_version bigint, error_code text, message text)
language plpgsql security definer set search_path = public as $$
declare v_intent public.stock_intents; v_result record;
begin
  select * into v_intent from public.stock_intents where id = p_id and actor_user_id = auth.uid() for update;
  if not found then return query select null::uuid, null::bigint, 'NOT_FOUND', 'intent not found'; return; end if;
  if v_intent.status = 'committed' then
    return query select v_intent.id, coalesce((select version from public.inventory_balances where warehouse_id=v_intent.warehouse_id and product_id=v_intent.product_id), 0), null::text, 'already committed'; return;
  end if;
  if v_intent.status <> 'submitted' then return query select null::uuid, null::bigint, 'INTENT_NOT_ACTIVE', 'intent not submitted'; return; end if;
  select * into v_result from public.apply_stock_movement(v_intent.warehouse_id, v_intent.product_id, v_intent.movement_type, v_intent.quantity, v_intent.expected_balance_version, v_intent.reason, v_intent.reference, null, v_intent.idempotency_key, v_intent.actor_wallet, v_intent.id, null, null);
  if v_result.error_code is not null and v_result.error_code <> 'IDEMPOTENT' then
    update public.stock_intents set status='failed', error=v_result.message, updated_at=now() where id=p_id;
    return query select null::uuid, v_result.balance_version, v_result.error_code, v_result.message; return;
  end if;
  insert into public.proofs (warehouse_id, warehouse_address, movement_id, payload, payload_version, payload_hash, status, tx_hash, confirmation_count)
  select v_intent.warehouse_id, lower(w.contract_address), v_intent.id, v_intent.payload, 2, v_intent.payload_hash, 'confirmed', v_intent.tx_hash, 1
  from public.warehouses w where w.id = v_intent.warehouse_id
  on conflict (payload_hash) do nothing;
  update public.stock_intents set status='committed', updated_at=now() where id=p_id;
  perform private.write_audit(v_intent.warehouse_id, auth.uid(), 'stock_movement_committed', 'stock_movements', v_intent.id::text, null, jsonb_build_object('tx_hash', v_intent.tx_hash), v_intent.tx_hash, 'confirmed');
  return query select v_intent.id, v_result.balance_version, null::text, 'ok';
end; $$;

revoke all on function public.create_user_paid_stock_intent(uuid, uuid, uuid, text, numeric, bigint, text, text, text, text, jsonb, text) from public;
revoke all on function public.submit_user_paid_stock_intent(uuid, text) from public;
revoke all on function public.commit_user_paid_stock_intent(uuid) from public;
grant execute on function public.create_user_paid_stock_intent(uuid, uuid, uuid, text, numeric, bigint, text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.submit_user_paid_stock_intent(uuid, text) to authenticated;
grant execute on function public.commit_user_paid_stock_intent(uuid) to authenticated;
