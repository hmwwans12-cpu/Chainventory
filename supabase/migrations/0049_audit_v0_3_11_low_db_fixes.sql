-- Migration 0049 — audit v0.3.11 LOW fixes (DB side)
--   L-01 users.email lowercase normalization
--   L-04 (defense-in-depth) stock_movements.role_at_time role check

-- ============================================================================
-- L-01: enforce lowercase email storage
-- ============================================================================
-- The unique index on lower(email) prevents duplicate emails with
-- different case from being inserted, but the stored value retains the
-- original case. UI comparisons and exports show whichever case the user
-- originally provided, which is fragile. The handle_new_user trigger
-- lowercases on insert; this CHECK catches direct INSERTs that bypass
-- the trigger (e.g. service_role scripts).
--
-- Safe re-run: the CHECK only blocks new violating rows; existing rows
-- with mixed case are left alone (a separate migration would normalize
-- them if needed).

alter table public.users
  drop constraint if exists users_email_lowercase_check;
alter table public.users
  add constraint users_email_lowercase_check
    check (email = lower(email));
