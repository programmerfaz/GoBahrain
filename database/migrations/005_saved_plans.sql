-- Saved AI day plans + share-by-code (view or edit)
create table if not exists public.saved_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'My plan',
  plan_data jsonb not null default '[]'::jsonb,
  share_code text unique,
  share_permission text not null default 'view' check (share_permission in ('view', 'edit')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists saved_plans_owner_updated_idx
  on public.saved_plans (owner_id, updated_at desc);

alter table public.saved_plans enable row level security;

drop policy if exists "saved_plans_select_own" on public.saved_plans;
create policy "saved_plans_select_own"
on public.saved_plans
for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "saved_plans_insert_own" on public.saved_plans;
create policy "saved_plans_insert_own"
on public.saved_plans
for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "saved_plans_update_own" on public.saved_plans;
create policy "saved_plans_update_own"
on public.saved_plans
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "saved_plans_delete_own" on public.saved_plans;
create policy "saved_plans_delete_own"
on public.saved_plans
for delete
to authenticated
using (auth.uid() = owner_id);

-- Public read by exact share code (no row enumeration)
create or replace function public.fetch_shared_plan(p_share_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.saved_plans%rowtype;
  norm text;
begin
  norm := upper(trim(coalesce(p_share_code, '')));
  if length(norm) < 6 then
    return null;
  end if;
  select * into r from public.saved_plans where share_code = norm limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', r.id,
    'title', r.title,
    'plan_data', r.plan_data,
    'share_permission', r.share_permission,
    'owner_id', r.owner_id,
    'updated_at', r.updated_at
  );
end;
$$;

-- Collaborators may push edits when owner set share_permission = edit
create or replace function public.update_shared_plan(p_share_code text, p_plan_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  norm text;
  updated_id uuid;
begin
  norm := upper(trim(coalesce(p_share_code, '')));
  if length(norm) < 6 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  update public.saved_plans
  set plan_data = coalesce(p_plan_data, '[]'::jsonb),
      updated_at = now()
  where share_code = norm
    and share_permission = 'edit'
  returning id into updated_id;
  if updated_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found_or_view_only');
  end if;
  return jsonb_build_object('ok', true, 'id', updated_id);
end;
$$;

revoke all on function public.fetch_shared_plan(text) from public;
revoke all on function public.update_shared_plan(text, jsonb) from public;

grant execute on function public.fetch_shared_plan(text) to anon, authenticated;
grant execute on function public.update_shared_plan(text, jsonb) to anon, authenticated;
