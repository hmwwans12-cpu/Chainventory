-- ============================================================================
-- Chainventory — 0009: Proof pipeline async (P1 Step 5)
-- ============================================================================
-- Proof pipeline (WORKFLOW §6, ARSITEKTUR §4, IMPLEMENTATION_PLAN_04 §5/§7.9-§7.12):
--
--   * `proofs`          — payload immutable (jsonb) + payload_hash (Keccak-256,
--                         hash_version=1). Status lifecycle:
--                         pending → submitted → confirming → confirmed
--                         (retrying ↔ pending; failed max-5 → manual_review).
--   * `proof_outbox`    — antrian delivery QStash (pending → leased → sent /
--                         failed + next_attempt_at backoff). TIDAK pernah
--                         diekspos ke Data API (server/service-role saja).
--   * `audit_logs`      — append-only; SELECT OWNER/MANAGER; INSERT hanya via
--                         definer/server.
--   * `apply_stock_movement` / `approve_stock_adjustment` kini MENERIMA payload
--     + hash proof dan membuat baris proofs+proof_outbox DALAM TRANSAKSI YANG
--     SAMA dengan movement (bukan setelah commit).
--
-- Payload + hash dihitung di BFF (JCS RFC 8785 + Keccak-256, lib/proof/);
-- DB hanya menyimpan + memvalidasi. Processor menghitung ULANG hash dari
-- payload tersimpan sebelum submit; mismatch → manual_review + audit log
-- (JANGAN dikirim ke chain) — WORKFLOW §6.
--
-- Function proof_* (lease/complete/requeue/mark_manual/set_confirmation)
-- HANYA untuk service_role (processor), bukan authenticated/anon.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. audit_logs (PRD §22, PLAN §7.11)
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid references public.warehouses(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  related_tx_hash text,
  status text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_warehouse_created_idx
  on public.audit_logs (warehouse_id, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_managers on public.audit_logs;
create policy audit_logs_select_managers on public.audit_logs
  for select to authenticated
  using (
    warehouse_id is not null
    and (select private.member_role(warehouse_id, auth.uid())) in ('OWNER', 'MANAGER')
  );

-- Helper internal (definer). Tidak perlu grant ke authenticated — hanya
-- dipanggil dari function security definer lain / server (service_role).
create or replace function private.write_audit(
  p_warehouse_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_entity text,
  p_entity_id text default null,
  p_before_state jsonb default null,
  p_after_state jsonb default null,
  p_related_tx_hash text default null,
  p_status text default null
) returns void
language sql
security definer set search_path = public
as $$
  insert into public.audit_logs (
    warehouse_id, actor_user_id, action, entity, entity_id,
    before_state, after_state, related_tx_hash, status
  )
  values (
    p_warehouse_id, p_actor_user_id, p_action, p_entity, p_entity_id,
    p_before_state, p_after_state, p_related_tx_hash, p_status
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. proofs (PLAN §7.9)
-- ----------------------------------------------------------------------------
create table if not exists public.proofs (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  warehouse_address text not null,
  movement_id uuid references public.stock_movements(id) on delete set null,
  payload jsonb not null,
  payload_version int not null default 1,
  payload_hash text not null,
  status text not null default 'pending',
  tx_hash text,
  confirmation_count int not null default 0,
  attempt_count int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proofs_payload_hash_unique unique (payload_hash),
  constraint proofs_status_check check (
    status in ('pending', 'submitted', 'confirming', 'confirmed', 'retrying', 'manual_review', 'failed')
  )
);

create index if not exists proofs_movement_idx on public.proofs (movement_id);
create index if not exists proofs_warehouse_status_idx on public.proofs (warehouse_id, status);
create index if not exists proofs_status_created_idx on public.proofs (status, created_at);

comment on table public.proofs is
  'Bukti on-chain untuk movement committed. Payload immutable; hash dihitung saat dibuat. Mutasi hanya via RPC definer / server processor (service_role).';

-- ----------------------------------------------------------------------------
-- 3. proof_outbox (PLAN §7.10) — antrian delivery QStash
-- ----------------------------------------------------------------------------
create table if not exists public.proof_outbox (
  id uuid primary key default gen_random_uuid(),
  proof_id uuid not null references public.proofs(id) on delete cascade,
  status text not null default 'pending',
  lease_expires_at timestamptz,
  lease_token text,
  attempt_count int not null default 0,
  next_attempt_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proof_outbox_status_check check (
    status in ('pending', 'leased', 'sent', 'failed')
  )
);

create unique index if not exists proof_outbox_proof_unique_idx on public.proof_outbox (proof_id);
create index if not exists proof_outbox_ready_idx on public.proof_outbox (status, next_attempt_at);

comment on table public.proof_outbox is
  'Antrian QStash. TIDAK ada policy RLS → tidak pernah terbaca/termutasi via Data API (mutasi hanya server processor service_role / definer).';

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
alter table public.proofs enable row level security;
alter table public.proof_outbox enable row level security;

-- Member warehouse (role apa pun) bisa MELIHAT status proof; mutasi hanya
-- lewat definer/server (tidak ada policy INSERT/UPDATE/DELETE).
drop policy if exists proofs_select_member on public.proofs;
create policy proofs_select_member on public.proofs
  for select to authenticated
  using ((select private.member_role(warehouse_id, auth.uid())) is not null);

-- proof_outbox: sengaja TANPA policy.

-- ----------------------------------------------------------------------------
-- 5. RPC proof lifecycle (service_role only)
-- ----------------------------------------------------------------------------

-- Lease: atomik pending/failed → leased + attempt++ (duplicate-delivery safe).
-- Hanya mengambil proof yang masih pending/retrying (belum pernah submit).
create or replace function public.proof_lease(p_proof_id uuid)
returns table (
  proof_id uuid,
  warehouse_address text,
  movement_id uuid,
  payload jsonb,
  payload_hash text,
  attempt_count int
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_token text := gen_random_uuid()::text;
begin
  update public.proof_outbox ob
    set status = 'leased',
        lease_expires_at = now() + interval '10 minutes',
        lease_token = v_token,
        attempt_count = ob.attempt_count + 1,
        updated_at = now()
  where ob.proof_id = p_proof_id
    and ob.status in ('pending', 'failed')
    and (ob.next_attempt_at is null or ob.next_attempt_at <= now())
    and exists (
      select 1 from public.proofs p
      where p.id = p_proof_id and p.status in ('pending', 'retrying')
    );

  if not found then
    return;
  end if;

  return query
    select pr.id, pr.warehouse_address, pr.movement_id, pr.payload, pr.payload_hash, ob.attempt_count
    from public.proofs pr
    join public.proof_outbox ob on ob.proof_id = pr.id
    where pr.id = p_proof_id;
end;
$$;

-- Complete: submit sukses → outbox sent + proofs status/tx_hash.
create or replace function public.proof_complete(p_proof_id uuid, p_tx_hash text, p_status text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_wh uuid;
  v_mid uuid;
begin
  select warehouse_id, movement_id into v_wh, v_mid
  from public.proofs where id = p_proof_id;

  update public.proof_outbox
    set status = 'sent', lease_token = null, lease_expires_at = null, error = null, updated_at = now()
  where proof_id = p_proof_id;

  update public.proofs
    set status = p_status, tx_hash = coalesce(p_tx_hash, tx_hash), error = null, updated_at = now()
  where id = p_proof_id;

  perform private.write_audit(
    v_wh, null, 'proof_submitted', 'proofs', p_proof_id::text,
    null, jsonb_build_object('status', p_status, 'tx_hash', p_tx_hash),
    p_tx_hash, p_status
  );
end;
$$;

-- Requeue: submit gagal → retrying + next_attempt_at backoff; ≥5 → manual_review.
create or replace function public.proof_requeue(
  p_proof_id uuid, p_error text, p_next_attempt_at timestamptz
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_attempts int;
  v_wh uuid;
begin
  select ob.attempt_count, pr.warehouse_id into v_attempts, v_wh
  from public.proof_outbox ob
  join public.proofs pr on pr.id = ob.proof_id
  where ob.proof_id = p_proof_id;

  if v_attempts >= 5 then
    update public.proofs set status = 'manual_review', error = p_error, updated_at = now() where id = p_proof_id;
    update public.proof_outbox set status = 'failed', lease_token = null, next_attempt_at = null, error = p_error, updated_at = now() where proof_id = p_proof_id;
    perform private.write_audit(v_wh, null, 'proof_manual_review', 'proofs', p_proof_id::text,
      null, jsonb_build_object('error', p_error, 'attempts', v_attempts), null, 'manual_review');
  else
    update public.proofs set status = 'retrying', error = p_error, updated_at = now() where id = p_proof_id;
    update public.proof_outbox set status = 'failed', lease_token = null, next_attempt_at = p_next_attempt_at, error = p_error, updated_at = now() where proof_id = p_proof_id;
    perform private.write_audit(v_wh, null, 'proof_retrying', 'proofs', p_proof_id::text,
      null, jsonb_build_object('error', p_error, 'attempt', v_attempts, 'next_attempt_at', p_next_attempt_at), null, 'retrying');
  end if;
end;
$$;

-- Manual review langsung (hash mismatch / tx revert): tanpa retry.
create or replace function public.proof_mark_manual(p_proof_id uuid, p_error text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_wh uuid;
begin
  select warehouse_id into v_wh from public.proofs where id = p_proof_id;

  update public.proofs set status = 'manual_review', error = p_error, updated_at = now() where id = p_proof_id;
  update public.proof_outbox set status = 'failed', lease_token = null, next_attempt_at = null, error = p_error, updated_at = now() where proof_id = p_proof_id;

  perform private.write_audit(v_wh, null, 'proof_manual_review', 'proofs', p_proof_id::text,
    null, jsonb_build_object('error', p_error), null, 'manual_review');
end;
$$;

-- Konfirmasi on-chain (job terpisah dari submit).
create or replace function public.proof_set_confirmation(p_proof_id uuid, p_count int, p_status text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_wh uuid;
begin
  select warehouse_id into v_wh from public.proofs where id = p_proof_id;

  update public.proofs
    set confirmation_count = p_count, status = p_status, error = null, updated_at = now()
  where id = p_proof_id;

  perform private.write_audit(v_wh, null, 'proof_confirmation', 'proofs', p_proof_id::text,
    null, jsonb_build_object('confirmation_count', p_count, 'status', p_status), null, p_status);
end;
$$;

-- Re-publish ulang oleh reconciliation (outbox yang tertinggal/failed-expired).
create or replace function public.proof_republish(p_proof_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.proof_outbox
    set status = 'pending', next_attempt_at = null, error = null, updated_at = now()
  where proof_id = p_proof_id and status = 'failed';
end;
$$;

-- Kandidat reconciliation harian (WORKFLOW §6):
--   republish  → outbox failed yang jadwalnya sudah lewat / belum ada jadwal
--   orphan     → proofs pending TANPA outbox (retak jika publish gagal)
--   confirm    → proofs submitted/confirming < 2 konfirmasi yang macet
create or replace function public.proof_reconcile_candidates()
returns table (kind text, proof_id uuid)
language sql
security definer set search_path = public
as $$
  select 'republish'::text, ob.proof_id
  from public.proof_outbox ob
  where ob.status = 'failed'
    and (ob.next_attempt_at is null or ob.next_attempt_at <= now())
  union all
  select 'orphan'::text, p.id
  from public.proofs p
  where p.status = 'pending'
    and not exists (select 1 from public.proof_outbox o where o.proof_id = p.id)
  union all
  select 'confirm'::text, p.id
  from public.proofs p
  where p.status in ('submitted', 'confirming')
    and p.confirmation_count < 2
    and p.updated_at < now() - interval '5 minutes'
$$;

revoke all on function public.proof_lease(uuid) from public, anon, authenticated;
revoke all on function public.proof_complete(uuid, text, text) from public, anon, authenticated;
revoke all on function public.proof_requeue(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.proof_mark_manual(uuid, text) from public, anon, authenticated;
revoke all on function public.proof_set_confirmation(uuid, int, text) from public, anon, authenticated;
revoke all on function public.proof_republish(uuid) from public, anon, authenticated;
revoke all on function public.proof_reconcile_candidates() from public, anon, authenticated;

grant execute on function public.proof_lease(uuid) to service_role;
grant execute on function public.proof_complete(uuid, text, text) to service_role;
grant execute on function public.proof_requeue(uuid, text, timestamptz) to service_role;
grant execute on function public.proof_mark_manual(uuid, text) to service_role;
grant execute on function public.proof_set_confirmation(uuid, int, text) to service_role;
grant execute on function public.proof_republish(uuid) to service_role;
grant execute on function public.proof_reconcile_candidates() to service_role;

-- ----------------------------------------------------------------------------
-- 6. apply_stock_movement — + payload/hash proof, dibuat SAMA TRANSAKSI.
-- ----------------------------------------------------------------------------
drop function if exists public.apply_stock_movement(uuid, uuid, text, numeric, bigint, text, text, uuid, text, text);

create or replace function public.apply_stock_movement(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_expected_balance_version bigint,
  p_reason text default null,
  p_reference text default null,
  p_reversal_of uuid default null,
  p_idempotency_key text default null,
  p_actor_wallet text default null,
  p_movement_id uuid default null,
  p_proof_payload jsonb default null,
  p_proof_payload_hash text default null
)
returns table (
  movement_id uuid,
  balance_version bigint,
  proof_pending boolean,
  error_code text,
  message text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_product public.products;
  v_balance public.inventory_balances;
  v_existing public.stock_movements;
  v_movement_id uuid;
  v_new_qty numeric;
  v_new_version bigint;
  v_original_qty numeric;
  v_reversed_total numeric;
  v_wh_address text;
  v_proof_id uuid;
  v_proof_pending boolean;
begin
  -- AUTH
  if v_user_id is null then
    return query select null::uuid, null::bigint, false, 'UNAUTHENTICATED', 'not authenticated';
    return;
  end if;

  -- Role check (member ACTIVE di warehouse)
  v_role := private.member_role(p_warehouse_id, v_user_id);
  if v_role is null then
    return query select null::uuid, null::bigint, false, 'FORBIDDEN', 'not a member of warehouse';
    return;
  end if;

  -- Permission per movement type (kanonik lib/auth/permissions.ts):
  if p_movement_type in ('stock_in', 'stock_out') then
    if v_role not in ('STAFF', 'MANAGER', 'OWNER') then
      return query select null::uuid, null::bigint, false, 'FORBIDDEN', 'insufficient permission';
      return;
    end if;
  elsif p_movement_type in ('adjustment', 'reversal') then
    if v_role not in ('MANAGER', 'OWNER') then
      return query select null::uuid, null::bigint, false, 'FORBIDDEN', 'insufficient permission';
      return;
    end if;
  else
    return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'invalid movement type';
    return;
  end if;

  -- Idempotency: gunakan FOUND (row variable sebagian NULL membuat IS NOT NULL false).
  if p_idempotency_key is not null then
    select * into v_existing
    from public.stock_movements
    where idempotency_key = p_idempotency_key
    limit 1;

    if found then
      return query
        select v_existing.id,
               coalesce((
                 select version from public.inventory_balances
                 where warehouse_id = p_warehouse_id and product_id = p_product_id
               ), 0),
               exists(select 1 from public.proofs where proofs.movement_id = v_existing.id),
               'IDEMPOTENT', 'already processed';
      return;
    end if;
  end if;

  -- Proof: payload/hash wajib menyertakan movement_id yang dipakai (BFF).
  -- Hash dihitung di BFF; DB memvalidasi konsistensi + warehouse deployed.
  if p_proof_payload is not null or p_proof_payload_hash is not null then
    if p_movement_id is null then
      return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'proof requires p_movement_id';
      return;
    end if;
    select contract_address into v_wh_address
    from public.warehouses where id = p_warehouse_id;
    if v_wh_address is null
       or lower(coalesce(p_proof_payload ->> 'warehouseAddress', '')) <> lower(v_wh_address)
       or coalesce(p_proof_payload ->> 'movementId', '') <> p_movement_id::text then
      return query select null::uuid, null::bigint, false, 'INVALID_INPUT',
        'proof requires a deployed warehouse and matching payload';
      return;
    end if;
  end if;

  -- Product milik warehouse + unit
  select * into v_product
  from public.products
  where id = p_product_id and warehouse_id = p_warehouse_id;

  if v_product is null then
    return query select null::uuid, null::bigint, false, 'NOT_FOUND', 'product not found';
    return;
  end if;

  -- Reversal: target committed, product sama, dan cumulative reversal (parsial)
  -- TIDAK boleh melebihi quantity movement asli.
  if p_movement_type = 'reversal' then
    if p_reversal_of is null then
      return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'reversal_of required';
      return;
    end if;
    if not exists (
      select 1 from public.stock_movements
      where id = p_reversal_of and product_id = p_product_id and status = 'committed'
    ) then
      return query select null::uuid, null::bigint, false, 'INVALID_REVERSAL', 'reversal target not found/committed';
      return;
    end if;

    select quantity into v_original_qty
    from public.stock_movements
    where id = p_reversal_of;

    select coalesce(sum(quantity), 0) into v_reversed_total
    from public.stock_movements
    where reversal_of = p_reversal_of
      and status = 'committed';

    if v_reversed_total + p_quantity > v_original_qty then
      return query
        select null::uuid, null::bigint, false, 'INVALID_REVERSAL',
               format('reversal exceeds original quantity: already reversed %s of %s, tried %s',
                      v_reversed_total, v_original_qty, p_quantity);
      return;
    end if;
  end if;

  -- Balance row lock (SELECT ... FOR UPDATE) — hanya untuk tipe yang langsung
  -- mengubah saldo (stock_in/out, reversal). Adjustment menunggu approval.
  v_new_version := 0;
  v_new_qty := 0;

  if p_movement_type in ('stock_in', 'stock_out', 'reversal') then
    select * into v_balance
    from public.inventory_balances
    where warehouse_id = p_warehouse_id and product_id = p_product_id
    for update;

    if v_balance is null then
      insert into public.inventory_balances (warehouse_id, product_id, quantity, version, updated_by)
      values (p_warehouse_id, p_product_id, 0, 0, v_user_id)
      on conflict (warehouse_id, product_id) do nothing;

      select * into v_balance
      from public.inventory_balances
      where warehouse_id = p_warehouse_id and product_id = p_product_id
      for update;
    end if;

    -- Optimistic lock: expected version harus cocok (STALE_STOCK).
    if p_expected_balance_version is not null
       and v_balance.version <> p_expected_balance_version then
      return query
        select null::uuid, v_balance.version, false, 'STALE_STOCK',
               format('expected version %s but current is %s', p_expected_balance_version, v_balance.version);
      return;
    end if;

    -- Hitung saldo baru (stock_out & reversal tidak boleh negative).
    v_new_qty := v_balance.quantity;
    if p_movement_type = 'stock_in' then
      v_new_qty := v_new_qty + p_quantity;
    elsif p_movement_type = 'stock_out' then
      if v_balance.quantity < p_quantity then
        return query
          select null::uuid, v_balance.version, false, 'INSUFFICIENT_STOCK',
                 format('insufficient stock: have %s, need %s', v_balance.quantity, p_quantity);
        return;
      end if;
      v_new_qty := v_new_qty - p_quantity;
    elsif p_movement_type = 'reversal' then
      if v_balance.quantity < p_quantity then
        return query
          select null::uuid, v_balance.version, false, 'INSUFFICIENT_STOCK',
                 format('insufficient stock to reverse: have %s, need %s', v_balance.quantity, p_quantity);
        return;
      end if;
      v_new_qty := v_new_qty - p_quantity;
    end if;

    v_new_version := v_balance.version + 1;
  end if;

  -- Tulis movement (id: diberikan BFF bila proof, else generated).
  v_movement_id := coalesce(p_movement_id, gen_random_uuid());
  insert into public.stock_movements (
    id, warehouse_id, product_id, movement_type, quantity,
    actor_user_id, actor_wallet, role_at_time, reason, reference,
    reversal_of, status, expected_balance_version, idempotency_key
  )
  values (
    v_movement_id, p_warehouse_id, p_product_id, p_movement_type, p_quantity,
    v_user_id, p_actor_wallet, v_role, p_reason, p_reference,
    p_reversal_of,
    case when p_movement_type = 'adjustment' then 'pending_approval' else 'committed' end,
    case when p_movement_type in ('stock_in', 'stock_out', 'reversal') then v_balance.version else null end,
    p_idempotency_key
  )
  returning id into v_movement_id;

  -- Update saldo + version (hanya untuk tipe yang langsung committed).
  if p_movement_type in ('stock_in', 'stock_out', 'reversal') then
    update public.inventory_balances
      set quantity = v_new_qty,
          version = v_new_version,
          updated_at = now(),
          updated_by = v_user_id
    where id = v_balance.id;
  end if;

  -- Proof pipeline: SAMA TRANSAKSI dengan movement (Step 5).
  -- Adjustment → proof dibuat saat approve (movement belum committed).
  v_proof_pending := false;
  if p_proof_payload is not null and p_proof_payload_hash is not null
     and p_movement_type <> 'adjustment' then
    v_proof_id := gen_random_uuid();
    insert into public.proofs (
      id, warehouse_id, warehouse_address, movement_id, payload,
      payload_version, payload_hash, status
    )
    values (
      v_proof_id, p_warehouse_id, lower(v_wh_address), v_movement_id,
      p_proof_payload, 1, p_proof_payload_hash, 'pending'
    );

    insert into public.proof_outbox (id, proof_id, status, attempt_count, next_attempt_at)
    values (gen_random_uuid(), v_proof_id, 'pending', 0, now());

    v_proof_pending := true;

    perform private.write_audit(
      p_warehouse_id, v_user_id, 'proof_created', 'proofs', v_proof_id::text,
      null, jsonb_build_object('movement_id', v_movement_id, 'payload_hash', p_proof_payload_hash),
      null, 'pending'
    );
  end if;

  return query
    select v_movement_id, v_new_version, v_proof_pending, null::text, 'ok';
end;
$$;

grant execute on function public.apply_stock_movement(uuid, uuid, text, numeric, bigint, text, text, uuid, text, text, uuid, jsonb, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. approve_stock_adjustment — + proof dibuat saat adjustment di-approve.
-- ----------------------------------------------------------------------------
drop function if exists public.approve_stock_adjustment(uuid);

create or replace function public.approve_stock_adjustment(
  p_movement_id uuid,
  p_proof_payload jsonb default null,
  p_proof_payload_hash text default null
)
returns public.stock_movements
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_movement public.stock_movements;
  v_balance public.inventory_balances;
  v_new_qty numeric;
  v_wh_address text;
  v_proof_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_movement
  from public.stock_movements
  where id = p_movement_id
  for update;

  if v_movement is null then
    raise exception 'movement not found';
  end if;

  if v_movement.movement_type <> 'adjustment' or v_movement.status <> 'pending_approval' then
    raise exception 'movement not awaiting approval';
  end if;

  -- Approver harus MANAGER/OWNER (STOCK_APPROVE_ADJUSTMENT).
  if private.member_role(v_movement.warehouse_id, v_user_id) not in ('MANAGER', 'OWNER') then
    raise exception 'insufficient permission';
  end if;

  select * into v_balance
  from public.inventory_balances
  where warehouse_id = v_movement.warehouse_id and product_id = v_movement.product_id
  for update;

  if v_balance is null then
    insert into public.inventory_balances (warehouse_id, product_id, quantity, version, updated_by)
    values (v_movement.warehouse_id, v_movement.product_id, 0, 0, v_user_id);
    select * into v_balance
    from public.inventory_balances
    where warehouse_id = v_movement.warehouse_id and product_id = v_movement.product_id
    for update;
  end if;

  v_new_qty := v_balance.quantity + v_movement.quantity;
  if v_new_qty < 0 then
    raise exception 'insufficient stock for adjustment';
  end if;

  update public.stock_movements
    set status = 'committed', approved_by = v_user_id, approved_at = now()
  where id = p_movement_id
    and status = 'pending_approval'
  returning * into v_movement;

  if not found then
    raise exception 'movement already processed';
  end if;

  update public.inventory_balances
    set quantity = v_new_qty,
        version = v_balance.version + 1,
        updated_at = now(),
        updated_by = v_user_id
  where id = v_balance.id;

  -- Proof pipeline: SAMA TRANSAKSI dengan approval.
  if p_proof_payload is not null and p_proof_payload_hash is not null then
    select contract_address into v_wh_address
    from public.warehouses where id = v_movement.warehouse_id;
    if v_wh_address is null
       or lower(coalesce(p_proof_payload ->> 'warehouseAddress', '')) <> lower(v_wh_address)
       or coalesce(p_proof_payload ->> 'movementId', '') <> p_movement_id::text then
      raise exception 'proof requires a deployed warehouse and matching payload';
    end if;

    v_proof_id := gen_random_uuid();
    insert into public.proofs (
      id, warehouse_id, warehouse_address, movement_id, payload,
      payload_version, payload_hash, status
    )
    values (
      v_proof_id, v_movement.warehouse_id, lower(v_wh_address), p_movement_id,
      p_proof_payload, 1, p_proof_payload_hash, 'pending'
    );

    insert into public.proof_outbox (id, proof_id, status, attempt_count, next_attempt_at)
    values (gen_random_uuid(), v_proof_id, 'pending', 0, now());

    perform private.write_audit(
      v_movement.warehouse_id, v_user_id, 'proof_created', 'proofs', v_proof_id::text,
      null, jsonb_build_object('movement_id', p_movement_id, 'payload_hash', p_proof_payload_hash),
      null, 'pending'
    );
  end if;

  return v_movement;
end;
$$;

grant execute on function public.approve_stock_adjustment(uuid, jsonb, text) to authenticated;