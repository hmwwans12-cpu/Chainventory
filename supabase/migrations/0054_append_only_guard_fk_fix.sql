-- ============================================================================
-- Chainventory — 0054: append-only guard FK fix (audit Bagian B BE-23)
-- ============================================================================
-- Bug 0047: guard append-only (stock_movements/proofs/audit_logs) mencatat
-- pelanggaran via private.write_audit(coalesce(warehouse_id,
-- gen_random_uuid()), ...). UUID acak melanggar FK
-- audit_logs.warehouse_id → warehouses(id) (nullable, ON DELETE SET NULL)
-- sehingga error FK menutupi append_only_violation asli (42501) yang
-- seharusnya diterima caller.
--
-- Fix: teruskan warehouse_id apa adanya (nullable — faucet memakai NULL
-- untuk event platform-level, lihat 0022). Tidak ada perubahan logika
-- guard selain itu; trigger tidak di-drop ulang (CREATE OR REPLACE
-- function cukup, trigger sudah menunjuk nama function yang sama).
-- ============================================================================

create or replace function private.guard_stock_movements_append_only()
returns trigger
language plpgsql
as $function$
declare
  v_actor uuid := auth.uid();
  v_action text := tg_op;
begin
  -- DELETEs are always forbidden.
  if v_action = 'DELETE' then
    perform private.write_audit(
      old.warehouse_id,
      v_actor,
      'append_only_violation', 'stock_movements', coalesce(old.id::text, '?'),
      jsonb_build_object('op', 'DELETE', 'movement_type', old.movement_type),
      null, 'rejected'
    );
    raise exception 'stock_movements is append-only (DELETE forbidden)'
      using errcode = '42501';
  end if;

  -- UPDATEs: only the (status, approved_by, approved_at) triple is mutable
  -- during the pending_approval → committed/rejected transition.
  if v_action = 'UPDATE' then
    if old.status = 'pending_approval'
       and new.status in ('committed', 'rejected')
       and old.id = new.id
       and old.warehouse_id is not distinct from new.warehouse_id
       and old.product_id is not distinct from new.product_id
       and old.movement_type is not distinct from new.movement_type
       and old.quantity is not distinct from new.quantity
       and old.actor_user_id is not distinct from new.actor_user_id
       and old.payload_hash is not distinct from new.payload_hash
    then
      return new;
    end if;
    perform private.write_audit(
      coalesce(new.warehouse_id, old.warehouse_id),
      v_actor,
      'append_only_violation', 'stock_movements', coalesce(new.id::text, old.id::text, '?'),
      jsonb_build_object('op', 'UPDATE', 'old_status', old.status, 'new_status', new.status),
      null, 'rejected'
    );
    raise exception 'stock_movements is append-only (UPDATE forbidden except pending_approval transition)'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

create or replace function private.guard_proofs_append_only()
returns trigger
language plpgsql
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    perform private.write_audit(
      old.warehouse_id,
      v_actor,
      'append_only_violation', 'proofs', old.id::text,
      jsonb_build_object('op', 'DELETE', 'proof_status', old.status),
      null, 'rejected'
    );
    raise exception 'proofs is append-only (DELETE forbidden)'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if old.payload is not distinct from new.payload
       and old.payload_hash is not distinct from new.payload_hash
       and old.warehouse_address is not distinct from new.warehouse_address
       and old.movement_id is not distinct from new.movement_id
       and old.warehouse_id is not distinct from new.warehouse_id
    then
      return new;
    end if;
    perform private.write_audit(
      coalesce(new.warehouse_id, old.warehouse_id),
      v_actor,
      'append_only_violation', 'proofs', coalesce(new.id::text, old.id::text, '?'),
      jsonb_build_object('op', 'UPDATE', 'attempted_field_change', true),
      null, 'rejected'
    );
    raise exception 'proofs payload is immutable; only status fields are mutable'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

create or replace function private.guard_audit_logs_append_only()
returns trigger
language plpgsql
as $function$
begin
  -- Catatan: INSERT oleh write_audit di sini aman dari rekursi (trigger
  -- hanya untuk UPDATE/DELETE). warehouse_id diteruskan nullable agar tidak
  -- menutupi error asli dengan FK violation (bug 0047).
  perform private.write_audit(
    old.warehouse_id,
    auth.uid(),
    'append_only_violation', 'audit_logs', coalesce(old.id::text, '?'),
    jsonb_build_object('op', tg_op),
    null, 'rejected'
  );
  raise exception 'audit_logs is fully append-only'
    using errcode = '42501';
end;
$function$;
