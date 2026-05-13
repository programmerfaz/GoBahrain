-- Home feed: which posts a user saved (post + author client; minimal columns)
create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  post_uuid uuid not null references public.posts (post_uuid) on delete cascade,
  client_a_uuid uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, post_uuid)
);

create index if not exists saved_posts_user_created_idx
  on public.saved_posts (user_id, created_at desc);

alter table public.saved_posts enable row level security;

drop policy if exists "saved_posts_select_own" on public.saved_posts;
create policy "saved_posts_select_own"
on public.saved_posts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "saved_posts_insert_own" on public.saved_posts;
create policy "saved_posts_insert_own"
on public.saved_posts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "saved_posts_delete_own" on public.saved_posts;
create policy "saved_posts_delete_own"
on public.saved_posts
for delete
to authenticated
using (auth.uid() = user_id);
