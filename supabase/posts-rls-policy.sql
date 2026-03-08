-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Allows the app (anon key) to read from public.posts so the home feed shows your 9 posts.
-- If RLS is not enabled on posts, this enables it and adds a read policy.

-- Enable RLS on posts (if not already)
alter table public.posts enable row level security;

-- Drop existing policy if you re-run this (avoid duplicate policy error)
drop policy if exists "Allow public read on posts" on public.posts;

-- Allow anyone (anon + authenticated) to SELECT posts
create policy "Allow public read on posts"
on public.posts
for select
to public
using (true);
