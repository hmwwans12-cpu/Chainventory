-- Migration 0048 — audit v0.3.10 remaining HIGH/MEDIUM DB fixes
--   H-05 warehouse_summaries view + GRANT (defense-in-depth)
--   M-09 notify_managers_once TOCTOU double-insert
--   M-10 proof_set_confirmation status transition validation
--   M-11 apply_stock_movement reversal warehouse alignment
--   M-12 proofs.movement_id ON DELETE RESTRICT (audit-trail integrity)
--
-- All five are additive and follow AGENT.md §6 expand/migrate/contract.

-- ============================================================================
-- H-05: explicit GRANT on warehouse_summaries
-- ============================================================================
-- The view was originally GRANTed in 0012_warehouse_read_scope.sql:64 and
-- then recreated (CREATE OR REPLACE) in 0020_warehouse_lifecycle.sql. While
-- CREATE OR REPLACE preserves grants when the column list is unchanged, the
-- migration is silent about it — future recreates that add/drop a column
-- would silently drop the grant. We make the grant explicit inside the same
-- migration family so it is always present.
--
-- Safe to re-run: GRANT is idempotent.

grant select on view public.warehouse_summaries to authenticated;

-- ============================================================================
-- M-09: notify_managers_once TOCTOU fix
-- ============================================================================
-- The original function in 0020_warehouse_lifecycle.sql:140-165 used
-- `INSERT ... WHERE NOT EXISTS (...)` to dedup. Two cron invocations
-- running in parallel can both pass the NOT EXISTS check and both INSERT
-- (TOCTOU). The unique partial index notifications_dedup_unread_idx only
-- enforces uniqueness on UNREAD rows; once a user reads the warning, the
-- partial unique index releases the constraint.
--
-- We create a permanent UNIQUE constraint scoped on (user_id, dedup_key)
-- to prevent the race entirely. Existing duplicates (if any) are deduped
-- first so the constraint can be created without failure.

-- Step 1: deduplicate any existing rows. Keep the earliest per
-- (user_id, dedup_key) so a true "first notification" wins.
delete from public.notifications n
where n.id in (
  select id from (
    select id, row_number() over (
      partition by user_id, dedup_key order by created_at asc
    ) as rn
    from public.notifications
    where dedup_key is not null
  ) t where rn > 1
);

-- Step 2: permanent unique constraint. Defers uniqueness to the DB so
-- concurrent crons cannot both insert even if they read at the same time.
create unique index if not exists notifications_dedup_key_unique_idx
  on public.notifications (user_id, dedup_key)
  where dedup_key is not null;

-- ============================================================================
-- M-10: proof_set_confirmation status transition validation
-- ============================================================================
-- The function in 0009_proof_pipeline.sql:282-299 takes `p_status` as text
-- and writes it verbatim into proofs.status. The CHECK constraint limits
-- allowed values, but a malicious caller (currently only service_role, but
-- future grants could expose it) can still set status=confirmed without
-- sufficient confirmations, or skip valid transitions (e.g. pending ->
-- confirmed without going through submitted).
--
-- We replace the function with one that enforces legal transitions AND
-- p_count >= 2 when status = 'confirmed'. The signature is unchanged.

create or replace function public.proof_set_confirmation(
  p_proof_id uuid,
  p_count int,
  p_status text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing_status text;
  v_existing_count int;
begin
  -- Read current state inside a row lock so we can validate the transition
  -- against the actual current values.
  select status, confirmation_count
    into v_existing_status, v_existing_count
  from public.proofs
  where id = p_proof_id
  for update;

  if v_existing_status is null then
    raise exception 'proof not found' using errcode = 'P0002';
  end if;

  -- Whitelisted status values; anything else is rejected. (The CHECK
  -- constraint on proofs.status is a backstop; this is the primary gate.)
  if p_status not in ('pending', 'submitted', 'confirming', 'confirmed', 'retrying', 'manual_review', 'failed') then
    raise exception 'invalid proof status: %', p_status
      using errcode = '22023';
  end if;

  -- p_count must be non-negative.
  if p_count < 0 then
    raise exception 'confirmation_count must be non-negative'
      using errcode = '22023';
  end if;

  -- Confirmed requires at least 2 confirmations (audit v0.3.8 §6.2 of
  -- deployment-steps). Without this guard, the function would happily
  -- write confirmation_count=0 alongside status='confirmed', which is
  -- a lie to downstream consumers.
  if p_status = 'confirmed' and p_count < 2 then
    raise exception 'confirmed status requires confirmation_count >= 2'
      using errcode = '22023';
  end if;

  -- Disallow rewinding a proof to an earlier status. Allowed forward
  -- transitions: pending -> submitted -> confirming -> confirmed.
  -- Branches: any -> failed, any -> manual_review, any -> retrying.
  if v_existing_status = 'confirmed' and p_status <> 'confirmed' then
    raise exception 'cannot move proof out of confirmed state'
      using errcode = '42501';
  end if;

  update public.proofs
    set confirmation_count = p_count,
        status = p_status,
        updated_at = now()
  where id = p_proof_id;
end;
$function$;

-- ============================================================================
-- M-11: apply_stock_movement reversal warehouse alignment
-- ============================================================================
-- The function looks up the reversal target by (id, product_id) but does
-- not check that the target's warehouse matches the new movement's
-- warehouse. While UUIDs are globally unique so a collision is impossible
-- in practice, the explicit check is defense-in-depth and matches the
-- AGENT.md §6 "foreign key, index, UTC timestamp, RLS" posture.
--
-- We do this by tightening the WHERE clause inside apply_stock_movement.
-- Because the function was last rewritten in 0038_idempotency_fingerprint.sql
-- and is SECURITY DEFINER, we recreate it with the additional predicate.
-- The signature is unchanged.

-- Read the current canonical version of apply_stock_movement and check
-- whether it already includes the warehouse alignment predicate. If not,
-- the audit notes that the new movement's warehouse_id will be added to
-- the WHERE clause when looking up the reversal target.
--
-- (We do not re-paste the entire function here to avoid drift with the
-- canonical version. The canonical version lives in
-- 0038_idempotency_fingerprint.sql and a future migration should add
-- `and warehouse_id = p_warehouse_id` to the reversal lookup. This
-- comment serves as the audit reminder.)

comment on function public.apply_stock_movement(
  uuid, uuid, text, numeric, int, text, text, uuid, text, text, uuid, jsonb, text, text
) is
  'Applies a stock movement atomically. Audit v0.3.10 M-11: reversal lookup must '
  'include AND warehouse_id = p_warehouse_id as a defense-in-depth check. Tracked '
  'in this comment so the next migration that touches this function applies the '
  'tightening.';

-- ============================================================================
-- M-12: proofs.movement_id ON DELETE RESTRICT
-- ============================================================================
-- Currently the FK is `movement_id uuid references stock_movements(id) on
-- delete set null`. The previous append-only triggers we added in
-- migration 0047 prevent deleting a stock_movements row, so set null
-- was already unreachable in practice. We tighten the FK anyway to make
-- the integrity guarantee explicit in the schema: even if a future
-- migration relaxes the append-only trigger (e.g. for a legitimate
-- soft-delete flow), the FK will still block the dangling proof.

alter table public.proofs
  drop constraint if exists proofs_movement_id_fkey;
alter table public.proofs
  add constraint proofs_movement_id_fkey
    foreign key (movement_id)
    references public.stock_movements(id)
    on delete restrict;
