-- ============================================================================
-- Chainventory — 0059: pencarian di list_transactions (temuan audit #25)
-- ============================================================================
-- Masalah: halaman Transactions hanya bisa filter type/proof — tidak ada
-- cara mencari by reference/reason/wallet aktor/produk, padahal ledger
-- adalah tempat audit trail paling sering dicari (halaman Products sudah
-- punya search sejak lama).
--
-- Fix: param baru p_search (DEFAULT NULL → additive untuk caller lama,
-- DROP signature lama dulu mengikuti konvensi 0038 agar tidak terjadi
-- overload ganda). Filter ILIKE pada sm.reference / sm.reason /
-- sm.actor_wallet + pr.name / pr.sku, berlaku di count DAN rows agar
-- total pagination konsisten. Wildcard LIKE (% _ \) di-strip server-side
-- (cerminan escape client di halaman Products) sehingga search tidak bisa
-- menjadi wildcard liar.
--
-- Grants dipertahankan (revoke public + grant authenticated).
-- ============================================================================

DROP FUNCTION IF EXISTS public.list_transactions(uuid, text, text, integer, integer);

create or replace function public.list_transactions(
  p_warehouse_id uuid,
  p_movement_type text default null,
  p_proof_bucket text default null,
  p_page integer default 1,
  p_per_page integer default 20,
  p_search text default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_total bigint;
  v_rows jsonb;
  v_search text := null;
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

  if p_search is not null and btrim(p_search) <> '' then
    v_search := '%' || regexp_replace(btrim(p_search), '[%_\\]', '', 'g') || '%';
  end if;

  select count(*) into v_total
  from public.stock_movements sm
  join public.products pr on pr.id = sm.product_id
  where sm.warehouse_id = p_warehouse_id
    and (p_movement_type is null or sm.movement_type = p_movement_type)
    and (
      v_search is null
      or sm.reference ilike v_search
      or sm.reason ilike v_search
      or sm.actor_wallet ilike v_search
      or pr.name ilike v_search
      or pr.sku ilike v_search
    )
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
        v_search is null
        or sm.reference ilike v_search
        or sm.reason ilike v_search
        or sm.actor_wallet ilike v_search
        or pr.name ilike v_search
        or pr.sku ilike v_search
      )
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

comment on function public.list_transactions(uuid, text, text, integer, integer, text) is
  'Ledger operasi stock + status proof blockchain (filter deterministik per bucket), pencarian reference/reason/wallet/produk, pagination server-side, member-only.';

revoke all on function public.list_transactions(uuid, text, text, integer, integer, text) from public;
grant execute on function public.list_transactions(uuid, text, text, integer, integer, text) to authenticated;
