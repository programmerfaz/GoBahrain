-- DEPRECATED: Use community-author-rls.sql instead (RLS + direct join is simpler).
-- This RPC is no longer used by the app.
--
-- RPC to fetch user_name for community post authors (bypasses RLS for display).
-- Usage: select * from get_community_author_names(array['uuid1','uuid2']::uuid[]);

create or replace function public.get_community_author_names(p_user_ids uuid[])
returns table (user_a_uuid uuid, user_name text)
language sql
security definer
set search_path = public
as $$
  select u.user_a_uuid, a.user_name
  from public."user" u
  join public.account a on a.account_uuid = u.account_uuid
  where u.user_a_uuid = any(p_user_ids)
    and a.user_name is not null
    and trim(a.user_name) != '';
$$;

grant execute on function public.get_community_author_names(uuid[]) to anon;
grant execute on function public.get_community_author_names(uuid[]) to authenticated;
