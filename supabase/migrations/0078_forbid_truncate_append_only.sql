-- ============================================================================
-- Chainventory — 0078: larang TRUNCATE pada tabel append-only (temuan M-2)
-- ============================================================================
-- Trigger append-only (0047/0054/0065) adalah BEFORE UPDATE OR DELETE
-- FOR EACH ROW — Postgres TIDAK pernah menjalankannya saat TRUNCATE
-- (TRUNCATE hanya menyalakan trigger statement-level BEFORE TRUNCATE).
-- Tanpa ini, TRUNCATE mengosongkan stock_movements/proofs/audit_logs
-- tanpa jejak dan tanpa error.
--
-- Satu fungsi bersama (TG_TABLE_NAME) + 1 trigger BEFORE TRUNCATE
-- FOR EACH STATEMENT per tabel. raise exception errcode 42501, konsisten
-- dengan guard append-only yang ada.
--
-- TULIS SAJA, JANGAN DI-APPLY OTOMATIS. Owner apply manual di staging:
--   supabase db push --linked   (setelah review; lihat WORKFLOW.md §4)
-- ============================================================================

create or replace function private.forbid_truncate_append_only()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception '% is append-only (TRUNCATE forbidden)', TG_TABLE_NAME
    using errcode = '42501';
  return null; -- unreachable (hanya agar tipe trigger terpenuhi)
end;
$function$;

drop trigger if exists stock_movements_forbid_truncate_trg
  on public.stock_movements;
create trigger stock_movements_forbid_truncate_trg
  before truncate on public.stock_movements
  for each statement execute function private.forbid_truncate_append_only();

drop trigger if exists proofs_forbid_truncate_trg
  on public.proofs;
create trigger proofs_forbid_truncate_trg
  before truncate on public.proofs
  for each statement execute function private.forbid_truncate_append_only();

drop trigger if exists audit_logs_forbid_truncate_trg
  on public.audit_logs;
create trigger audit_logs_forbid_truncate_trg
  before truncate on public.audit_logs
  for each statement execute function private.forbid_truncate_append_only();
