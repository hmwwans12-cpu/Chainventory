-- ============================================================================
-- Chainventory — 0043: notification preferences (audit: notification preferences)
-- ============================================================================
-- Preferensi notifikasi per-user disimpan sebagai JSONB di kolom
-- `notification_preferences` pada tabel users. Struktur bebas (channel × tipe),
-- dibaca oleh kode pengirim notifikasi (saat ini in-app; email adalah
-- pengembangan infra). Mutasi lewat RPC definer agar client tidak bisa
-- UPDATE sembarang kolom users.
-- ============================================================================

alter table public.users
  add column if not exists notification_preferences jsonb not null default '{}'::jsonb;

comment on column public.users.notification_preferences is
  'Preferensi notifikasi per-user: channel (in_app/email) × tipe event. Default kosong = semua nyala.';

create or replace function public.upsert_notification_preferences(p_prefs jsonb)
returns void
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  update public.users
    set notification_preferences = coalesce(p_prefs, '{}'::jsonb),
        updated_at = now()
  where id = v_user;
end;
$function$;

revoke execute on function public.upsert_notification_preferences(jsonb) from public, anon;
grant execute on function public.upsert_notification_preferences(jsonb) to authenticated;
