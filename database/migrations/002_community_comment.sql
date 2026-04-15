-- Optional: community replies on a review post. Run in Supabase SQL Editor if you want persisted comments.
-- If this table is missing, the app still shows the thread UI; fetch returns an empty list.

create table if not exists public.community_comment (
  comment_uuid uuid primary key default gen_random_uuid(),
  community_uuid uuid not null references public.community (community_uuid) on delete cascade,
  user_a_uuid uuid not null references public."user" (user_a_uuid) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint community_comment_body_nonempty check (char_length(trim(body)) > 0)
);

create index if not exists community_comment_community_uuid_created_at_idx
  on public.community_comment (community_uuid, created_at);

alter table public.community_comment enable row level security;

drop policy if exists "Allow read community_comment" on public.community_comment;
create policy "Allow read community_comment"
  on public.community_comment for select
  using (true);

drop policy if exists "Allow insert community_comment" on public.community_comment;
create policy "Allow insert community_comment"
  on public.community_comment for insert
  with check (true);
