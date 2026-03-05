-- Run the ENTIRE file in Supabase: Dashboard → SQL Editor → New query → paste all → Run.
-- Required so signup creates rows in account + user/client. Run after account, user, client tables exist.
--
-- 1) Enums for account type and user type (local/tourist)
do $$ begin
  create type public.account_type as enum ('user', 'client');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.user_u_type as enum ('local', 'tourist');
exception
  when duplicate_object then null;
end $$;

-- 2) Link account to Supabase Auth: add auth_user_id (run only if column does not exist)
do $$ begin
  alter table public.account add column auth_user_id uuid unique references auth.users(id) on delete cascade;
exception
  when duplicate_column then null;
end $$;

do $$ begin
  alter table public.account add column account_type public.account_type;
exception
  when duplicate_column then null;
end $$;

-- Backfill existing rows if any (set account_type to 'user' where null)
update public.account set account_type = 'user' where account_type is null;
alter table public.account alter column account_type set not null;

-- 3) If user.u_type is still text, you can keep it and cast in RPCs; or convert to enum:
-- alter table public."user" alter column u_type type public.user_u_type using u_type::public.user_u_type;

-- 4) ensure_user_profile: create account + user row for the current auth user (after signUp)
create or replace function public.ensure_user_profile(
  p_user_name text,
  p_phone text,
  p_u_type text default 'local'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_email text;
  v_account_uuid uuid;
begin
  if v_auth_id is null then
    raise exception 'Not authenticated';
  end if;
  select email into v_email from auth.users where id = v_auth_id;
  if v_email is null then
    raise exception 'User email not found';
  end if;

  if exists (select 1 from public.account where auth_user_id = v_auth_id) then
    return;
  end if;

  insert into public.account (auth_user_id, email, user_name, phone, account_type)
  values (v_auth_id, v_email, nullif(trim(p_user_name), ''), nullif(trim(p_phone), ''), 'user')
  returning account_uuid into v_account_uuid;

  insert into public."user" (account_uuid, u_type)
  values (
    v_account_uuid,
    case lower(coalesce(nullif(trim(p_u_type), ''), 'local'))
      when 'tourist' then 'tourist'::public.user_u_type
      else 'local'::public.user_u_type
    end
  );
end;
$$;

-- 5) ensure_client_profile: create account + client row for the current auth user
create or replace function public.ensure_client_profile(
  p_user_name text,
  p_phone text,
  p_business_name text,
  p_description text,
  p_client_type text default 'place'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_email text;
  v_account_uuid uuid;
begin
  if v_auth_id is null then
    raise exception 'Not authenticated';
  end if;
  select email into v_email from auth.users where id = v_auth_id;
  if v_email is null then
    raise exception 'User email not found';
  end if;

  if exists (select 1 from public.account where auth_user_id = v_auth_id) then
    return;
  end if;

  insert into public.account (auth_user_id, email, user_name, phone, account_type)
  values (v_auth_id, v_email, nullif(trim(p_user_name), ''), nullif(trim(p_phone), ''), 'client')
  returning account_uuid into v_account_uuid;

  insert into public.client (account_a_uuid, business_name, description, client_type)
  values (v_account_uuid, nullif(trim(p_business_name), ''), nullif(trim(p_description), ''), p_client_type::public.client_type);
end;
$$;

-- 6) get_my_profile: return one row with account + user or client for current auth user
create or replace function public.get_my_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_auth_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'account', row_to_json(a),
    'user', case when a.account_type = 'user' then row_to_json(u) else null end,
    'client', case when a.account_type = 'client' then row_to_json(c) else null end,
    'account_type', a.account_type
  ) into v_result
  from public.account a
  left join public."user" u on u.account_uuid = a.account_uuid
  left join public.client c on c.account_a_uuid = a.account_uuid
  where a.auth_user_id = v_auth_id;

  return v_result;
end;
$$;

-- 7) RLS (optional but recommended): allow users to read/update only their own account/user or client
alter table public.account enable row level security;
alter table public."user" enable row level security;
alter table public.client enable row level security;

create policy "Users can read own account"
  on public.account for select
  using (auth_user_id = auth.uid());

create policy "Users can update own account"
  on public.account for update
  using (auth_user_id = auth.uid());

create policy "Users can read own user row"
  on public."user" for select
  using (exists (select 1 from public.account where account_uuid = "user".account_uuid and auth_user_id = auth.uid()));

create policy "Users can update own user row"
  on public."user" for update
  using (exists (select 1 from public.account where account_uuid = "user".account_uuid and auth_user_id = auth.uid()));

create policy "Users can read own client row"
  on public.client for select
  using (exists (select 1 from public.account where account_uuid = client.account_a_uuid and auth_user_id = auth.uid()));

create policy "Users can update own client row"
  on public.client for update
  using (exists (select 1 from public.account where account_uuid = client.account_a_uuid and auth_user_id = auth.uid()));

-- Service role / anon can insert via RPC (ensure_* runs as definer), so no insert policies needed for normal signup flow.

-- 8) Allow app (anon + authenticated) to call the RPCs
grant execute on function public.ensure_user_profile(text, text, text) to anon;
grant execute on function public.ensure_user_profile(text, text, text) to authenticated;
grant execute on function public.ensure_client_profile(text, text, text, text, text) to anon;
grant execute on function public.ensure_client_profile(text, text, text, text, text) to authenticated;
grant execute on function public.get_my_profile() to anon;
grant execute on function public.get_my_profile() to authenticated;

-- Verify: run this in SQL Editor to confirm account has auth_user_id:
-- select column_name from information_schema.columns where table_schema = 'public' and table_name = 'account' and column_name = 'auth_user_id';
