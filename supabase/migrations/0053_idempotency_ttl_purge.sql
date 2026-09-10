-- ============================================================================
-- Chainventory — 0053: idempotency TTL purge (audit Bagian B BE-21)
-- ============================================================================
-- PRD §32: idempotencyKey TTL 24 jam, unik per user/request scope. Realita:
-- unique constraint (warehouse_id, idempotency_key) berlaku SELAMANYA —
-- retry >24h dengan key sama dapat CONFLICT palsu dan tabel tumbuh tanpa
-- retensi. Partial unique index dengan predikat waktu tidak mungkin
-- (now() tidak IMMUTABLE, PostgreSQL menolak 42P17).
--
-- Fix: fungsi purge batched (short transaction, per Postgres best
-- practices lock-short-transactions) yang membebaskan key lebih tua dari
-- TTL dengan men-NULL-kan idempotency_key + request_fingerprint (CHECK
-- constraint stock_movements_fingerprint_required tetap terpenuhi karena
-- key NULL). Dipanggil terjadwal (cron internal / pg_cron bila tersedia).
-- Sampai scheduler di-wire, fungsi ini didokumentasikan sebagai follow-up
-- eksplisit — bukan cleanup diam-diam.
-- ============================================================================

create or replace function public.purge_expired_idempotency_keys(
  p_older_than interval default interval '24 hours',
  p_batch integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purged integer := 0;
begin
  if current_setting('role') != 'service_role' then
    raise exception 'purge_expired_idempotency_keys: service_role required'
      using errcode = 'insufficient_privilege';
  end if;

  if p_batch is null or p_batch < 1 or p_batch > 10000 then
    raise exception 'purge_expired_idempotency_keys: invalid batch size'
      using errcode = 'invalid_parameter_value';
  end if;

  with expired as (
    select id
    from public.stock_movements
    where idempotency_key is not null
      and created_at < now() - p_older_than
    order by created_at
    limit p_batch
    for update skip locked
  )
  update public.stock_movements sm
  set idempotency_key = null,
      request_fingerprint = null
  from expired
  where sm.id = expired.id;

  get diagnostics v_purged = row_count;
  return v_purged;
end;
$$;

comment on function public.purge_expired_idempotency_keys is
  'Bebaskan idempotency_key movement lebih tua dari TTL (default 24h, PRD §32). Batched + SKIP LOCKED agar aman dipanggil terjadwal.';

revoke execute on function public.purge_expired_idempotency_keys from public;
revoke execute on function public.purge_expired_idempotency_keys from authenticated;
revoke execute on function public.purge_expired_idempotency_keys from anon;
grant execute on function public.purge_expired_idempotency_keys to service_role;
