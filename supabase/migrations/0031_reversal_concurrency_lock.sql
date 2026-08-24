-- ============================================================================
-- Chainventory - 0031: reversal concurrency lock (audit P0-01)
-- ============================================================================
-- FIX P0-01: FOR UPDATE pada original movement row sebelum menghitung
-- cumulative reversal. Mencegah dua request konkuren membaca
-- v_reversed_total = 0 secara bersamaan dan keduanya lolos guard.
-- ADDITIVE: create or replace, signature tidak berubah.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_stock_movement(p_warehouse_id uuid, p_product_id uuid, p_movement_type text, p_quantity numeric, p_expected_balance_version bigint, p_reason text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_reversal_of uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_actor_wallet text DEFAULT NULL::text, p_movement_id uuid DEFAULT NULL::uuid, p_proof_payload jsonb DEFAULT NULL::jsonb, p_proof_payload_hash text DEFAULT NULL::text)
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
  v_original_type text;
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
  -- C-01 (audit 2026-08-24): RPC dapat dipanggil langsung oleh user
  -- authenticated; validator API bukan lapisan yang cukup.
  if p_quantity is null or p_quantity <= 0 then
    return query select null::uuid, null::bigint, false, 'INVALID_INPUT',
           'quantity must be greater than zero';
    return;
  end if;

  -- Warehouse suspended menolak SEMUA mutation (PRD ├ö├Â┬╝Ôö¼Ôòæ12 gap closure).
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
  -- H-01: produk ARCHIVED tidak menerima movement baru.
  select * into v_product
  from public.products
  where id = p_product_id and warehouse_id = p_warehouse_id
    and status = 'active';

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
    select movement_type into v_original_type
      from public.stock_movements
     where id = p_reversal_of and product_id = p_product_id
       and status = 'committed';

    if v_original_type is null or v_original_type not in ('stock_in', 'stock_out') then
      return query select null::uuid, null::bigint, false, 'INVALID_REVERSAL',
             'reversal target must be a committed stock_in or stock_out movement';
      return;
    end if;

    select quantity into v_original_qty
    from public.stock_movements
    where id = p_reversal_of
    for update;

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

  -- Balance row lock (SELECT ... FOR UPDATE) Ôö£├ÂÔö£├ºÔö£├é hanya untuk tipe yang langsung
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
      -- FIX C-02: arah dari tipe movement ASAL.
      select movement_type into v_original_type
        from public.stock_movements
       where id = p_reversal_of;

      if v_original_type = 'stock_out' then
        -- Membatalkan pengeluaran -> stok kembali bertambah.
        v_new_qty := v_new_qty + p_quantity;
      else
        -- Membatalkan pemasukan -> kurangi; saldo tidak boleh negatif.
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

  -- Notifikasi: adjustment butuh approval Ôö£├ÂÔö£├æÔö£├Ñ OWNER + MANAGER.
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
  -- Adjustment Ôö£├ÂÔö£├æÔö£├Ñ proof dibuat saat approve (movement belum committed).
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
$function$
