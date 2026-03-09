-- Seed guest user for community posts (FK community_user_a_uuid_fkey).
-- Run once in Supabase SQL Editor if you get "Key is not present in table \"user\"" when posting as guest.
-- Uses the same UUID as in src/services/community.js GUEST_USER_UUID (or EXPO_PUBLIC_GUEST_USER_UUID).

do $$
declare
  v_guest_user_uuid uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0003';
  v_guest_account_uuid uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001';
begin
  if not exists (select 1 from public."user" where user_a_uuid = v_guest_user_uuid) then
    insert into public.account (account_uuid, email, account_type)
    values (v_guest_account_uuid, 'guest@gobahrain.local', 'user')
    on conflict (account_uuid) do nothing;

    insert into public."user" (user_a_uuid, account_uuid, u_type)
    values (v_guest_user_uuid, v_guest_account_uuid, 'local'::public.user_u_type)
    on conflict (user_a_uuid) do nothing;

    raise notice 'Guest user seeded: %', v_guest_user_uuid;
  end if;
end $$;
