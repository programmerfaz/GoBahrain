-- RLS policies to allow reading user + account for community post authors (for displaying author names).
-- Run in Supabase SQL Editor. Replaces the need for get_community_author_names RPC.
-- Only exposes user/account rows for users who have posted in community.
--
-- Uses a SECURITY DEFINER helper to avoid infinite recursion (account policy would reference user,
-- and user policy references account).

-- Drop existing policies if re-running (e.g. after recursion error)
drop policy if exists "Allow read account for community authors" on public.account;
drop policy if exists "Allow read user for community authors" on public."user";

-- Helper: returns account_uuids of users who have posted in community. Bypasses RLS.
create or replace function public.get_community_author_account_uuids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select distinct u.account_uuid
  from public."user" u
  where u.user_a_uuid in (select user_a_uuid from public.community);
$$;

-- Allow reading user rows for community authors
create policy "Allow read user for community authors"
  on public."user" for select
  using (
    user_a_uuid in (select user_a_uuid from public.community)
  );

-- Allow reading account rows for community authors (uses helper to avoid recursion)
create policy "Allow read account for community authors"
  on public.account for select
  using (
    account_uuid in (select get_community_author_account_uuids())
  );
