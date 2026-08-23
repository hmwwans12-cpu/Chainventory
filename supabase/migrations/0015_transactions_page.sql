-- ============================================================================
-- Chainventory â€” 0015: transactions page (ledger list + proof filter RPC)
-- ============================================================================
-- Aliran ADDITIVE. Halaman Transactions (PRD Â§14) memfilter operasi stock
-- berdasarkan STATUS PROOF blockchain (confirmed / pending / failed).
--
-- Pengamatan penting: filter pada embedded resource PostgREST
-- (`stock_movements?proofs.status=in.(...)`) TIDAK stabil â€” begitu ada baris
-- parent TANPA embedded row, filter ter-abaikan dan seluruh parent ikut
-- ter-return (behavior left-join PostgREST). Karena filter proof adalah inti
-- halaman ini, dipilih RPC security-definer deterministik:
--
--   public.list_transactions(warehouse_id, movement_type, proof_bucket, page, per_page)
--
--   - otorisasi: caller harus member ACTIVE warehouse (private.member_role)
--   - filter type: sm.movement_type = p_movement_type
--   - filter proof (scalar EXISTS, deterministik, saling eksklusif):
--       confirmed â†’ ada proof status 'confirmed'
--       pending   â†’ TIDAK ada proof 'confirmed' DAN tidak ada proof failed
--                   (belum on-chain: belum ada proof / pending/submitted/
--                   confirming/retrying)
--       failed    â†’ ada proof 'failed' / 'manual_review'
--   Urutan prioritas: confirmed menang atas failed (retryâ†’confirmed).
--   - pagination server-side + count exact dalam satu round-trip
--   - product di-join langsung (bukan embed FK), proof terbaru per movement
-- ============================================================================

create or replace function public.list_transactions(
  p_warehouse_id uuid,
  p_movement_type text default null,
  p_proof_bucket text default null,
  p_page integer default 1,
  p_per_page integer default 20
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_total bigint;
  v_rows jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if private.member_role(p_warehouse_id, v_uid) is null then
    raise exception 'not a member';
  end if;

  if p_proof_bucket is not null and p_proof_bucket not in ('confirmed', 'pending', 'failed') then
    raise exception 'invalid proof bucket: %', p_proof_bucket;
  end if;

  select count(*) into v_total
  from public.stock_movements sm
  where sm.warehouse_id = p_warehouse_id
    and (p_movement_type is null or sm.movement_type = p_movement_type)
    and (
      p_proof_bucket is null
      or (p_proof_bucket = 'confirmed'
          and exists (
            select 1 from public.proofs p
            where p.movement_id = sm.id and p.status = 'confirmed'
          ))
      or (p_proof_bucket = 'pending'
          and not exists (
            select 1 from public.proofs p
            where p.movement_id = sm.id and p.status = 'confirmed'
          )
          and not exists (
            select 1 from public.proofs p
            where p.movement_id = sm.id and p.status in ('failed', 'manual_review')
          ))
      or (p_proof_bucket = 'failed'
          and exists (
            select 1 from public.proofs p
            where p.movement_id = sm.id and p.status in ('failed', 'manual_review')
          ))
    );

  select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) into v_rows
  from (
    select
      sm.id,
      sm.movement_type,
      trim_scale(sm.quantity)::text as quantity,
      sm.status,
      sm.reason,
      sm.reference,
      sm.actor_wallet,
      sm.expected_balance_version,
      sm.created_at,
      jsonb_build_object('id', pr.id, 'name', pr.name, 'sku', pr.sku, 'unit', pr.unit) as product,
      case
        when pp.id is null then null
        else jsonb_build_object('id', pp.id, 'status', pp.status, 'tx_hash', pp.tx_hash, 'error', pp.error)
      end as proof
    from public.stock_movements sm
    join public.products pr on pr.id = sm.product_id
    left join lateral (
      select p.* from public.proofs p
      where p.movement_id = sm.id
      order by p.created_at desc
      limit 1
    ) pp on true
    where sm.warehouse_id = p_warehouse_id
      and (p_movement_type is null or sm.movement_type = p_movement_type)
      and (
        p_proof_bucket is null
        or (p_proof_bucket = 'confirmed'
            and exists (
              select 1 from public.proofs p2
              where p2.movement_id = sm.id and p2.status = 'confirmed'
            ))
        or (p_proof_bucket = 'pending'
            and not exists (
              select 1 from public.proofs p2
              where p2.movement_id = sm.id and p2.status = 'confirmed'
            )
            and not exists (
              select 1 from public.proofs p2
              where p2.movement_id = sm.id and p2.status in ('failed', 'manual_review')
            ))
        or (p_proof_bucket = 'failed'
            and exists (
              select 1 from public.proofs p2
              where p2.movement_id = sm.id and p2.status in ('failed', 'manual_review')
            ))
      )
    order by sm.created_at desc
    limit p_per_page offset (p_page - 1) * p_per_page
  ) t;

  return json_build_object('total', v_total, 'rows', v_rows);
end;
$$;

comment on function public.list_transactions(uuid, text, text, integer, integer) is
  'Ledger operasi stock + status proof blockchain (filter deterministik per bucket), pagination server-side, member-only.';

revoke all on function public.list_transactions(uuid, text, text, integer, integer) from public;
grant execute on function public.list_transactions(uuid, text, text, integer, integer) to authenticated;