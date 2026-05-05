-- Public business phone for client profile views (phone lives on account; direct account SELECT is owner-only).
-- Run in Supabase SQL editor or via migration workflow.

create or replace function public.get_client_public_contact(p_client_a_uuid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'phone', nullif(trim(coalesce(a.phone, '')), '')
  )
  from public.client c
  join public.account a on a.account_uuid = c.account_a_uuid and a.account_type = 'client'::public.account_type
  where c.client_a_uuid = p_client_a_uuid
  limit 1;
$$;

grant execute on function public.get_client_public_contact(uuid) to anon;
grant execute on function public.get_client_public_contact(uuid) to authenticated;
