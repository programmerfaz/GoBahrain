create table if not exists public.user_personalization (
  user_id uuid primary key references auth.users (id) on delete cascade,
  persona_summary text,
  general_ids text[] not null default '{}',
  activity_ids text[] not null default '{}',
  food_ids text[] not null default '{}',
  profile_answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_personalization enable row level security;

drop policy if exists "user_personalization_select_own" on public.user_personalization;
create policy "user_personalization_select_own"
on public.user_personalization
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_personalization_upsert_own" on public.user_personalization;
create policy "user_personalization_upsert_own"
on public.user_personalization
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_personalization_update_own" on public.user_personalization;
create policy "user_personalization_update_own"
on public.user_personalization
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
