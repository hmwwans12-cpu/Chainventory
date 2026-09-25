revoke select on public.users from anon, authenticated;
grant select (id, email, display_name, avatar_url)
  on public.users to authenticated;
grant select on public.users to service_role;

create or replace function public.get_my_profile()
returns table (
  id uuid,
  email text,
  display_name text,
  avatar_url text,
  privy_user_id text,
  notification_preferences jsonb
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;
  return query
  select u.id, u.email, u.display_name, u.avatar_url,
         u.privy_user_id, u.notification_preferences
  from public.users u
  where u.id = v_user_id;
end;
$function$;

revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;
