-- ============================================================================
-- Chainventory — 0006: Inventory Core (products, inventory_balances,
-- stock_movements, trigger unit immutability, RPC apply_stock_movement)
-- ============================================================================
-- Aliran: ADDITIVE murni. Mengikuti IMPLEMENTATION_PLAN_04 §7.6–§7.8, §7.12.
--
--   - products          : katalog item per warehouse; SKU unik per warehouse;
--                         unit IMMUTABLE setelah movement pertama (trigger).
--   - inventory_balances: saldo terkini + version untuk optimistic lock.
--                         HANYA diubah via RPC (row lock + conditional).
--   - stock_movements   : ledger append-only. Tidak ada UPDATE/DELETE dari
--                         UI; koreksi = movement baru (reversal).
--
-- RPC `apply_stock_movement` (security definer): validasi role →
-- SELECT ... FOR UPDATE produk+balance → cek version (STALE_STOCK) → cek
-- stok cukup (INSUFFICIENT_STOCK) → tulis movement → update balance/version
-- dalam SATU transaksi. Adjustment → 'pending_approval' (belum mengubah
-- saldo); approve/reject via RPC terpisah.
--
-- Numeric = NUMERIC(24,3). Timestamp = timestamptz. ID = uuid.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. products
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  sku text not null,
  name text not null,
  category text,
  unit text not null,
  low_stock_threshold numeric(24,3) not null default 0,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_sku_not_blank check (btrim(sku) <> ''),
  constraint products_name_not_blank check (btrim(name) <> ''),
  constraint products_unit_not_blank check (btrim(unit) <> ''),
  constraint products_low_stock_non_negative check (low_stock_threshold >= 0)
);

comment on table public.products is
  'Katalog item per warehouse. SKU unik per warehouse (PRD §45). Unit immutable setelah movement pertama.';

-- SKU unik per warehouse (PRD §45).
create unique index if not exists products_warehouse_sku_idx
  on public.products (warehouse_id, sku);

create index if not exists products_warehouse_idx on public.products (warehouse_id);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- Trigger unit immutability (ARSITEKTUR §4.3): unit TIDAK boleh berubah
-- setelah ada stock movement untuk produk tersebut (perubahan unit merusak
-- makna ledger). Enforcement final di DB; Route Handler hanya validasi UX.
create or replace function public.enforce_product_unit_immutable()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if NEW.unit is distinct from OLD.unit then
    if exists (
      select 1 from public.stock_movements
      where product_id = OLD.id
    ) then
      raise exception 'unit is immutable after first stock movement';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists products_unit_immutable on public.products;
create trigger products_unit_immutable
  before update of unit on public.products
  for each row execute function public.enforce_product_unit_immutable();

-- ----------------------------------------------------------------------------
-- 2. inventory_balances
-- ----------------------------------------------------------------------------
create table if not exists public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity numeric(24,3) not null default 0,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null,
  constraint inventory_balances_non_negative check (quantity >= 0)
);

comment on table public.inventory_balances is
  'Saldo terkini per (warehouse, product). HANYA diubah via apply_stock_movement / approve_stock_adjustment (row lock + version).';

create unique index if not exists inventory_balances_wh_product_idx
  on public.inventory_balances (warehouse_id, product_id);

create index if not exists inventory_balances_product_idx on public.inventory_balances (product_id);

-- ----------------------------------------------------------------------------
-- 3. stock_movements (ledger append-only)
-- ----------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  movement_type text not null
    check (movement_type in ('stock_in', 'stock_out', 'adjustment', 'reversal')),
  quantity numeric(24,3) not null
    check (quantity > 0),
  actor_user_id uuid references public.users (id) on delete set null,
  actor_wallet text,
  role_at_time text
    check (role_at_time in ('OWNER', 'MANAGER', 'STAFF', 'AUDITOR', 'VIEWER')),
  reason text,
  reference text,
  reversal_of uuid references public.stock_movements (id),
  status text not null default 'committed'
    check (status in ('pending_approval', 'committed', 'rejected')),
  approved_by uuid references public.users (id) on delete set null,
  approved_at timestamptz,
  expected_balance_version bigint,
  idempotency_key text,
  created_at timestamptz not null default now()
);

comment on table public.stock_movements is
  'Ledger append-only. Tidak ada UPDATE/DELETE dari UI; koreksi = reversal. Adjustment dibuat pending_approval dan baru mengubah saldo setelah di-approve.';

create index if not exists stock_movements_warehouse_idx on public.stock_movements (warehouse_id);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id);
create index if not exists stock_movements_actor_idx on public.stock_movements (actor_user_id);

-- Idempotency (PRD §32): satu idempotencyKey hanya dipakai sekali.
create unique index if not exists stock_movements_idempotency_idx
  on public.stock_movements (idempotency_key)
  where idempotency_key is not null;

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.stock_movements enable row level security;

-- SELECT: member ACTIVE warehouse (private.is_member dari migration 0004).
-- Mutasi: hanya via RPC security definer di bawah (deny by default).
drop policy if exists products_select_member on public.products;
create policy "products_select_member"
  on public.products
  for select
  to authenticated
  using ((select private.is_member(warehouse_id)));

-- Insert/Update produk: member dengan role STAFF/MANAGER/OWNER (PRODUCT_CREATE,
-- PRODUCT_EDIT). Archive (status) juga lewat sini — enforcement role terperinci
-- (PRODUCT_ARCHIVE hanya MANAGER/OWNER) di Route Handler; RLS = defense-in-depth
-- role-level. Unit immutable tetap di-trigger (final).
drop policy if exists products_insert_staff on public.products;
create policy "products_insert_staff"
  on public.products
  for insert
  to authenticated
  with check (
    (select private.is_member(warehouse_id))
    and (select private.member_role(warehouse_id, auth.uid())) in ('STAFF', 'MANAGER', 'OWNER')
  );

drop policy if exists products_update_staff on public.products;
create policy "products_update_staff"
  on public.products
  for update
  to authenticated
  using (
    (select private.is_member(warehouse_id))
    and (select private.member_role(warehouse_id, auth.uid())) in ('STAFF', 'MANAGER', 'OWNER')
  )
  with check (
    (select private.is_member(warehouse_id))
    and (select private.member_role(warehouse_id, auth.uid())) in ('STAFF', 'MANAGER', 'OWNER')
  );

drop policy if exists inventory_balances_select_member on public.inventory_balances;
create policy "inventory_balances_select_member"
  on public.inventory_balances
  for select
  to authenticated
  using ((select private.is_member(warehouse_id)));

drop policy if exists stock_movements_select_member on public.stock_movements;
create policy "stock_movements_select_member"
  on public.stock_movements
  for select
  to authenticated
  using ((select private.is_member(warehouse_id)));

-- ----------------------------------------------------------------------------
-- 5. GRANT eksplisit (Data API).
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on table public.products to authenticated;
grant insert, update on table public.products to authenticated;
grant select on table public.inventory_balances to authenticated;
grant select on table public.stock_movements to authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC apply_stock_movement
-- ----------------------------------------------------------------------------
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
  p_actor_wallet text default null
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
  --   stock_in/stock_out : STAFF/MANAGER/OWNER (STOCK_IN/STOCK_OUT)
  --   adjustment         : MANAGER/OWNER       (STOCK_ADJUSTMENT)
  --   reversal           : MANAGER/OWNER       (STOCK_REVERSAL)
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

  -- Idempotency: kalau idempotencyKey pernah dipakai, kembalikan hasil lama.
  -- CATATAN: gunakan FOUND, bukan `v_existing is not null` — row variable
  -- dengan sebagian kolom NULL membuat `is not null` bernilai false.
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
               false, 'IDEMPOTENT', 'already processed';
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

  -- Reversal: pastikan target committed & bukan reversal lagi.
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

  -- Tulis movement.
  insert into public.stock_movements (
    warehouse_id, product_id, movement_type, quantity,
    actor_user_id, actor_wallet, role_at_time, reason, reference,
    reversal_of, status, expected_balance_version, idempotency_key
  )
  values (
    p_warehouse_id, p_product_id, p_movement_type, p_quantity,
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

  -- Proof pipeline (Step 5) akan di-hook di sini dalam transaksi yang sama.

  return query
    select v_movement_id, v_new_version, false, null::text, 'ok';
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC approve_stock_adjustment / reject_stock_adjustment
-- ----------------------------------------------------------------------------
create or replace function public.approve_stock_adjustment(p_movement_id uuid)
returns public.stock_movements
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_movement public.stock_movements;
  v_balance public.inventory_balances;
  v_new_qty numeric;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_movement
  from public.stock_movements
  where id = p_movement_id;

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

  update public.inventory_balances
    set quantity = v_new_qty,
        version = v_balance.version + 1,
        updated_at = now(),
        updated_by = v_user_id
  where id = v_balance.id;

  update public.stock_movements
    set status = 'committed', approved_by = v_user_id, approved_at = now()
  where id = p_movement_id
  returning * into v_movement;

  return v_movement;
end;
$$;

create or replace function public.reject_stock_adjustment(p_movement_id uuid, p_reason text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_movement public.stock_movements;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_movement
  from public.stock_movements
  where id = p_movement_id;

  if v_movement is null then
    raise exception 'movement not found';
  end if;

  if v_movement.movement_type <> 'adjustment' or v_movement.status <> 'pending_approval' then
    raise exception 'movement not awaiting approval';
  end if;

  if private.member_role(v_movement.warehouse_id, v_user_id) not in ('MANAGER', 'OWNER') then
    raise exception 'insufficient permission';
  end if;

  update public.stock_movements
    set status = 'rejected', approved_by = v_user_id, approved_at = now(), reason = coalesce(p_reason, reason)
  where id = p_movement_id;
end;
$$;

grant execute on function public.apply_stock_movement(uuid, uuid, text, numeric, bigint, text, text, uuid, text, text) to authenticated;
grant execute on function public.approve_stock_adjustment(uuid) to authenticated;
grant execute on function public.reject_stock_adjustment(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Realtime (whitelist eksplisit, ARSITEKTUR §6).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_balances'
  ) then
    alter publication supabase_realtime add table public.inventory_balances;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stock_movements'
  ) then
    alter publication supabase_realtime add table public.stock_movements;
  end if;
end;
$$;
