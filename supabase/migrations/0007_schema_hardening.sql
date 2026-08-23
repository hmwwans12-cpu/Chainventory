-- ============================================================================
-- Chainventory — 0007: Schema hardening (grill-me §7 review 2026-08-15)
-- ============================================================================
-- Perbaikan dari sesi grill-me terhadap IMPLEMENTATION_PLAN_04 §7:
--
--   T1  approve_stock_adjustment race → row lock movement + conditional
--       UPDATE (where status = 'pending_approval') → deteksi double-apply.
--   T2  double-reversal → cek cumulative sum reversal terhadap quantity
--       asli (reversal PARSIAL diizinkan, tapi tidak boleh melebihi asli).
--   T3  products status (archive/reactivate) hanya MANAGER/OWNER → trigger
--       role check (defense-in-depth; Route Handler tetap check dulu).
--   T4  join_requests SELECT admin hanya OWNER/MANAGER (konsisten
--       JOIN_REQUEST_READ) — bukan semua member aktif.
--   T5  warehouses: kolom identitas (warehouse_code, owner_user_id,
--       on_chain_owner_wallet, contract_address) IMMUTABLE via Data API →
--       trigger yang menolak perubahan oleh role `authenticated`.
--       Kolom lain (name, company_name, warehouse_type, status) tetap
--       dikelola owner/server flow.
--   T6  (tercakup T2) reversal parsial dengan batas cumulative.
--
-- ADDITIVE + idempotent guard. Tidak menghapus perilaku yang sudah diuji;
-- hanya mengencangkan guard data-integrity & authorization.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- T1: approve_stock_adjustment — anti double-apply (race).
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

  -- Row lock movement SELALU (bukan hanya status read) → dua approve paralel
  -- akan serialize; yang kedua membaca status committed dan ditolak.
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

  -- Conditional UPDATE: hanya baris yang masih pending_approval. FOUND = false
  -- → sudah diproses transaksi lain (race) → rollback seluruh perubahan.
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

  return v_movement;
end;
$$;

-- ----------------------------------------------------------------------------
-- T2/T6: apply_stock_movement — cegah double/over-reversal.
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
  v_original_qty numeric;
  v_reversed_total numeric;
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

    -- Original quantity & total yang sudah di-reverse (hanya committed).
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
-- T3: products — perubahan status (archive/reactivate) hanya MANAGER/OWNER.
--     (RLS tetap STAFF+ untuk update kolom lain; trigger ini menutup celah
--      STAFF meng-archive langsung via Data API.)
--
-- Catatan: gunakan `auth.role()`, bukan `session_user`/`current_user`.
-- Fungsi trigger ini SECURITY DEFINER → `current_user` berubah jadi definer
-- (postgres). `session_user` di Supabase juga selalu role koneksi pooler
-- (authenticator/postgres) karena PostgREST memakai SET ROLE. Satu-satunya
-- cek yang akurat untuk "user login via Data API" adalah `auth.role()`
-- (membaca `request.jwt.claims ->> 'role'` = 'authenticated'/'service_role').
-- Server flow / processor (service_role) tidak diblokir.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_product_status_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
begin
  if NEW.status is distinct from OLD.status then
    -- Blokir hanya sesi USER langsung (Data API / Route Handler).
    -- Server flow (service_role) & definer intern: otorisasi sudah dicek
    -- di fungsi pemanggil; trigger tidak double-block.
    if auth.role() = 'authenticated' then
      v_role := private.member_role(NEW.warehouse_id, auth.uid());
      if v_role not in ('MANAGER', 'OWNER') then
        raise exception 'only MANAGER or OWNER can archive/reactivate products';
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists products_status_role on public.products;
create trigger products_status_role
  before update of status on public.products
  for each row execute function public.enforce_product_status_role();

-- ----------------------------------------------------------------------------
-- T5: warehouses — kolom identitas IMMUTABLE via Data API (role authenticated).
--     name/company_name/warehouse_type/status tetap bisa di-update owner;
--     on-chain/identity hanya lewat fungsi security definer (server flow /
--     processor). Sama: gunakan `auth.role()` (bukan session_user/current_user).
-- ----------------------------------------------------------------------------
create or replace function public.enforce_warehouse_identity_immutable()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if NEW.warehouse_code is distinct from OLD.warehouse_code
       or NEW.owner_user_id is distinct from OLD.owner_user_id
       or NEW.on_chain_owner_wallet is distinct from OLD.on_chain_owner_wallet
       or NEW.contract_address is distinct from OLD.contract_address then
      raise exception 'warehouse identity columns are immutable via Data API';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists warehouses_identity_immutable on public.warehouses;
create trigger warehouses_identity_immutable
  before update on public.warehouses
  for each row execute function public.enforce_warehouse_identity_immutable();

-- ----------------------------------------------------------------------------
-- T4: join_requests — SELECT admin (pending) hanya OWNER/MANAGER.
--     Pemilik request tetap bisa melihat request-nya sendiri (policy lain).
-- ----------------------------------------------------------------------------
drop policy if exists join_requests_select_admin on public.join_requests;
create policy "join_requests_select_admin"
  on public.join_requests
  for select
  to authenticated
  using (
    (select private.member_role(warehouse_id, auth.uid())) in ('OWNER', 'MANAGER')
    and status = 'pending'
  );
