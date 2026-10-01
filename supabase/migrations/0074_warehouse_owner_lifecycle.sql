-- ============================================================================
-- Chainventory — 0074: owner-initiated warehouse suspend/reactivate
-- ============================================================================
-- Warehouse yang di-suspend manual oleh owner membebaskan slot "satu
-- active per owner" (partial unique index 0003) sehingga owner bisa
-- deploy warehouse BARU (mis. pindah v1 treasury → v2 wallet-paid) tanpa
-- SQL mentah. Suspend via inaktivitas 30 hari tetap berjalan terpisah.
--
-- Pola trust-boundary (0061/0070): EXECUTE hanya service_role + param
-- p_actor_user_id eksplisit; route memanggil via service client. Owner
-- dicek di dalam via kolom owner_user_id agar callable service-only.
-- ============================================================================

create or replace function public.set_warehouse_status(
  p_warehouse_id uuid,
  p_status text,
  p_actor_user_id uuid
)
returns public.warehouses
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_warehouse public.warehouses;
  v_other_active uuid;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  -- Serialkan transisi per owner (pola 0066/0070): cegah race dua
  -- reactivate bersamaan yang lolos cek aktif-ganda lalu menabrak
  -- unique index dengan pesan constraint mentah.
  perform pg_catalog.pg_advisory_xact_lock(
    hashtextextended('wh-lifecycle:' || p_actor_user_id::text, 0)
  );

  if p_status is null or p_status not in ('active', 'suspended') then
    raise exception 'invalid status transition';
  end if;

  select *
    into v_warehouse
  from public.warehouses
  where id = p_warehouse_id
  for update;

  if v_warehouse.id is null then
    raise exception 'warehouse not found';
  end if;

  if v_warehouse.owner_user_id is distinct from p_actor_user_id then
    raise exception 'only owner can change warehouse status';
  end if;

  -- Idempoten: status sudah sama = kembalikan baris apa adanya.
  if v_warehouse.status = p_status then
    return v_warehouse;
  end if;

  if p_status = 'suspended' then
    update public.warehouses
    set status = 'suspended',
        suspended_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = p_warehouse_id
    returning * into v_warehouse;

    perform private.write_audit(
      p_warehouse_id, p_actor_user_id, 'warehouse_suspended', 'warehouses',
      p_warehouse_id::text,
      pg_catalog.jsonb_build_object('status', 'active'),
      pg_catalog.jsonb_build_object('status', 'suspended'),
      null, 'suspended'
    );
    return v_warehouse;
  end if;

  -- Reactivate: tolak bila owner sudah punya active lain (partial unique
  -- index akan menolak juga, tapi pesan mentah constraint membingungkan —
  -- cek dulu dengan pesan yang bisa dipetakan route).
  select id
    into v_other_active
  from public.warehouses
  where owner_user_id = p_actor_user_id
    and status = 'active'
    and id is distinct from p_warehouse_id
  limit 1;

  if v_other_active is not null then
    raise exception 'another active warehouse exists';
  end if;

  update public.warehouses
  set status = 'active',
      suspended_at = null,
      updated_at = pg_catalog.now()
  where id = p_warehouse_id
  returning * into v_warehouse;

  perform private.write_audit(
    p_warehouse_id, p_actor_user_id, 'warehouse_reactivated', 'warehouses',
    p_warehouse_id::text,
    pg_catalog.jsonb_build_object('status', 'suspended'),
    pg_catalog.jsonb_build_object('status', 'active'),
    null, 'active'
  );
  return v_warehouse;
end;
$function$;

comment on function public.set_warehouse_status(uuid, text, uuid) is
  'Suspend/reactivate warehouse oleh owner (self-service; audit tercatat). EXECUTE hanya service_role; route gate owner + rate-limit.';

revoke all on function public.set_warehouse_status(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.set_warehouse_status(uuid, text, uuid) to service_role;
