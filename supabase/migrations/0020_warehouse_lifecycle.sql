-- ============================================================================
-- Chainventory — 0020: Warehouse Lifecycle (PRD §20, DESIGN §54)
-- ============================================================================
-- Langkah 3. Definisi "inactive" (disepakati): warehouse AKTIF berdasarkan
-- `last_activity_at` (kolom baru), di-update oleh:
--   • stock movement baru — SEMUA tipe, SEMUA status termasuk pending_approval
--   • member baru join/approved (approve_join)
--   • proof yang confirmed (proof_set_confirmation)
-- BUKAN oleh login/lihat dashboard/keep-alive (agar counter tidak reset tanpa
-- penggunaan nyata).
--
-- Threshold (PRD §20): 23 hari → warning, 27 hari → critical warning,
-- 30 hari → suspend (status warehouse → 'suspended').
--
-- Isi migrasi:
--   1. Kolom `warehouses.last_activity_at` (default = created_at utk yang
--      existing → tidak langsung dianggap inactive).
--   2. View `warehouse_summaries` mengekspos last_activity_at (untuk banner).
--   3. Tipe notifikasi baru: `warehouse_inactivity_warning`,
--      `warehouse_suspended` (penerima OWNER + MANAGER).
--   4. Penutupan GAP otorisasi: RPC mutasi warehouse WAJIB menolak saat
--      warehouse berstatus 'suspended' (PRD: "warehouse suspended menolak
--      semua mutation warehouse"). Sebelumnya hanya `request_join` yang punya
--      guard — di sini ditambahkan ke seluruh RPC mutasi user.
--   5. Sinkronisasi last_activity_at di RPC event (apply_stock_movement,
--      approve_join, proof_set_confirmation).
--   6. RPC `run_warehouse_lifecycle` — sekali panggil per hari oleh cron
--      TERPISAH dari keep-alive; idempoten; notifikasi sekali per episode
--      inaktivitas (dedup per episode, bukan per unread).
--
-- Aliran: ADDITIVE + penutupan gap. Semua klausa idempotent
-- (add column if not exists / create or replace / drop ... if exists).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. warehouses.last_activity_at
-- ----------------------------------------------------------------------------
alter table public.warehouses
  add column if not exists last_activity_at timestamptz;

-- Backfill: warehouse existing tidak langsung inactive — anchor ke created_at.
update public.warehouses
  set last_activity_at = created_at
where last_activity_at is null;

alter table public.warehouses
  alter column last_activity_at set not null,
  alter column last_activity_at set default now();

comment on column public.warehouses.last_activity_at is
  'Tanda aktivitas nyata warehouse (PRD §20). Hanya di-update oleh stock movement (semua tipe/status), member join/approved, atau proof confirmed — BUKAN oleh login/keep-alive. Anchor lifecycle 23/27/30 hari.';

-- Query cron harian: status + urutan last_activity_at.
create index if not exists warehouses_lifecycle_idx
  on public.warehouses (status, last_activity_at);

-- ----------------------------------------------------------------------------
-- 2. warehouse_summaries — ekspos last_activity_at untuk member (banner)
-- ----------------------------------------------------------------------------
create or replace view public.warehouse_summaries
as
select
  w.id,
  w.warehouse_code,
  w.name,
  w.company_name,
  w.warehouse_type,
  w.status,
  w.contract_address,
  w.created_at,
  w.updated_at,
  w.last_activity_at
from public.warehouses w
where (select private.is_member(w.id));

comment on view public.warehouse_summaries is
  'Subset `warehouses` untuk member (DESIGN §39): transparansi blockchain tanpa kolom identitas owner (owner_user_id, on_chain_owner_wallet). Gate otorisasi: private.is_member(id). Tabel dasar tetap owner-only. Termasuk last_activity_at untuk banner inactivity.';

-- ----------------------------------------------------------------------------
-- 3. Tipe notifikasi baru (+2)
-- ----------------------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'join_requested', 'join_approved', 'join_rejected',
      'membership_role_changed', 'membership_removed', 'membership_left',
      'ownership_transferred',
      'adjustment_pending', 'adjustment_approved', 'adjustment_rejected',
      'proof_confirmed', 'proof_failed', 'proof_manual_review',
      'warehouse_inactivity_warning', 'warehouse_suspended'
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Helper: guard "warehouse suspended" (satu sumber pesan)
-- ----------------------------------------------------------------------------
create or replace function private.ensure_warehouse_active(p_warehouse_id uuid)
returns void
language plpgsql
security definer
set search_path to public
as $function$
begin
  if not exists (
    select 1 from public.warehouses where id = p_warehouse_id and status = 'active'
  ) then
    raise exception 'warehouse is suspended';
  end if;
end;
$function$;

revoke execute on function private.ensure_warehouse_active(uuid) from public;

-- ----------------------------------------------------------------------------
-- 5. Helper: notifikasi OWNER + MANAGER, sekali per dedup_key (SELAMANYA, juga
--    setelah read) — mencegah double-notify harian saat cron berjalan tiap
--    hari dan warehouse tetap di rentang yang sama. Mengembalikan jumlah yang
--    benar-benar di-insert.
-- ----------------------------------------------------------------------------
create or replace function private.notify_managers_once(
  p_warehouse_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb,
  p_dedup_key text default null
)
returns integer
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_recipient uuid;
  v_inserted integer := 0;
begin
  if p_dedup_key is null then
    return 0;
  end if;

  for v_recipient in
    select user_id
    from public.memberships
    where warehouse_id = p_warehouse_id
      and status = 'ACTIVE'
      and role in ('OWNER', 'MANAGER')
  loop
    begin
      insert into public.notifications (user_id, warehouse_id, type, title, body, payload, dedup_key)
      select v_recipient, p_warehouse_id, p_type, p_title, p_body, p_payload, p_dedup_key
      where not exists (
        select 1 from public.notifications n
        where n.user_id = v_recipient and n.dedup_key = p_dedup_key
      );
      if found then
        v_inserted := v_inserted + 1;
      end if;
    exception when others then
      -- Fail-safe: notifikasi TIDAK boleh membatalkan lifecycle.
      null;
    end;
  end loop;

  return v_inserted;
end;
$function$;

revoke execute on function private.notify_managers_once(uuid, text, text, text, jsonb, text) from public;

-- ----------------------------------------------------------------------------
-- 6. Sinkronisasi last_activity_at + guard suspended di RPC event
-- ----------------------------------------------------------------------------

-- 6.1 apply_stock_movement — guard + touch (movement apa pun = aktivitas nyata,
--     termasuk adjustment pending_approval).
create or replace function public.apply_stock_movement(p_warehouse_id uuid, p_product_id uuid, p_movement_type text, p_quantity numeric, p_expected_balance_version bigint, p_reason text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_reversal_of uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_actor_wallet text DEFAULT NULL::text, p_movement_id uuid DEFAULT NULL::uuid, p_proof_payload jsonb DEFAULT NULL::jsonb, p_proof_payload_hash text DEFAULT NULL::text)
 RETURNS TABLE(movement_id uuid, balance_version bigint, proof_pending boolean, error_code text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Warehouse suspended menolak SEMUA mutation (PRD §12 gap closure).
  if not exists (select 1 from public.warehouses where id = p_warehouse_id and status = 'active') then
    return query select null::uuid, null::bigint, false, 'FORBIDDEN', 'warehouse is suspended';
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

  -- Aktivitas nyata: reset counter inactivity (semua tipe, semua status).
  update public.warehouses
    set last_activity_at = now()
  where id = p_warehouse_id;

  -- Update saldo + version (hanya untuk tipe yang langsung committed).
  if p_movement_type in ('stock_in', 'stock_out', 'reversal') then
    update public.inventory_balances
      set quantity = v_new_qty,
          version = v_new_version,
          updated_at = now(),
          updated_by = v_user_id
    where id = v_balance.id;
  end if;

  -- Notifikasi: adjustment butuh approval → OWNER + MANAGER.
  if p_movement_type = 'adjustment' then
    perform private.notify_warehouse_managers(
      p_warehouse_id, 'adjustment_pending',
      'Penyesuaian butuh persetujuan',
      format('Penyesuaian %s (%s %s) menunggu persetujuan',
        coalesce(v_product.name, 'produk'), p_quantity, coalesce(v_product.unit, 'unit')),
      jsonb_build_object('warehouse_id', p_warehouse_id, 'movement_id', v_movement_id, 'product_id', p_product_id, 'quantity', p_quantity),
      'adjustment_pending:' || v_movement_id::text
    );
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
$function$;

-- 6.2 approve_join — guard + touch (member baru approved = aktivitas nyata).
create or replace function public.approve_join(p_request_id uuid, p_role text)
 RETURNS memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_request public.join_requests;
  v_actor_role text;
  v_membership public.memberships;
  v_actor_name text;
  v_wh_name text;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_request
  from public.join_requests
  where id = p_request_id;

  if v_request is null then
    raise exception 'join request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'join request not pending';
  end if;

  perform private.ensure_warehouse_active(v_request.warehouse_id);

  v_actor_role := private.member_role(v_request.warehouse_id, v_actor_id);

  if v_actor_role is null then
    raise exception 'not a member';
  end if;

  -- PRD §9.2 / AGENT.md §3: assign role WAJIB lewat canAssignRole.
  if not private.can_assign_role(v_actor_role, p_role) then
    raise exception 'insufficient role to assign %', p_role;
  end if;

  -- Role yang di-assign saat approve TIDAK boleh OWNER (owner via create
  -- warehouse / ownership transfer on-chain).
  if p_role = 'OWNER' then
    raise exception 'cannot assign OWNER via join request';
  end if;

  -- Transaksi: request → approved + membership ACTIVE (role sesuai matrix).
  update public.join_requests
    set status = 'approved', role = p_role, decided_by = v_actor_id, decided_at = now()
  where id = p_request_id;

  insert into public.memberships (warehouse_id, user_id, role, status, joined_at)
  values (v_request.warehouse_id, v_request.user_id, p_role, 'ACTIVE', now())
  on conflict (warehouse_id, user_id) do update set
    role = excluded.role,
    status = 'ACTIVE',
    joined_at = now(),
    updated_at = now()
  returning * into v_membership;

  -- Aktivitas nyata: member baru approved.
  update public.warehouses
    set last_activity_at = now()
  where id = v_request.warehouse_id;

  -- Notifikasi: requester.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_actor_name
  from public.users where id = v_actor_id;
  select name into v_wh_name from public.warehouses where id = v_request.warehouse_id;
  perform private.write_notification(
    v_request.user_id, v_request.warehouse_id, 'join_approved',
    'Permintaan join diterima',
    format('Kamu diterima di %s sebagai %s oleh %s', v_wh_name, p_role, v_actor_name),
    jsonb_build_object('warehouse_id', v_request.warehouse_id, 'role', p_role, 'membership_id', v_membership.id),
    'join_result:' || v_request.warehouse_id::text || ':' || v_request.user_id::text
  );

  return v_membership;
end;
$function$;

-- 6.3 reject_join — guard suspended.
create or replace function public.reject_join(p_request_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_request public.join_requests;
  v_actor_name text;
  v_wh_name text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_request
  from public.join_requests
  where id = p_request_id;

  if v_request is null then
    raise exception 'join request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'join request not pending';
  end if;

  perform private.ensure_warehouse_active(v_request.warehouse_id);

  -- Satu sumber kebenaran: can_manage_join_requests turun dari can_assign_role
  -- (bukan `has_role OWNER OR has_role MANAGER` seperti 0005). Konsisten dengan
  -- JOIN_REQUEST_APPROVE TS — drift matrix masa depan otomatis ketahuan via
  -- RBAC contract test, bukan menyimpang diam-diam.
  if not private.can_manage_join_requests(v_request.warehouse_id, v_user_id) then
    raise exception 'insufficient permission to reject';
  end if;

  update public.join_requests
    set status = 'rejected', decided_by = v_user_id, decided_at = now(),
        reason = coalesce(p_reason, reason)
  where id = p_request_id;

  -- Notifikasi: requester.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_actor_name
  from public.users where id = v_user_id;
  select name into v_wh_name from public.warehouses where id = v_request.warehouse_id;
  perform private.write_notification(
    v_request.user_id, v_request.warehouse_id, 'join_rejected',
    'Permintaan join ditolak',
    format('Permintaan bergabung ke %s ditolak oleh %s%s',
      v_wh_name, v_actor_name,
      case when coalesce(p_reason, '') <> '' then ': ' || p_reason else '' end),
    jsonb_build_object('warehouse_id', v_request.warehouse_id, 'reason', p_reason),
    'join_result:' || v_request.warehouse_id::text || ':' || v_request.user_id::text
  );
end;
$function$;

-- 6.4 update_member_role — guard suspended.
create or replace function public.update_member_role(p_warehouse_id uuid, p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target public.memberships;
  v_actor_name text;
  v_wh_name text;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'cannot change own role';
  end if;

  perform private.ensure_warehouse_active(p_warehouse_id);

  select * into v_target
  from public.memberships
  where warehouse_id = p_warehouse_id and user_id = p_user_id;

  if v_target is null then
    raise exception 'member not found';
  end if;

  if v_target.role = 'OWNER' then
    raise exception 'cannot change owner role';
  end if;

  v_actor_role := private.member_role(p_warehouse_id, v_actor_id);
  if v_actor_role is null then
    raise exception 'not a member';
  end if;

  if not private.can_assign_role(v_actor_role, p_role) then
    raise exception 'insufficient permission to assign %', p_role;
  end if;

  update public.memberships
    set role = p_role, updated_at = now()
  where id = v_target.id;

  -- Notifikasi: member yang perannya diubah.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_actor_name
  from public.users where id = v_actor_id;
  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  perform private.write_notification(
    p_user_id, p_warehouse_id, 'membership_role_changed',
    'Peran berubah',
    format('Peranmu di %s diubah menjadi %s oleh %s', v_wh_name, p_role, v_actor_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'role', p_role),
    'role_change:' || p_warehouse_id::text || ':' || p_user_id::text
  );
end;
$function$;

-- 6.5 remove_member — guard suspended.
create or replace function public.remove_member(p_warehouse_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target public.memberships;
  v_actor_name text;
  v_wh_name text;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'use leave_warehouse to leave';
  end if;

  perform private.ensure_warehouse_active(p_warehouse_id);

  select * into v_target
  from public.memberships
  where warehouse_id = p_warehouse_id and user_id = p_user_id;

  if v_target is null then
    raise exception 'member not found';
  end if;

  if v_target.role = 'OWNER' then
    raise exception 'cannot remove owner';
  end if;

  v_actor_role := private.member_role(p_warehouse_id, v_actor_id);
  if v_actor_role is null then
    raise exception 'not a member';
  end if;

  -- Remove = operasi assign-role terkait (PRD §9.2): wajib canAssignRole
  -- terhadap role target.
  if not private.can_assign_role(v_actor_role, v_target.role) then
    raise exception 'insufficient role to remove %', v_target.role;
  end if;

  delete from public.memberships
  where warehouse_id = p_warehouse_id and user_id = p_user_id;

  -- Bersihkan join request yang tersisa (pending ATAU approved) untuk
  -- konsistensi: user sudah bukan member, request lama tidak valid lagi.
  update public.join_requests
    set status = 'cancelled', updated_at = now()
  where warehouse_id = p_warehouse_id and user_id = p_user_id
    and status in ('pending', 'approved');

  -- Notifikasi: member yang di-remove (bukan pelaku).
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_actor_name
  from public.users where id = v_actor_id;
  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  perform private.write_notification(
    p_user_id, p_warehouse_id, 'membership_removed',
    'Kamu dihapus dari warehouse',
    format('Kamu dihapus dari %s oleh %s', v_wh_name, v_actor_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'removed_by', v_actor_id),
    'member_removed:' || p_warehouse_id::text || ':' || p_user_id::text
  );
end;
$function$;

-- 6.6 leave_warehouse — guard suspended.
create or replace function public.leave_warehouse(p_warehouse_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_membership public.memberships;
  v_leaver_name text;
  v_wh_name text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  perform private.ensure_warehouse_active(p_warehouse_id);

  select * into v_membership
  from public.memberships
  where warehouse_id = p_warehouse_id and user_id = v_user_id;

  if v_membership is null then
    raise exception 'not a member';
  end if;

  -- Owner tidak boleh leave sebelum transfer ownership (PRD §11, AGENT Invariant).
  if v_membership.role = 'OWNER' then
    raise exception 'owner cannot leave warehouse; transfer ownership first';
  end if;

  delete from public.memberships
  where warehouse_id = p_warehouse_id and user_id = v_user_id;

  -- Bersihkan join request yang tersisa (jika ada) untuk konsistensi.
  update public.join_requests
    set status = 'cancelled', updated_at = now()
  where warehouse_id = p_warehouse_id and user_id = v_user_id
    and status in ('pending', 'approved');

  -- Notifikasi: OWNER + MANAGER (tim berkurang).
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_leaver_name
  from public.users where id = v_user_id;
  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  perform private.notify_warehouse_managers(
    p_warehouse_id, 'membership_left',
    'Member keluar',
    format('%s keluar dari %s', v_leaver_name, v_wh_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'user_id', v_user_id),
    'member_left:' || p_warehouse_id::text || ':' || v_user_id::text
  );
end;
$function$;

-- 6.7 transfer_ownership — guard suspended.
create or replace function public.transfer_ownership(p_warehouse_id uuid, p_new_owner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target public.memberships;
  v_actor_name text;
  v_new_owner_name text;
  v_wh_name text;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  if p_new_owner_id = v_actor_id then
    raise exception 'already the owner';
  end if;

  perform private.ensure_warehouse_active(p_warehouse_id);

  v_actor_role := private.member_role(p_warehouse_id, v_actor_id);
  if v_actor_role <> 'OWNER' then
    raise exception 'only owner can transfer ownership';
  end if;

  select * into v_target
  from public.memberships
  where warehouse_id = p_warehouse_id and user_id = p_new_owner_id;

  if v_target is null then
    raise exception 'target is not a member';
  end if;

  if v_target.status <> 'ACTIVE' then
    raise exception 'target membership is not active';
  end if;

  update public.memberships
    set role = 'OWNER', updated_at = now()
  where id = v_target.id;

  update public.memberships
    set role = 'MANAGER', updated_at = now()
  where warehouse_id = p_warehouse_id and user_id = v_actor_id;

  -- Pemindahan owner_user_id = tulis identitas; buka GUC milik server flow
  -- agar guard `enforce_warehouse_identity_immutable` (0011) mengizinkannya.
  perform set_config('app.allow_identity_write', 'true', true);

  update public.warehouses
    set owner_user_id = p_new_owner_id
  where id = p_warehouse_id;

  -- Notifikasi: owner baru + owner lama.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_actor_name
  from public.users where id = v_actor_id;
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_new_owner_name
  from public.users where id = p_new_owner_id;
  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  perform private.write_notification(
    p_new_owner_id, p_warehouse_id, 'ownership_transferred',
    'Kepemilikan warehouse',
    format('Kamu kini pemilik %s (dialihkan oleh %s)', v_wh_name, v_actor_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'previous_owner', v_actor_id),
    'ownership:' || p_warehouse_id::text
  );
  perform private.write_notification(
    v_actor_id, p_warehouse_id, 'ownership_transferred',
    'Kepemilikan warehouse',
    format('Kepemilikan %s berpindah ke %s', v_wh_name, v_new_owner_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'new_owner', p_new_owner_id),
    'ownership:' || p_warehouse_id::text
  );
end;
$function$;

-- 6.8 approve_stock_adjustment — guard suspended.
create or replace function public.approve_stock_adjustment(p_movement_id uuid, p_proof_payload jsonb DEFAULT NULL::jsonb, p_proof_payload_hash text DEFAULT NULL::text)
 RETURNS stock_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_movement public.stock_movements;
  v_balance public.inventory_balances;
  v_new_qty numeric;
  v_wh_address text;
  v_proof_id uuid;
  v_approver_name text;
  v_wh_name text;
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

  perform private.ensure_warehouse_active(v_movement.warehouse_id);

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

  -- Notifikasi: pembuat adjustment.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_approver_name
  from public.users where id = v_user_id;
  select name into v_wh_name from public.warehouses where id = v_movement.warehouse_id;
  perform private.write_notification(
    v_movement.actor_user_id, v_movement.warehouse_id, 'adjustment_approved',
    'Penyesuaian disetujui',
    format('Penyesuaianmu di %s disetujui oleh %s', v_wh_name, v_approver_name),
    jsonb_build_object('warehouse_id', v_movement.warehouse_id, 'movement_id', p_movement_id),
    'adjustment_result:' || p_movement_id::text
  );

  return v_movement;
end;
$function$;

-- 6.9 reject_stock_adjustment — guard suspended.
create or replace function public.reject_stock_adjustment(p_movement_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_movement public.stock_movements;
  v_rejector_name text;
  v_wh_name text;
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

  perform private.ensure_warehouse_active(v_movement.warehouse_id);

  if private.member_role(v_movement.warehouse_id, v_user_id) not in ('MANAGER', 'OWNER') then
    raise exception 'insufficient permission';
  end if;

  update public.stock_movements
    set status = 'rejected', approved_by = v_user_id, approved_at = now(), reason = coalesce(p_reason, reason)
  where id = p_movement_id;

  -- Notifikasi: pembuat adjustment.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_rejector_name
  from public.users where id = v_user_id;
  select name into v_wh_name from public.warehouses where id = v_movement.warehouse_id;
  perform private.write_notification(
    v_movement.actor_user_id, v_movement.warehouse_id, 'adjustment_rejected',
    'Penyesuaian ditolak',
    format('Penyesuaianmu di %s ditolak oleh %s%s',
      v_wh_name, v_rejector_name,
      case when coalesce(p_reason, '') <> '' then ': ' || p_reason else '' end),
    jsonb_build_object('warehouse_id', v_movement.warehouse_id, 'movement_id', p_movement_id, 'reason', p_reason),
    'adjustment_result:' || p_movement_id::text
  );
end;
$function$;

-- 6.10 proof_set_confirmation — confirmed = aktivitas nyata.
create or replace function public.proof_set_confirmation(p_proof_id uuid, p_count integer, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wh uuid;
begin
  select warehouse_id into v_wh from public.proofs where id = p_proof_id;

  update public.proofs
    set confirmation_count = p_count, status = p_status, error = null, updated_at = now()
  where id = p_proof_id;

  perform private.write_audit(v_wh, null, 'proof_confirmation', 'proofs', p_proof_id::text,
    null, jsonb_build_object('confirmation_count', p_count, 'status', p_status), null, p_status);

  if p_status = 'confirmed' then
    -- Aktivitas nyata: transaksi on-chain berhasil dikonfirmasi.
    update public.warehouses
      set last_activity_at = now()
    where id = v_wh;

    perform private.notify_proof_event(
      p_proof_id, 'proof_confirmed',
      'Terkonfirmasi di blockchain',
      format('Movement {product} terkonfirmasi on-chain (%s konfirmasi)', p_count)
    );
  end if;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 7. RPC lifecycle harian (dipanggil cron TERPISAH dari keep-alive)
-- ----------------------------------------------------------------------------
-- Idempoten: panggil harian → warehouse di rentang sama tidak di-notify ulang
-- (dedup per-episode: kunci memuat last_activity_at, sehingga episode inaktivitas
-- berikutnya tetap mengirim lagi). Suspend dilakukan satu kali per warehouse
-- (status berubah → tidak lagi diproses).
create or replace function public.run_warehouse_lifecycle()
returns table (
  warehouse_id uuid,
  stage text,
  notified integer,
  suspended boolean
)
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_wh record;
  v_days integer;
  v_notified integer;
  v_suspended boolean;
begin
  for v_wh in
    select id, name, last_activity_at
    from public.warehouses
    where status = 'active'
      and last_activity_at <= now() - interval '23 days'
    order by last_activity_at asc
  loop
    v_days := floor(extract(epoch from (now() - v_wh.last_activity_at)) / 86400.0)::integer;
    v_notified := 0;
    v_suspended := false;

    if v_days >= 30 then
      update public.warehouses
        set status = 'suspended', suspended_at = now()
      where id = v_wh.id and status = 'active';

      if found then
        v_suspended := true;
      end if;

      v_notified := private.notify_managers_once(
        v_wh.id, 'warehouse_suspended',
        'Warehouse disuspend',
        format('Warehouse %s disuspend karena tidak ada aktivitas selama %s hari. Hubungi dukungan untuk mengaktifkannya kembali.', v_wh.name, v_days),
        jsonb_build_object('warehouse_id', v_wh.id, 'days_inactive', v_days),
        'inactivity:' || v_wh.id::text || ':suspended:' || v_wh.last_activity_at::text
      );

      return query select v_wh.id, 'suspended', v_notified, v_suspended;
    elsif v_days >= 27 then
      v_notified := private.notify_managers_once(
        v_wh.id, 'warehouse_inactivity_warning',
        'Warehouse akan disuspend',
        format('Warehouse %s akan disuspend dalam %s hari karena tidak ada aktivitas. Lakukan stock movement apa pun untuk menjaganya tetap aktif.', v_wh.name, 30 - v_days),
        jsonb_build_object('warehouse_id', v_wh.id, 'days_inactive', v_days, 'stage', 'critical'),
        'inactivity:' || v_wh.id::text || ':critical:' || v_wh.last_activity_at::text
      );
      return query select v_wh.id, 'critical', v_notified, false;
    elsif v_days >= 23 then
      v_notified := private.notify_managers_once(
        v_wh.id, 'warehouse_inactivity_warning',
        'Warehouse tidak aktif',
        format('Warehouse %s tidak ada aktivitas selama %s hari. Lakukan stock movement apa pun untuk menjaga warehouse tetap aktif.', v_wh.name, v_days),
        jsonb_build_object('warehouse_id', v_wh.id, 'days_inactive', v_days, 'stage', 'warning'),
        'inactivity:' || v_wh.id::text || ':warning:' || v_wh.last_activity_at::text
      );
      return query select v_wh.id, 'warning', v_notified, false;
    end if;
  end loop;
end;
$function$;

revoke execute on function public.run_warehouse_lifecycle() from public, anon, authenticated;
grant execute on function public.run_warehouse_lifecycle() to service_role;