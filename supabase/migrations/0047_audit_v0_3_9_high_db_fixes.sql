-- Migration 0047 — audit v0.3.9 HIGH findings (database)
--   H-01 proofs.payload_hash UNIQUE → per-warehouse index
--   H-02 append-only enforcement on stock_movements/proofs/audit_logs
--   H-03 wallets CHECK constraints (verified_at consistency + address format)
--   H-04 role text CHECKs → membership_role ENUM type
--
-- All four are additive, follow the expand→contract pattern from AGENT.md §6,
-- and never modify the on-disk shape of existing rows.

-- ============================================================================
-- H-01: per-warehouse uniqueness for proofs.payload_hash
-- ============================================================================
-- The original migration 0009 added a global UNIQUE on proofs.payload_hash.
-- That blocks legitimate re-submissions of two different movements whose
-- canonical fields happen to collide (rare but possible, especially for
-- 'adjustment' movements with the same actor/product/qty). We also need
-- proof_manual_retry to remain free to insert after a delete.
--
-- Per AGENT.md §5 "Proof contract harus idempotent pada proofId" — uniqueness
-- should be scoped to (warehouse_id, payload_hash) so different warehouses
-- can have the same canonical fields without colliding.

alter table public.proofs drop constraint if exists proofs_payload_hash_unique;
create unique index if not exists proofs_warehouse_hash_unique_idx
  on public.proofs (warehouse_id, payload_hash);

-- ============================================================================
-- H-02: append-only triggers for the ledger
-- ============================================================================
-- AGENT.md §2: "Movement, proof, dan audit log append-only; koreksi memakai
-- adjustment/reversal, bukan edit/delete." The previous design enforced this
-- only by application convention. We add a DB-level guard that writes a
-- 'append_only_violation' audit_log row and raises an exception on any
-- UPDATE/DELETE that is not one of the explicitly whitelisted transitions
-- (status pending_approval → committed/rejected on stock_movements; proof
-- status updates by the service_role; etc.).
--
-- The whitelist is intentionally narrow: any new transition must be added
-- here explicitly, forcing a review.

-- ----------------------------------------------------------------------------
-- stock_movements: forbid UPDATE/DELETE on canonical fields. Only the
-- status transition pending_approval → committed/rejected is allowed
-- (by approve_stock_adjustment / reject_stock_adjustment, which both run
-- as SECURITY DEFINER with elevated privileges).
-- ----------------------------------------------------------------------------
create or replace function private.guard_stock_movements_append_only()
returns trigger
language plpgsql
as $function$
declare
  v_actor uuid := auth.uid();
  v_wh_id uuid;
  v_action text := tg_op;
begin
  -- DELETEs are always forbidden.
  if v_action = 'DELETE' then
    perform private.write_audit(
      coalesce(old.warehouse_id, gen_random_uuid()),
      v_actor,
      'append_only_violation', 'stock_movements', coalesce(old.id::text, '?'),
      jsonb_build_object('op', 'DELETE', 'movement_type', old.movement_type),
      null, 'rejected'
    );
    raise exception 'stock_movements is append-only (DELETE forbidden)'
      using errcode = '42501';
  end if;

  -- UPDATEs: only the (status, approved_by, approved_at) triple is mutable
  -- during the pending_approval → committed/rejected transition. Any other
  -- change (especially to quantity/movement_type/payload_hash) is rejected.
  if v_action = 'UPDATE' then
    -- the only allowed transition moves status from pending_approval to
    -- committed or rejected; approved_by/approved_at may be set in the
    -- same statement.
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
      coalesce(new.warehouse_id, old.warehouse_id, gen_random_uuid()),
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

drop trigger if exists stock_movements_append_only_trg on public.stock_movements;
create trigger stock_movements_append_only_trg
  before update or delete on public.stock_movements
  for each row execute function private.guard_stock_movements_append_only();

-- ----------------------------------------------------------------------------
-- proofs: forbid UPDATE on payload, payload_hash, warehouse_address,
-- movement_id (immutable per AGENT.md §5). Only status/tx_hash/confirmation
-- fields are mutable (driven by the proof processor / confirmation job).
-- ----------------------------------------------------------------------------
create or replace function private.guard_proofs_append_only()
returns trigger
language plpgsql
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    perform private.write_audit(
      coalesce(old.warehouse_id, gen_random_uuid()),
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
      coalesce(new.warehouse_id, old.warehouse_id, gen_random_uuid()),
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

drop trigger if exists proofs_append_only_trg on public.proofs;
create trigger proofs_append_only_trg
  before update or delete on public.proofs
  for each row execute function private.guard_proofs_append_only();

-- ----------------------------------------------------------------------------
-- audit_logs: fully append-only (no UPDATE, no DELETE ever).
-- ----------------------------------------------------------------------------
create or replace function private.guard_audit_logs_append_only()
returns trigger
language plpgsql
as $function$
begin
  perform private.write_audit(
    coalesce(old.warehouse_id, gen_random_uuid()),
    auth.uid(),
    'append_only_violation', 'audit_logs', coalesce(old.id::text, '?'),
    jsonb_build_object('op', tg_op),
    null, 'rejected'
  );
  raise exception 'audit_logs is fully append-only'
    using errcode = '42501';
end;
$function$;

drop trigger if exists audit_logs_append_only_trg on public.audit_logs;
create trigger audit_logs_append_only_trg
  before update or delete on public.audit_logs
  for each row execute function private.guard_audit_logs_append_only();

-- ============================================================================
-- H-03: wallets CHECK constraints
-- ============================================================================
-- 1) verified_at must be set iff verification_state = 'verified'
-- 2) address must look like a 0x-prefixed 40-hex-character EVM address
--    (loose check; the app also verifies the checksum signature)

alter table public.wallets
  drop constraint if exists wallets_verified_at_consistency;
alter table public.wallets
  add constraint wallets_verified_at_consistency
    check ((verification_state = 'verified') = (verified_at is not null));

alter table public.wallets
  drop constraint if exists wallets_address_format;
alter table public.wallets
  add constraint wallets_address_format
    check (address ~ '^0x[0-9a-fA-F]{40}$');

-- ============================================================================
-- H-04: membership_role ENUM type (scaffolding only)
-- ============================================================================
-- The role string literal 'OWNER' / 'MANAGER' / 'STAFF' / 'AUDITOR' / 'VIEWER'
-- appears in four parallel CHECK constraints (memberships, join_requests,
-- stock_movements.role_at_time, plus the memberships.status column). Drift
-- risk: a future role added in one place is forgotten in another.
--
-- This migration is intentionally scoped to creating the ENUM type only;
-- applying it to existing text columns requires per-table expand/migrate/
-- contract work (see AGENT.md §6) because Postgres will refuse to cast
-- a column with a CHECK constraint to an ENUM unless the CHECK is dropped
-- first. That work belongs in a dedicated follow-up migration so it can
-- be rolled out incrementally without breaking live reads.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'membership_role') then
    create type public.membership_role as enum (
      'OWNER', 'MANAGER', 'STAFF', 'AUDITOR', 'VIEWER'
    );
  end if;
end $$;

comment on type public.membership_role is
  'Canonical warehouse role enum. Use this ENUM in new tables and validators; '
  'a follow-up migration will migrate existing text columns from the parallel '
  'CHECK constraints (memberships.role, join_requests.requested_role, '
  'stock_movements.role_at_time) to use this type.';
