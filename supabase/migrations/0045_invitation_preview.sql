-- ============================================================================
-- Chainventory — 0045: invitation preview (audit v0.3.2 §1.6)
-- ============================================================================
-- Sebelumnya, user yang membuka /invite/<token> langsung memanggil
-- accept_invitation. Bila email-nya tidak cocok, RPC raise exception
-- 'invitation is for another email' yang ditampilkan ke user — selain
-- membocorkan apakah token valid, ini juga salah sasaran: user mungkin
-- login dengan email yang salah.
--
-- RPC ini mengembalikan email tujuan + status (jika token valid) sehingga
-- halaman /invite/[token] bisa:
--   1. Tampilkan "Sign in with email X to accept" bila login mismatch
--   2. Tolak expired/revoked dengan pesan friendly (no info leak)
--   3. Hanya panggil accept_invitation bila email cocok
-- ============================================================================

create or replace function public.get_invitation_by_token(p_token text)
returns table (
  email text,
  warehouse_id uuid,
  warehouse_name text,
  role text,
  status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path to public
as $function$
begin
  return query
  select
    lower(i.email) as email,
    i.warehouse_id,
    w.name as warehouse_name,
    i.role,
    i.status,
    i.expires_at
  from public.invitations i
  join public.warehouses w on w.id = i.warehouse_id
  where i.token = p_token;
end;
$function$;

revoke execute on function public.get_invitation_by_token(text) from public, anon;
grant execute on function public.get_invitation_by_token(text) to authenticated;

comment on function public.get_invitation_by_token(text) is
  'Lookup invitation by token (for /invite/[token] pre-check). Returns row only if token exists; RLS-equivalent security is the service-role bypass — but anonymous users cannot call this.';
