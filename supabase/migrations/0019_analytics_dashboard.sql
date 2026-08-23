-- ============================================================================
-- Chainventory — 0019: analytics_dashboard (agregasi server-side)
-- ============================================================================
-- Aliran ADDITIVE. Langkah 2 (Analytics): chart Stock In/Out (7/30/90 hari),
-- statistik periode, dan top products (PRD §24 / DESIGN §31-33) — semua
-- agregasi dilakukan DI SQL (bukan mengirim ribuan baris movement ke server),
-- dibungkus satu RPC definer dengan gate keanggotaan.
--
-- Gate otorisasi: `private.member_role(p_warehouse_id, auth.uid())`. Bukan
-- member → return NULL (bukan raise, agar UI bisa menangani sebagai "no data"
-- tanpa membocorkan keberadaan warehouse). Hanya `authenticated` yang boleh
-- EXECUTE; `revoke from public, anon` defense-in-depth seperti RPC lain.
--
-- Nilai numerik dikembalikan sebagai TEXT (string desimal) — konvensi app
-- (lihat movements-client.ts): tanpa float, presisi numerik terjaga, client
-- mengurai sendiri.
--
-- Window waktu: `v_start` = awal hari ini − (p_days − 1) hari (INCLUSIVE hari
-- ini); `previous` = p_days hari persis sebelum v_start. p_days dibatasi
-- {7, 30, 90} sesuai DESIGN §32.
-- ============================================================================

create or replace function public.analytics_dashboard(p_warehouse_id uuid, p_days integer)
returns jsonb
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_role text;
  v_start timestamptz := date_trunc('day', now()) - (p_days - 1) * interval '1 day';
  v_prev_start timestamptz := v_start - p_days * interval '1 day';
  v_result jsonb;
begin
  if p_days not in (7, 30, 90) then
    raise exception 'invalid range';
  end if;

  v_role := private.member_role(p_warehouse_id, auth.uid());
  if v_role is null then
    return null;
  end if;

  select jsonb_build_object(
    'total_products',
      (select count(*)::int from public.products where warehouse_id = p_warehouse_id),
    'total_stock',
      coalesce((select sum(quantity)::text from public.inventory_balances where warehouse_id = p_warehouse_id), '0'),
    'period',
      jsonb_build_object(
        'stock_in',
          coalesce((select sum(quantity)::text from public.stock_movements
            where warehouse_id = p_warehouse_id and status = 'committed'
              and movement_type = 'stock_in' and created_at >= v_start), '0'),
        'stock_out',
          coalesce((select sum(quantity)::text from public.stock_movements
            where warehouse_id = p_warehouse_id and status = 'committed'
              and movement_type = 'stock_out' and created_at >= v_start), '0')
      ),
    'previous',
      jsonb_build_object(
        'stock_in',
          coalesce((select sum(quantity)::text from public.stock_movements
            where warehouse_id = p_warehouse_id and status = 'committed'
              and movement_type = 'stock_in'
              and created_at >= v_prev_start and created_at < v_start), '0'),
        'stock_out',
          coalesce((select sum(quantity)::text from public.stock_movements
            where warehouse_id = p_warehouse_id and status = 'committed'
              and movement_type = 'stock_out'
              and created_at >= v_prev_start and created_at < v_start), '0')
      ),
    'daily',
      coalesce((
        select jsonb_agg(x)
        from (
          select jsonb_build_object(
            'day', d.day,
            'stock_in',  coalesce(sum(d.qty) filter (where d.movement_type = 'stock_in'),  0)::text,
            'stock_out', coalesce(sum(d.qty) filter (where d.movement_type = 'stock_out'), 0)::text
          ) as x
          from (
            select date_trunc('day', created_at)::date as day, movement_type, sum(quantity) as qty
            from public.stock_movements
            where warehouse_id = p_warehouse_id and status = 'committed'
              and movement_type in ('stock_in', 'stock_out')
              and created_at >= v_start
            group by 1, 2
          ) d
          group by d.day
          order by d.day
        ) x
      ), '[]'::jsonb),
    'top_products',
      coalesce((
        select jsonb_agg(x)
        from (
          select jsonb_build_object(
            'product_id', m.product_id,
            'name', coalesce(p.name, 'produk'),
            'sku', p.sku,
            'unit', coalesce(p.unit, 'unit'),
            'in_qty',  coalesce(sum(m.quantity) filter (where m.movement_type = 'stock_in'),  0)::text,
            'out_qty', coalesce(sum(m.quantity) filter (where m.movement_type = 'stock_out'), 0)::text
          ) as x
          from public.stock_movements m
          join public.products p on p.id = m.product_id
          where m.warehouse_id = p_warehouse_id and m.status = 'committed'
            and m.movement_type in ('stock_in', 'stock_out')
            and m.created_at >= v_start
          group by m.product_id, p.name, p.sku, p.unit
          order by (
            coalesce(sum(m.quantity) filter (where m.movement_type = 'stock_in'), 0)
            + coalesce(sum(m.quantity) filter (where m.movement_type = 'stock_out'), 0)
          ) desc
          limit 6
        ) x
      ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke execute on function public.analytics_dashboard(uuid, integer) from public, anon;
grant execute on function public.analytics_dashboard(uuid, integer) to authenticated;