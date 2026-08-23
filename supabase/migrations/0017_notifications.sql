-- ============================================================================
-- Chainventory — 0017: notifications (bell + center) + fix publikasi Realtime
-- ============================================================================
-- Aliran ADDITIVE. PRD §21 / DESIGN §15: notifikasi per-penerima, dedup
-- (user_id, dedup_key) selama unread, dan "no-spam" (rollup times). Semua
-- insert via helper definer private.write_notification yang FAIL-SAFE
-- (savepoint internal + swallow + log ke private.notification_errors), sehingga
-- kegagalan notifikasi TIDAK PERNAH membatalkan transaksi RPC event utama.
--
-- Sekaligus memperbaiki bug laten: `proofs` TIDAK ada di publication
-- `supabase_realtime` (cek live pg_publication_tables), sehingga subscription
-- `proofs` di halaman movements/blockchain menjadi silent no-op. Di sini
-- `proofs` ditambahkan ke publication bersama `notifications`.
--
-- Perubahan perilaku vs sebelumnya: NOL untuk logika bisnis — setiap fungsi
-- di bawah hanya di-recreate dengan tambahan `perform private.<notify>(...)`
-- setelah transisi status. Kontrak RPC yang sudah dites tetap sama.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabel notifications (per-penerima)
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  warehouse_id uuid references public.warehouses (id) on delete cascade,
  type text not null check (
    type in (
      'join_requested', 'join_approved', 'join_rejected',
      'membership_role_changed', 'membership_removed', 'membership_left',
      'ownership_transferred',
      'adjustment_pending', 'adjustment_approved', 'adjustment_rejected',
      'proof_confirmed', 'proof_failed', 'proof_manual_review'
    )
  ),
  title text not null check (btrim(title) <> ''),
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  dedup_key text,
  times integer not null default 1 check (times >= 1),
  created_at timestamptz not null default now(),
  last_event_at timestamptz not null default now(),
  read_at timestamptz
);

comment on table public.notifications is
  'PRD §21: satu baris per penerima; dedup (user_id, dedup_key) selama belum dibaca — event berulang menaikkan times, bukan baris baru. read_at terisi → dedup_key bebas lagi.';

-- Dedup: satu notifikasi per (user, dedup_key) selama unread.
create unique index if not exists notifications_dedup_unread_idx
  on public.notifications (user_id, dedup_key)
  where dedup_key is not null and read_at is null;

-- Fast path unread count + list (belum dibaca paling atas).
create index if not exists notifications_user_read_at_idx
  on public.notifications (user_id, read_at, last_event_at desc);

-- ----------------------------------------------------------------------------
-- 2. Log kegagalan internal (private schema, tanpa grant — tidak terlihat user)
-- ----------------------------------------------------------------------------
create table if not exists private.notification_errors (
  id bigint generated always as identity primary key,
  function_name text,
  error_message text,
  sqlstate text,
  user_id uuid,
  warehouse_id uuid,
  type text,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. private.write_notification — fail-safe, TIDAK PERNAH raise
-- ----------------------------------------------------------------------------
create or replace function private.write_notification(
  p_user_id uuid,
  p_warehouse_id uuid,
  p_type text,
  p_title text,
  p_body text default '',
  p_payload jsonb default '{}'::jsonb,
  p_dedup_key text default null
)
returns void
language plpgsql
security definer
set search_path to public
as $function$
begin
  -- Savepoint internal: apa pun yang gagal (FK, constraint, unexpected)
  -- men-rollback subtransaksi ini SAJA; transaksi RPC pemanggil tetap lanjut.
  begin
    if p_user_id is null then
      return;
    end if;
    if not exists (select 1 from public.users where id = p_user_id) then
      return;
    end if;

    insert into public.notifications (user_id, warehouse_id, type, title, body, payload, dedup_key)
    values (
      p_user_id, p_warehouse_id, p_type,
      coalesce(nullif(btrim(p_title), ''), 'Pemberitahuan'),
      coalesce(nullif(btrim(p_body), ''), ''),
      coalesce(p_payload, '{}'::jsonb),
      p_dedup_key
    )
    on conflict (user_id, dedup_key) where dedup_key is not null and read_at is null
    do update set
      times = public.notifications.times + 1,
      last_event_at = now();
  exception when others then
    -- Jangan pernah bunuh transaksi utama. Log pun di-guard (nested exception)
    -- agar proses logging tidak bisa menggagalkan fungsi untuk kedua kalinya.
    begin
      insert into private.notification_errors (function_name, error_message, sqlstate, user_id, warehouse_id, type, payload)
      values ('write_notification', SQLERRM, SQLSTATE, p_user_id, p_warehouse_id, p_type, p_payload);
    exception when others then
      null;
    end;
  end;
end;
$function$;

-- Helper private tidak boleh bisa dipanggil role mana pun (schema private tanpa
-- USAGE sudah menghalangi; revoke ini defense-in-depth yang memastikan grant
-- default `EXECUTE to PUBLIC` dari create function tidak bocor ke depan).
revoke execute on function private.write_notification(uuid, uuid, text, text, text, jsonb, text) from public;

-- ----------------------------------------------------------------------------
-- 4. Helper penerima: OWNER + MANAGER aktif sebuah warehouse
-- ----------------------------------------------------------------------------
create or replace function private.notify_warehouse_managers(
  p_warehouse_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_payload jsonb default '{}'::jsonb,
  p_dedup_key text default null
)
returns void
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_recipient uuid;
begin
  for v_recipient in
    select user_id
    from public.memberships
    where warehouse_id = p_warehouse_id
      and status = 'ACTIVE'
      and role in ('OWNER', 'MANAGER')
  loop
    perform private.write_notification(
      v_recipient, p_warehouse_id, p_type, p_title, p_body, p_payload, p_dedup_key
    );
  end loop;
end;
$function$;

revoke execute on function private.notify_warehouse_managers(uuid, text, text, text, jsonb, text) from public;

-- ----------------------------------------------------------------------------
-- 5. Helper: OWNER aktif sebuah warehouse (untuk proof events)
-- ----------------------------------------------------------------------------
create or replace function private.warehouse_owner_id(p_warehouse_id uuid)
returns uuid
language sql
security definer
set search_path to public
as $$
  select user_id
  from public.memberships
  where warehouse_id = p_warehouse_id and role = 'OWNER' and status = 'ACTIVE'
  limit 1;
$$;

revoke execute on function private.warehouse_owner_id(uuid) from public;

-- ----------------------------------------------------------------------------
-- 6. Helper proof events: notifikasi actor + OWNER (matrix PRD §21)
--    Actor = stock_movements.actor_user_id (pembuat movement).
--    Body mendukung placeholder {product} dan {error}.
-- ----------------------------------------------------------------------------
create or replace function private.notify_proof_event(
  p_proof_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_wh uuid;
  v_actor_id uuid;
  v_mid uuid;
  v_product_name text;
  v_owner uuid;
  v_payload jsonb;
  v_body text;
begin
  select pr.warehouse_id, pr.movement_id, m.actor_user_id
  into v_wh, v_mid, v_actor_id
  from public.proofs pr
  left join public.stock_movements m on m.id = pr.movement_id
  where pr.id = p_proof_id;

  select coalesce(name, 'produk') into v_product_name
  from public.products
  where id = (select product_id from public.stock_movements where id = v_mid);

  v_payload := jsonb_build_object('proof_id', p_proof_id, 'movement_id', v_mid);
  if p_error is not null then
    v_payload := v_payload || jsonb_build_object('error', p_error);
  end if;
  v_body := replace(replace(p_body, '{product}', coalesce(v_product_name, 'produk')), '{error}', coalesce(p_error, ''));

  if v_actor_id is not null then
    perform private.write_notification(
      v_actor_id, v_wh, p_type, p_title, v_body, v_payload,
      'proof_result:' || v_wh::text || ':' || coalesce(v_mid::text, '?') || ':' || p_type
    );
  end if;

  v_owner := private.warehouse_owner_id(v_wh);
  if v_owner is not null and v_owner <> v_actor_id then
    perform private.write_notification(
      v_owner, v_wh, p_type, p_title, v_body, v_payload,
      'proof_result:' || v_wh::text || ':' || coalesce(v_mid::text, '?') || ':' || p_type
    );
  end if;
end;
$function$;

revoke execute on function private.notify_proof_event(uuid, text, text, text, text) from public;

-- ----------------------------------------------------------------------------
-- 7. RPC mark-read (self-scope via definer; client TIDAK dapat UPDATE langsung)
-- ----------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  update public.notifications
    set read_at = now()
  where user_id = v_user_id
    and read_at is null
    and id = any(p_ids);
end;
$function$;

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. RLS: SELECT self-scope. INSERT/UPDATE/DELETE TIDAK punya policy → ditolak
--    client; satu-satunya jalan insert = definer RPC / service_role (bypass).
-- ----------------------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists notifications_select_self on public.notifications;
create policy notifications_select_self on public.notifications
  for select using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 9. Realtime: tambahkan `notifications` DAN perbaiki bug — `proofs` sebelumnya
--    tidak pernah masuk publication (subscription movements/blockchain no-op).
-- ----------------------------------------------------------------------------
do $realtime$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'proofs'
  ) then
    alter publication supabase_realtime add table public.proofs;
  end if;
end $realtime$;

do $realtime$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $realtime$;

-- ============================================================================
-- 10. Integrasi ke RPC event — create or replace, logika bisnis byte-identical,
--     hanya tambahan `perform private.<notify>(...)` setelah transisi.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 10.1 request_join → OWNER + MANAGER (join_requested)
-- ----------------------------------------------------------------------------
create or replace function public.request_join(p_warehouse_code text)
 RETURNS join_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_warehouse public.warehouses;
  v_request public.join_requests;
  v_requester_name text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_warehouse
  from public.warehouses
  where warehouse_code = upper(btrim(p_warehouse_code));

  if v_warehouse is null then
    raise exception 'warehouse not found';
  end if;

  if v_warehouse.status <> 'active' then
    raise exception 'warehouse not accepting joins';
  end if;

  -- Sudah member? (termasuk yang menunggu) → tolak.
  if exists (
    select 1 from public.memberships
    where warehouse_id = v_warehouse.id and user_id = v_user_id
  ) then
    raise exception 'already a member';
  end if;

  -- Request yang masih pending/approved: tidak bisa duplikat.
  if exists (
    select 1 from public.join_requests
    where warehouse_id = v_warehouse.id and user_id = v_user_id
      and status in ('pending', 'approved')
  ) then
    raise exception 'join request already exists';
  end if;

  -- Request lama yang sudah rejected/cancelled: reactivate jadi pending
  -- (user boleh apply lagi; unique (warehouse_id, user_id) mencegah duplikat).
  update public.join_requests
    set status = 'pending',
        role = null,
        decided_by = null,
        decided_at = null,
        reason = null,
        updated_at = now()
  where warehouse_id = v_warehouse.id and user_id = v_user_id
    and status in ('rejected', 'cancelled')
  returning * into v_request;

  if v_request is null then
    insert into public.join_requests (warehouse_id, user_id, status, role)
    values (v_warehouse.id, v_user_id, 'pending', null)
    returning * into v_request;
  end if;

  -- Notifikasi: OWNER + MANAGER ada permintaan join baru.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_requester_name
  from public.users where id = v_user_id;
  perform private.notify_warehouse_managers(
    v_warehouse.id, 'join_requested',
    'Permintaan join baru',
    format('%s meminta bergabung ke %s', v_requester_name, v_warehouse.name),
    jsonb_build_object('warehouse_id', v_warehouse.id, 'user_id', v_user_id, 'request_id', v_request.id),
    'join_request:' || v_warehouse.id::text || ':' || v_user_id::text
  );

  return v_request;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 10.2 approve_join → requester (join_approved)
-- ----------------------------------------------------------------------------
create or replace function public.approve_join(p_request_id uuid, p_role text)
 RETURNS memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_request public.join_requests;
  v_actor_role text;
  v_membership public.memberships;
  v_actor_name text;
  v_wh_name text;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_request
  from public.join_requests
  where id = p_request_id;

  if v_request is null then
    raise exception 'join request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'join request not pending';
  end if;

  v_actor_role := private.member_role(v_request.warehouse_id, v_actor_id);

  if v_actor_role is null then
    raise exception 'not a member';
  end if;

  -- PRD §9.2 / AGENT.md §3: assign role WAJIB lewat canAssignRole.
  if not private.can_assign_role(v_actor_role, p_role) then
    raise exception 'insufficient role to assign %', p_role;
  end if;

  -- Role yang di-assign saat approve TIDAK boleh OWNER (owner via create
  -- warehouse / ownership transfer on-chain).
  if p_role = 'OWNER' then
    raise exception 'cannot assign OWNER via join request';
  end if;

  -- Transaksi: request → approved + membership ACTIVE (role sesuai matrix).
  update public.join_requests
    set status = 'approved', role = p_role, decided_by = v_actor_id, decided_at = now()
  where id = p_request_id;

  insert into public.memberships (warehouse_id, user_id, role, status, joined_at)
  values (v_request.warehouse_id, v_request.user_id, p_role, 'ACTIVE', now())
  on conflict (warehouse_id, user_id) do update set
    role = excluded.role,
    status = 'ACTIVE',
    joined_at = now(),
    updated_at = now()
  returning * into v_membership;

  -- Notifikasi: requester.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_actor_name
  from public.users where id = v_actor_id;
  select name into v_wh_name from public.warehouses where id = v_request.warehouse_id;
  perform private.write_notification(
    v_request.user_id, v_request.warehouse_id, 'join_approved',
    'Permintaan join diterima',
    format('Kamu diterima di %s sebagai %s oleh %s', v_wh_name, p_role, v_actor_name),
    jsonb_build_object('warehouse_id', v_request.warehouse_id, 'role', p_role, 'membership_id', v_membership.id),
    'join_result:' || v_request.warehouse_id::text || ':' || v_request.user_id::text
  );

  return v_membership;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 10.3 reject_join → requester (join_rejected)
-- ----------------------------------------------------------------------------
create or replace function public.reject_join(p_request_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_request public.join_requests;
  v_actor_name text;
  v_wh_name text;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_request
  from public.join_requests
  where id = p_request_id;

  if v_request is null then
    raise exception 'join request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'join request not pending';
  end if;

  -- Satu sumber kebenaran: can_manage_join_requests turun dari can_assign_role
  -- (bukan `has_role OWNER OR has_role MANAGER` seperti 0005). Konsisten dengan
  -- JOIN_REQUEST_APPROVE TS — drift matrix masa depan otomatis ketahuan via
  -- RBAC contract test, bukan menyimpang diam-diam.
  if not private.can_manage_join_requests(v_request.warehouse_id, v_actor_id) then
    raise exception 'insufficient permission to reject';
  end if;

  update public.join_requests
    set status = 'rejected', decided_by = v_actor_id, decided_at = now(),
        reason = coalesce(p_reason, reason)
  where id = p_request_id;

  -- Notifikasi: requester.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_actor_name
  from public.users where id = v_actor_id;
  select name into v_wh_name from public.warehouses where id = v_request.warehouse_id;
  perform private.write_notification(
    v_request.user_id, v_request.warehouse_id, 'join_rejected',
    'Permintaan join ditolak',
    format('Permintaan bergabung ke %s ditolak oleh %s%s',
      v_wh_name, v_actor_name,
      case when coalesce(p_reason, '') <> '' then ': ' || p_reason else '' end),
    jsonb_build_object('warehouse_id', v_request.warehouse_id, 'reason', p_reason),
    'join_result:' || v_request.warehouse_id::text || ':' || v_request.user_id::text
  );
end;
$function$;

-- ----------------------------------------------------------------------------
-- 10.4 update_member_role → member yang diubah (membership_role_changed)
-- ----------------------------------------------------------------------------
create or replace function public.update_member_role(p_warehouse_id uuid, p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target public.memberships;
  v_actor_name text;
  v_wh_name text;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'cannot change own role';
  end if;

  select * into v_target
  from public.memberships
  where warehouse_id = p_warehouse_id and user_id = p_user_id;

  if v_target is null then
    raise exception 'member not found';
  end if;

  if v_target.role = 'OWNER' then
    raise exception 'cannot change owner role';
  end if;

  v_actor_role := private.member_role(p_warehouse_id, v_actor_id);
  if v_actor_role is null then
    raise exception 'not a member';
  end if;

  if not private.can_assign_role(v_actor_role, p_role) then
    raise exception 'insufficient permission to assign %', p_role;
  end if;

  update public.memberships
    set role = p_role, updated_at = now()
  where id = v_target.id;

  -- Notifikasi: member yang perannya diubah.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_actor_name
  from public.users where id = v_actor_id;
  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  perform private.write_notification(
    p_user_id, p_warehouse_id, 'membership_role_changed',
    'Peran berubah',
    format('Peranmu di %s diubah menjadi %s oleh %s', v_wh_name, p_role, v_actor_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'role', p_role),
    'role_change:' || p_warehouse_id::text || ':' || p_user_id::text
  );
end;
$function$;

-- ----------------------------------------------------------------------------
-- 10.5 remove_member → member yang di-remove SAJA (membership_removed).
--      Pelaku remove TIDAK dinotifikasi (dia yang melakukan aksi).
-- ----------------------------------------------------------------------------
create or replace function public.remove_member(p_warehouse_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target public.memberships;
  v_actor_name text;
  v_wh_name text;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'use leave_warehouse to leave';
  end if;

  select * into v_target
  from public.memberships
  where warehouse_id = p_warehouse_id and user_id = p_user_id;

  if v_target is null then
    raise exception 'member not found';
  end if;

  if v_target.role = 'OWNER' then
    raise exception 'cannot remove owner';
  end if;

  v_actor_role := private.member_role(p_warehouse_id, v_actor_id);
  if v_actor_role is null then
    raise exception 'not a member';
  end if;

  -- Remove = operasi assign-role terkait (PRD §9.2): wajib canAssignRole
  -- terhadap role target.
  if not private.can_assign_role(v_actor_role, v_target.role) then
    raise exception 'insufficient role to remove %', v_target.role;
  end if;

  delete from public.memberships
  where warehouse_id = p_warehouse_id and user_id = p_user_id;

  -- Bersihkan join request yang tersisa (pending ATAU approved) untuk
  -- konsistensi: user sudah bukan member, request lama tidak valid lagi.
  update public.join_requests
    set status = 'cancelled', updated_at = now()
  where warehouse_id = p_warehouse_id and user_id = p_user_id
    and status in ('pending', 'approved');

  -- Notifikasi: member yang di-remove (bukan pelaku).
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_actor_name
  from public.users where id = v_actor_id;
  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  perform private.write_notification(
    p_user_id, p_warehouse_id, 'membership_removed',
    'Kamu dihapus dari warehouse',
    format('Kamu dihapus dari %s oleh %s', v_wh_name, v_actor_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'removed_by', v_actor_id),
    'member_removed:' || p_warehouse_id::text || ':' || p_user_id::text
  );
end;
$function$;

-- ----------------------------------------------------------------------------
-- 10.6 leave_warehouse → OWNER + MANAGER (membership_left). Member yang leave
--      tidak dinotifikasi (dia pelaku aksi).
-- ----------------------------------------------------------------------------
create or replace function public.leave_warehouse(p_warehouse_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_membership public.memberships;
  v_leaver_name text;
  v_wh_name text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_membership
  from public.memberships
  where warehouse_id = p_warehouse_id and user_id = v_user_id;

  if v_membership is null then
    raise exception 'not a member';
  end if;

  -- Owner tidak boleh leave sebelum transfer ownership (PRD §11, AGENT Invariant).
  if v_membership.role = 'OWNER' then
    raise exception 'owner cannot leave warehouse; transfer ownership first';
  end if;

  delete from public.memberships
  where warehouse_id = p_warehouse_id and user_id = v_user_id;

  -- Bersihkan join request yang tersisa (jika ada) untuk konsistensi.
  update public.join_requests
    set status = 'cancelled', updated_at = now()
  where warehouse_id = p_warehouse_id and user_id = v_user_id
    and status in ('pending', 'approved');

  -- Notifikasi: OWNER + MANAGER (tim berkurang).
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_leaver_name
  from public.users where id = v_user_id;
  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  perform private.notify_warehouse_managers(
    p_warehouse_id, 'membership_left',
    'Member keluar',
    format('%s keluar dari %s', v_leaver_name, v_wh_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'user_id', v_user_id),
    'member_left:' || p_warehouse_id::text || ':' || v_user_id::text
  );
end;
$function$;

-- ----------------------------------------------------------------------------
-- 10.7 transfer_ownership → owner lama + owner baru (ownership_transferred)
-- ----------------------------------------------------------------------------
create or replace function public.transfer_ownership(p_warehouse_id uuid, p_new_owner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target public.memberships;
  v_actor_name text;
  v_new_owner_name text;
  v_wh_name text;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  if p_new_owner_id = v_actor_id then
    raise exception 'already the owner';
  end if;

  v_actor_role := private.member_role(p_warehouse_id, v_actor_id);
  if v_actor_role <> 'OWNER' then
    raise exception 'only owner can transfer ownership';
  end if;

  select * into v_target
  from public.memberships
  where warehouse_id = p_warehouse_id and user_id = p_new_owner_id;

  if v_target is null then
    raise exception 'target is not a member';
  end if;

  if v_target.status <> 'ACTIVE' then
    raise exception 'target membership is not active';
  end if;

  update public.memberships
    set role = 'OWNER', updated_at = now()
  where id = v_target.id;

  update public.memberships
    set role = 'MANAGER', updated_at = now()
  where warehouse_id = p_warehouse_id and user_id = v_actor_id;

  -- Pemindahan owner_user_id = tulis identitas; buka GUC milik server flow
  -- agar guard `enforce_warehouse_identity_immutable` (0011) mengizinkannya.
  perform set_config('app.allow_identity_write', 'true', true);

  update public.warehouses
    set owner_user_id = p_new_owner_id
  where id = p_warehouse_id;

  -- Notifikasi: owner baru + owner lama.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_actor_name
  from public.users where id = v_actor_id;
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_new_owner_name
  from public.users where id = p_new_owner_id;
  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  perform private.write_notification(
    p_new_owner_id, p_warehouse_id, 'ownership_transferred',
    'Kepemilikan warehouse',
    format('Kamu kini pemilik %s (dialihkan oleh %s)', v_wh_name, v_actor_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'previous_owner', v_actor_id),
    'ownership:' || p_warehouse_id::text
  );
  perform private.write_notification(
    v_actor_id, p_warehouse_id, 'ownership_transferred',
    'Kepemilikan warehouse',
    format('Kepemilikan %s berpindah ke %s', v_wh_name, v_new_owner_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'new_owner', p_new_owner_id),
    'ownership:' || p_warehouse_id::text
  );
end;
$function$;

-- ----------------------------------------------------------------------------
-- 10.8 apply_stock_movement: adjustment pending → OWNER + MANAGER
--      (adjustment_pending). Tipe committed (stock_in/out/reversal) TIDAK
--      dinotifikasi — transisi statusnya langsung terlihat di UI stok.
-- ----------------------------------------------------------------------------
create or replace function public.apply_stock_movement(p_warehouse_id uuid, p_product_id uuid, p_movement_type text, p_quantity numeric, p_expected_balance_version bigint, p_reason text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_reversal_of uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text, p_actor_wallet text DEFAULT NULL::text, p_movement_id uuid DEFAULT NULL::uuid, p_proof_payload jsonb DEFAULT NULL::jsonb, p_proof_payload_hash text DEFAULT NULL::text)
 RETURNS TABLE(movement_id uuid, balance_version bigint, proof_pending boolean, error_code text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_product public.products;
  v_balance public.inventory_balances;
  v_existing public.stock_movements;
  v_movement_id uuid;
  v_new_qty numeric;
  v_new_version bigint;
  v_original_qty numeric;
  v_reversed_total numeric;
  v_wh_address text;
  v_proof_id uuid;
  v_proof_pending boolean;
begin
  -- AUTH
  if v_user_id is null then
    return query select null::uuid, null::bigint, false, 'UNAUTHENTICATED', 'not authenticated';
    return;
  end if;

  -- Role check (member ACTIVE di warehouse)
  v_role := private.member_role(p_warehouse_id, v_user_id);
  if v_role is null then
    return query select null::uuid, null::bigint, false, 'FORBIDDEN', 'not a member of warehouse';
    return;
  end if;

  -- Permission per movement type (kanonik lib/auth/permissions.ts):
  if p_movement_type in ('stock_in', 'stock_out') then
    if v_role not in ('STAFF', 'MANAGER', 'OWNER') then
      return query select null::uuid, null::bigint, false, 'FORBIDDEN', 'insufficient permission';
      return;
    end if;
  elsif p_movement_type in ('adjustment', 'reversal') then
    if v_role not in ('MANAGER', 'OWNER') then
      return query select null::uuid, null::bigint, false, 'FORBIDDEN', 'insufficient permission';
      return;
    end if;
  else
    return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'invalid movement type';
    return;
  end if;

  -- Idempotency: gunakan FOUND (row variable sebagian NULL membuat IS NOT NULL false).
  if p_idempotency_key is not null then
    select * into v_existing
    from public.stock_movements
    where idempotency_key = p_idempotency_key
    limit 1;

    if found then
      return query
        select v_existing.id,
               coalesce((
                 select version from public.inventory_balances
                 where warehouse_id = p_warehouse_id and product_id = p_product_id
               ), 0),
               exists(select 1 from public.proofs where proofs.movement_id = v_existing.id),
               'IDEMPOTENT', 'already processed';
      return;
    end if;
  end if;

  -- Proof: payload/hash wajib menyertakan movement_id yang dipakai (BFF).
  -- Hash dihitung di BFF; DB memvalidasi konsistensi + warehouse deployed.
  if p_proof_payload is not null or p_proof_payload_hash is not null then
    if p_movement_id is null then
      return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'proof requires p_movement_id';
      return;
    end if;
    select contract_address into v_wh_address
    from public.warehouses where id = p_warehouse_id;
    if v_wh_address is null
       or lower(coalesce(p_proof_payload ->> 'warehouseAddress', '')) <> lower(v_wh_address)
       or coalesce(p_proof_payload ->> 'movementId', '') <> p_movement_id::text then
      return query select null::uuid, null::bigint, false, 'INVALID_INPUT',
        'proof requires a deployed warehouse and matching payload';
      return;
    end if;
  end if;

  -- Product milik warehouse + unit
  select * into v_product
  from public.products
  where id = p_product_id and warehouse_id = p_warehouse_id;

  if v_product is null then
    return query select null::uuid, null::bigint, false, 'NOT_FOUND', 'product not found';
    return;
  end if;

  -- Reversal: target committed, product sama, dan cumulative reversal (parsial)
  -- TIDAK boleh melebihi quantity movement asli.
  if p_movement_type = 'reversal' then
    if p_reversal_of is null then
      return query select null::uuid, null::bigint, false, 'INVALID_INPUT', 'reversal_of required';
      return;
    end if;
    if not exists (
      select 1 from public.stock_movements
      where id = p_reversal_of and product_id = p_product_id and status = 'committed'
    ) then
      return query select null::uuid, null::bigint, false, 'INVALID_REVERSAL', 'reversal target not found/committed';
      return;
    end if;

    select quantity into v_original_qty
    from public.stock_movements
    where id = p_reversal_of;

    select coalesce(sum(quantity), 0) into v_reversed_total
    from public.stock_movements
    where reversal_of = p_reversal_of
      and status = 'committed';

    if v_reversed_total + p_quantity > v_original_qty then
      return query
        select null::uuid, null::bigint, false, 'INVALID_REVERSAL',
               format('reversal exceeds original quantity: already reversed %s of %s, tried %s',
                      v_reversed_total, v_original_qty, p_quantity);
      return;
    end if;
  end if;

  -- Balance row lock (SELECT ... FOR UPDATE) — hanya untuk tipe yang langsung
  -- mengubah saldo (stock_in/out, reversal). Adjustment menunggu approval.
  v_new_version := 0;
  v_new_qty := 0;

  if p_movement_type in ('stock_in', 'stock_out', 'reversal') then
    select * into v_balance
    from public.inventory_balances
    where warehouse_id = p_warehouse_id and product_id = p_product_id
    for update;

    if v_balance is null then
      insert into public.inventory_balances (warehouse_id, product_id, quantity, version, updated_by)
      values (p_warehouse_id, p_product_id, 0, 0, v_user_id)
      on conflict (warehouse_id, product_id) do nothing;

      select * into v_balance
      from public.inventory_balances
      where warehouse_id = p_warehouse_id and product_id = p_product_id
      for update;
    end if;

    -- Optimistic lock: expected version harus cocok (STALE_STOCK).
    if p_expected_balance_version is not null
       and v_balance.version <> p_expected_balance_version then
      return query
        select null::uuid, v_balance.version, false, 'STALE_STOCK',
               format('expected version %s but current is %s', p_expected_balance_version, v_balance.version);
      return;
    end if;

    -- Hitung saldo baru (stock_out & reversal tidak boleh negative).
    v_new_qty := v_balance.quantity;
    if p_movement_type = 'stock_in' then
      v_new_qty := v_new_qty + p_quantity;
    elsif p_movement_type = 'stock_out' then
      if v_balance.quantity < p_quantity then
        return query
          select null::uuid, v_balance.version, false, 'INSUFFICIENT_STOCK',
                 format('insufficient stock: have %s, need %s', v_balance.quantity, p_quantity);
        return;
      end if;
      v_new_qty := v_new_qty - p_quantity;
    elsif p_movement_type = 'reversal' then
      if v_balance.quantity < p_quantity then
        return query
          select null::uuid, v_balance.version, false, 'INSUFFICIENT_STOCK',
                 format('insufficient stock to reverse: have %s, need %s', v_balance.quantity, p_quantity);
        return;
      end if;
      v_new_qty := v_new_qty - p_quantity;
    end if;

    v_new_version := v_balance.version + 1;
  end if;

  -- Tulis movement (id: diberikan BFF bila proof, else generated).
  v_movement_id := coalesce(p_movement_id, gen_random_uuid());
  insert into public.stock_movements (
    id, warehouse_id, product_id, movement_type, quantity,
    actor_user_id, actor_wallet, role_at_time, reason, reference,
    reversal_of, status, expected_balance_version, idempotency_key
  )
  values (
    v_movement_id, p_warehouse_id, p_product_id, p_movement_type, p_quantity,
    v_user_id, p_actor_wallet, v_role, p_reason, p_reference,
    p_reversal_of,
    case when p_movement_type = 'adjustment' then 'pending_approval' else 'committed' end,
    case when p_movement_type in ('stock_in', 'stock_out', 'reversal') then v_balance.version else null end,
    p_idempotency_key
  )
  returning id into v_movement_id;

  -- Update saldo + version (hanya untuk tipe yang langsung committed).
  if p_movement_type in ('stock_in', 'stock_out', 'reversal') then
    update public.inventory_balances
      set quantity = v_new_qty,
          version = v_new_version,
          updated_at = now(),
          updated_by = v_user_id
    where id = v_balance.id;
  end if;

  -- Notifikasi: adjustment butuh approval → OWNER + MANAGER.
  if p_movement_type = 'adjustment' then
    perform private.notify_warehouse_managers(
      p_warehouse_id, 'adjustment_pending',
      'Penyesuaian butuh persetujuan',
      format('Penyesuaian %s (%s %s) menunggu persetujuan',
        coalesce(v_product.name, 'produk'), p_quantity, coalesce(v_product.unit, 'unit')),
      jsonb_build_object('warehouse_id', p_warehouse_id, 'movement_id', v_movement_id, 'product_id', p_product_id, 'quantity', p_quantity),
      'adjustment_pending:' || v_movement_id::text
    );
  end if;

  -- Proof pipeline: SAMA TRANSAKSI dengan movement (Step 5).
  -- Adjustment → proof dibuat saat approve (movement belum committed).
  v_proof_pending := false;
  if p_proof_payload is not null and p_proof_payload_hash is not null
     and p_movement_type <> 'adjustment' then
    v_proof_id := gen_random_uuid();
    insert into public.proofs (
      id, warehouse_id, warehouse_address, movement_id, payload,
      payload_version, payload_hash, status
    )
    values (
      v_proof_id, p_warehouse_id, lower(v_wh_address), v_movement_id,
      p_proof_payload, 1, p_proof_payload_hash, 'pending'
    );

    insert into public.proof_outbox (id, proof_id, status, attempt_count, next_attempt_at)
    values (gen_random_uuid(), v_proof_id, 'pending', 0, now());

    v_proof_pending := true;

    perform private.write_audit(
      p_warehouse_id, v_user_id, 'proof_created', 'proofs', v_proof_id::text,
      null, jsonb_build_object('movement_id', v_movement_id, 'payload_hash', p_proof_payload_hash),
      null, 'pending'
    );
  end if;

  return query
    select v_movement_id, v_new_version, v_proof_pending, null::text, 'ok';
end;
$function$;

-- ----------------------------------------------------------------------------
-- 10.9 approve_stock_adjustment → actor (adjustment_approved)
-- ----------------------------------------------------------------------------
create or replace function public.approve_stock_adjustment(p_movement_id uuid, p_proof_payload jsonb DEFAULT NULL::jsonb, p_proof_payload_hash text DEFAULT NULL::text)
 RETURNS stock_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_movement public.stock_movements;
  v_balance public.inventory_balances;
  v_new_qty numeric;
  v_wh_address text;
  v_proof_id uuid;
  v_approver_name text;
  v_wh_name text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_movement
  from public.stock_movements
  where id = p_movement_id
  for update;

  if v_movement is null then
    raise exception 'movement not found';
  end if;

  if v_movement.movement_type <> 'adjustment' or v_movement.status <> 'pending_approval' then
    raise exception 'movement not awaiting approval';
  end if;

  -- Approver harus MANAGER/OWNER (STOCK_APPROVE_ADJUSTMENT).
  if private.member_role(v_movement.warehouse_id, v_user_id) not in ('MANAGER', 'OWNER') then
    raise exception 'insufficient permission';
  end if;

  select * into v_balance
  from public.inventory_balances
  where warehouse_id = v_movement.warehouse_id and product_id = v_movement.product_id
  for update;

  if v_balance is null then
    insert into public.inventory_balances (warehouse_id, product_id, quantity, version, updated_by)
    values (v_movement.warehouse_id, v_movement.product_id, 0, 0, v_user_id);
    select * into v_balance
    from public.inventory_balances
    where warehouse_id = v_movement.warehouse_id and product_id = v_movement.product_id
    for update;
  end if;

  v_new_qty := v_balance.quantity + v_movement.quantity;
  if v_new_qty < 0 then
    raise exception 'insufficient stock for adjustment';
  end if;

  update public.stock_movements
    set status = 'committed', approved_by = v_user_id, approved_at = now()
  where id = p_movement_id
    and status = 'pending_approval'
  returning * into v_movement;

  if not found then
    raise exception 'movement already processed';
  end if;

  update public.inventory_balances
    set quantity = v_new_qty,
        version = v_balance.version + 1,
        updated_at = now(),
        updated_by = v_user_id
  where id = v_balance.id;

  -- Proof pipeline: SAMA TRANSAKSI dengan approval.
  if p_proof_payload is not null and p_proof_payload_hash is not null then
    select contract_address into v_wh_address
    from public.warehouses where id = v_movement.warehouse_id;
    if v_wh_address is null
       or lower(coalesce(p_proof_payload ->> 'warehouseAddress', '')) <> lower(v_wh_address)
       or coalesce(p_proof_payload ->> 'movementId', '') <> p_movement_id::text then
      raise exception 'proof requires a deployed warehouse and matching payload';
    end if;

    v_proof_id := gen_random_uuid();
    insert into public.proofs (
      id, warehouse_id, warehouse_address, movement_id, payload,
      payload_version, payload_hash, status
    )
    values (
      v_proof_id, v_movement.warehouse_id, lower(v_wh_address), p_movement_id,
      p_proof_payload, 1, p_proof_payload_hash, 'pending'
    );

    insert into public.proof_outbox (id, proof_id, status, attempt_count, next_attempt_at)
    values (gen_random_uuid(), v_proof_id, 'pending', 0, now());

    perform private.write_audit(
      v_movement.warehouse_id, v_user_id, 'proof_created', 'proofs', v_proof_id::text,
      null, jsonb_build_object('movement_id', p_movement_id, 'payload_hash', p_proof_payload_hash),
      null, 'pending'
    );
  end if;

  -- Notifikasi: pembuat adjustment.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_approver_name
  from public.users where id = v_user_id;
  select name into v_wh_name from public.warehouses where id = v_movement.warehouse_id;
  perform private.write_notification(
    v_movement.actor_user_id, v_movement.warehouse_id, 'adjustment_approved',
    'Penyesuaian disetujui',
    format('Penyesuaianmu di %s disetujui oleh %s', v_wh_name, v_approver_name),
    jsonb_build_object('warehouse_id', v_movement.warehouse_id, 'movement_id', p_movement_id),
    'adjustment_result:' || p_movement_id::text
  );

  return v_movement;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 10.10 reject_stock_adjustment → actor (adjustment_rejected)
-- ----------------------------------------------------------------------------
create or replace function public.reject_stock_adjustment(p_movement_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_movement public.stock_movements;
  v_rejector_name text;
  v_wh_name text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_movement
  from public.stock_movements
  where id = p_movement_id;

  if v_movement is null then
    raise exception 'movement not found';
  end if;

  if v_movement.movement_type <> 'adjustment' or v_movement.status <> 'pending_approval' then
    raise exception 'movement not awaiting approval';
  end if;

  if private.member_role(v_movement.warehouse_id, v_user_id) not in ('MANAGER', 'OWNER') then
    raise exception 'insufficient permission';
  end if;

  update public.stock_movements
    set status = 'rejected', approved_by = v_user_id, approved_at = now(), reason = coalesce(p_reason, reason)
  where id = p_movement_id;

  -- Notifikasi: pembuat adjustment.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_rejector_name
  from public.users where id = v_user_id;
  select name into v_wh_name from public.warehouses where id = v_movement.warehouse_id;
  perform private.write_notification(
    v_movement.actor_user_id, v_movement.warehouse_id, 'adjustment_rejected',
    'Penyesuaian ditolak',
    format('Penyesuaianmu di %s ditolak oleh %s%s',
      v_wh_name, v_rejector_name,
      case when coalesce(p_reason, '') <> '' then ': ' || p_reason else '' end),
    jsonb_build_object('warehouse_id', v_movement.warehouse_id, 'movement_id', p_movement_id, 'reason', p_reason),
    'adjustment_result:' || p_movement_id::text
  );
end;
$function$;

-- ----------------------------------------------------------------------------
-- 10.11 proof_set_confirmation → actor + OWNER (proof_confirmed) bila confirmed.
--       Status 'confirming' TIDAK dinotifikasi (transisi menengah).
-- ----------------------------------------------------------------------------
create or replace function public.proof_set_confirmation(p_proof_id uuid, p_count integer, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wh uuid;
begin
  select warehouse_id into v_wh from public.proofs where id = p_proof_id;

  update public.proofs
    set confirmation_count = p_count, status = p_status, error = null, updated_at = now()
  where id = p_proof_id;

  perform private.write_audit(v_wh, null, 'proof_confirmation', 'proofs', p_proof_id::text,
    null, jsonb_build_object('confirmation_count', p_count, 'status', p_status), null, p_status);

  if p_status = 'confirmed' then
    perform private.notify_proof_event(
      p_proof_id, 'proof_confirmed',
      'Terkonfirmasi di blockchain',
      format('Movement {product} terkonfirmasi on-chain (%s konfirmasi)', p_count)
    );
  end if;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 10.12 proof_requeue → actor + OWNER: attempts >= 5 = proof_manual_review,
--       selain itu = proof_failed (retrying, rollup via dedup).
-- ----------------------------------------------------------------------------
create or replace function public.proof_requeue(p_proof_id uuid, p_error text, p_next_attempt_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_attempts int;
  v_wh uuid;
begin
  select ob.attempt_count, pr.warehouse_id into v_attempts, v_wh
  from public.proof_outbox ob
  join public.proofs pr on pr.id = ob.proof_id
  where ob.proof_id = p_proof_id;

  if v_attempts >= 5 then
    update public.proofs set status = 'manual_review', error = p_error, updated_at = now() where id = p_proof_id;
    update public.proof_outbox set status = 'failed', lease_token = null, next_attempt_at = null, error = p_error, updated_at = now() where proof_id = p_proof_id;
    perform private.write_audit(v_wh, null, 'proof_manual_review', 'proofs', p_proof_id::text,
      null, jsonb_build_object('error', p_error, 'attempts', v_attempts), null, 'manual_review');
    perform private.notify_proof_event(
      p_proof_id, 'proof_manual_review',
      'Butuh review manual',
      'Proof {product} masuk review manual: {error}',
      p_error
    );
  else
    update public.proofs set status = 'retrying', error = p_error, updated_at = now() where id = p_proof_id;
    update public.proof_outbox set status = 'failed', lease_token = null, next_attempt_at = p_next_attempt_at, error = p_error, updated_at = now() where proof_id = p_proof_id;
    perform private.write_audit(v_wh, null, 'proof_retrying', 'proofs', p_proof_id::text,
      null, jsonb_build_object('error', p_error, 'attempt', v_attempts, 'next_attempt_at', p_next_attempt_at), null, 'retrying');
    perform private.notify_proof_event(
      p_proof_id, 'proof_failed',
      'Gagal kirim ke blockchain',
      'Proof {product} gagal dikirim; percobaan ulang otomatis dijadwalkan. {error}',
      p_error
    );
  end if;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 10.13 proof_mark_manual → actor + OWNER (proof_manual_review)
-- ----------------------------------------------------------------------------
create or replace function public.proof_mark_manual(p_proof_id uuid, p_error text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wh uuid;
begin
  select warehouse_id into v_wh from public.proofs where id = p_proof_id;

  update public.proofs set status = 'manual_review', error = p_error, updated_at = now() where id = p_proof_id;
  update public.proof_outbox set status = 'failed', lease_token = null, next_attempt_at = null, error = p_error, updated_at = now() where proof_id = p_proof_id;

  perform private.write_audit(v_wh, null, 'proof_manual_review', 'proofs', p_proof_id::text,
    null, jsonb_build_object('error', p_error), null, 'manual_review');

  perform private.notify_proof_event(
    p_proof_id, 'proof_manual_review',
    'Butuh review manual',
    'Proof {product} masuk review manual: {error}',
    p_error
  );
end;
$function$;

-- ============================================================================
-- Catatan perilaku (tidak berubah): proof_complete hanya dipanggil dengan
-- p_status = 'submitted' (processor.ts) — bukan salah satu dari 13 tipe, maka
-- tidak di-recreate di sini. 'failed' tidak pernah di-set di proofs.status
-- (hanya proof_outbox), maka proof_failed dipetakan ke transisi 'retrying'.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Hardening lanjutan: private.write_audit (didefinisikan 0009) mewarisi grant
-- default `EXECUTE to PUBLIC`. Schema private memang tidak punya USAGE untuk
-- role mana pun sehingga tak terjangkau, tapi revoke ini mencegah bocor jika
-- grant schema berubah di masa depan.
-- ----------------------------------------------------------------------------
revoke execute on function private.write_audit(uuid, uuid, text, text, text, jsonb, jsonb, text, text) from public;
