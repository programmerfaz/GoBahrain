-- Explore reads `public.events` with the anon key. If RLS is enabled with no SELECT policy,
-- PostgREST returns 0 rows and the app shows "no events". Run this in the Supabase SQL editor.

alter table public.events enable row level security;

drop policy if exists "Allow public read events" on public.events;
create policy "Allow public read events"
  on public.events
  for select
  to anon, authenticated
  using (true);
