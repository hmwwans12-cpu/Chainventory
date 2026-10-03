-- ============================================================================
-- Chainventory — 0076: digest low-stock harian (notifikasi OWNER+MANAGER)
-- ============================================================================
-- Ambang `low_stock_threshold` dan panel preferensi notifikasi sudah ada,
-- tapi tidak ada yang MEMICU notifikasi stok rendah. RPC ini dipanggil
-- sekali sehari dari cron lifecycle yang sama (`0 5 * * *`, TANPA cron
-- baru — limit Hobby) via `digestLowStock()` (lib/warehouses/lifecycle).
--
-- Dedup: `dedup_key = low-stock:<product_id>` — bila notif sebelumnya
-- belum dibaca, write_notification menaikkan `times` (tidak spam); bila
-- sudah dibaca, notif baru dibuat (digest harian wajar). Produk yang
-- kembali di atas ambang tidak disentuh (notif lama tetap, user yang
-- menutupnya). Cap 200 produk/run agar cron ringan.
-- ============================================================================

create or replace function public.digest_low_stock()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select p.id as product_id,
           p.warehouse_id as warehouse_id,
           p.name as product_name,
           p.sku as product_sku,
           b.quantity as quantity,
           p.low_stock_threshold as threshold
    from public.products as p
    join public.inventory_balances as b
      on b.product_id = p.id
     and b.warehouse_id = p.warehouse_id
    join public.warehouses as w
      on w.id = p.warehouse_id
    where p.status = 'active'
      and w.status = 'active'
      and p.low_stock_threshold is not null
      and p.low_stock_threshold > 0
      and b.quantity < p.low_stock_threshold
    order by p.warehouse_id, p.name
    limit 200
  loop
    perform private.notify_warehouse_managers(
      r.warehouse_id,
      'low_stock',
      'Stok rendah: ' || r.product_name,
      r.product_sku || ' tersisa ' || trim_scale(r.quantity)::text ||
        ' (ambang ' || trim_scale(r.threshold)::text || ')',
      pg_catalog.jsonb_build_object(
        'product_id', r.product_id,
        'warehouse_id', r.warehouse_id,
        'quantity', r.quantity,
        'threshold', r.threshold
      ),
      'low-stock:' || r.product_id::text
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

-- Tipe notifikasi baru: CHECK inline 0017 (notifications_type_check) tidak
-- mengenalnya — tanpa ALTER ini insert DITOLAK diam-diam oleh savepoint
-- write_notification (digest jalan tapi tidak pernah notif!). Ditemukan
-- saat audit silang skema↔kode.
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'join_requested', 'join_approved', 'join_rejected',
      'membership_role_changed', 'membership_removed', 'membership_left',
      'ownership_transferred',
      'adjustment_pending', 'adjustment_approved', 'adjustment_rejected',
      'proof_confirmed', 'proof_failed', 'proof_manual_review',
      'warehouse_inactivity_warning', 'warehouse_suspended',
      'low_stock'
    )
  );

comment on function public.digest_low_stock() is
  'Digest harian produk di bawah ambang: notifikasi OWNER+MANAGER per produk (dedup low-stock:<product_id>). Dipanggil cron lifecycle; EXECUTE hanya service_role.';

revoke all on function public.digest_low_stock() from public, anon, authenticated;
grant execute on function public.digest_low_stock() to service_role;
