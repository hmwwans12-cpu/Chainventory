-- ============================================================================
-- Chainventory — 0077: arsip audit_logs + notifications lawas
-- ============================================================================
-- audit_logs/notifications append-only dan tumbuh selamanya (purge hanya
-- ada untuk idempotency keys, 0053). Fungsi ini MEMINDAHKAN (bukan hapus)
-- baris >180 hari ke skema `archive` — riwayat tetap bisa diaudit, tabel
-- panas tetap ramping untuk vacuum/query harian.
--
-- Batasan jujur: SATU panggilan = SATU transaksi pendek (maks p_batch
-- baris). Backlog besar terkuras progresif oleh cron harian, bukan
-- sekaligus (menghindari lock lama di produksi). proofs TIDAK diarsipkan:
-- di-join live oleh UI ledger (proofStatus per movement).
-- ============================================================================

create schema if not exists archive;

create table if not exists archive.audit_logs (
  like public.audit_logs including defaults
);

create table if not exists archive.notifications (
  like public.notifications including defaults
);

-- Join DELETE ... USING archive butuh lookup id cepat seiring arsip tumbuh.
create unique index if not exists archive_audit_logs_id_idx
  on archive.audit_logs (id);
create unique index if not exists archive_notifications_id_idx
  on archive.notifications (id);

alter table archive.audit_logs enable row level security;
alter table archive.notifications enable row level security;

create or replace function public.archive_old_logs(
  p_days integer default 180,
  p_batch integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_moved integer := 0;
  v_step integer;
  v_cutoff timestamptz := pg_catalog.now() - make_interval(days => greatest(p_days, 30));
  v_batch integer := least(greatest(coalesce(p_batch, 1000), 1), 10000);
begin
  -- Guard idempotensi: tanpa ini, re-run menumpuk duplikat di arsip
  -- (archive TANPA unique constraint dari LIKE).
  insert into archive.audit_logs
  select src.*
  from (
    select *
    from public.audit_logs
    where created_at < v_cutoff
    order by created_at asc
    limit v_batch
  ) as src
  where not exists (
    select 1 from archive.audit_logs as a where a.id = src.id
  );

  delete from public.audit_logs as target
  using archive.audit_logs as archived
  where target.id = archived.id
    and target.created_at < v_cutoff;

  get diagnostics v_step = row_count;
  v_moved := v_moved + v_step;

  insert into archive.notifications
  select src.*
  from (
    select *
    from public.notifications
    where created_at < v_cutoff
    order by created_at asc
    limit v_batch
  ) as src
  where not exists (
    select 1 from archive.notifications as a where a.id = src.id
  );

  delete from public.notifications as target
  using archive.notifications as archived
  where target.id = archived.id
    and target.created_at < v_cutoff;

  get diagnostics v_step = row_count;
  v_moved := v_moved + v_step;

  return v_moved;
end;
$function$;

comment on function public.archive_old_logs(integer, integer) is
  'Arsip audit_logs + notifications >180 hari ke skema archive (maks p_batch per panggilan; backlog terkuras progresif via cron). EXECUTE hanya service_role.';

revoke all on function public.archive_old_logs(integer, integer) from public, anon, authenticated;
grant execute on function public.archive_old_logs(integer, integer) to service_role;
