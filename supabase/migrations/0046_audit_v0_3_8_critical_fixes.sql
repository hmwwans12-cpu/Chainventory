-- Migration 0046 — audit v0.3.8 critical fixes
--   1) Self-approval guard on approve_stock_adjustment (audit C-01)
--   2) GRANT SELECT on proofs/audit_logs/notifications/invitations (audit C-02)
--
-- Both are additive, follow the expand→contract pattern from AGENT.md §6.

-- ============================================================================
-- 1. Self-approval guard (audit C-01)
-- ============================================================================
-- AGENT.md §3 requires "Adjustment/Reversal memerlukan approval Owner/Manager
-- sebelum committed." Without a separation-of-duties check, a MANAGER can both
-- create and approve their own adjustment, turning the approval gate into a
-- unilateral write. We enforce approver ≠ actor at the DB layer.
--
-- We do this by replacing the existing function with an extended version that
-- raises a dedicated exception when actor == approver. The expanded signature
-- is identical to the original so no caller breaks.

create or replace function public.approve_stock_adjustment(
  p_movement_id uuid,
  p_proof_payload jsonb default null::jsonb,
  p_proof_payload_hash text default null::text
)
 returns stock_movements
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- Audit v0.3.8 C-01: separation of duties. Approver must not be the actor
  -- who created the adjustment. Without this guard, a MANAGER could both
  -- create and approve their own adjustment, bypassing review.
  if v_movement.actor_user_id is not null
     and v_movement.actor_user_id = v_user_id then
    raise exception 'self_approval_forbidden'
      using errcode = '42501',
            hint = 'A different Owner/Manager must approve this adjustment.';
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

-- ============================================================================
-- 2. GRANT SELECT to authenticated (audit C-02)
-- ============================================================================
-- RLS policies already exist on these tables but PostgREST cannot return any
-- row until the role has table-level SELECT privilege. This was silently
-- broken in earlier migrations:
--   - proofs:        blockchain explorer page empty
--   - audit_logs:    audit log viewer empty for OWNER/MANAGER
--   - notifications: notifications bell + center empty
--   - invitations:   manager invitations list empty
--
-- proof_outbox intentionally NOT granted (server-only by design).

grant select on table public.proofs         to authenticated;
grant select on table public.audit_logs     to authenticated;
grant select on table public.notifications  to authenticated;
grant select on table public.invitations    to authenticated;
