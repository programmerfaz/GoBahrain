-- Community feed: return recently shared plans for the "Loved by People" section.
-- Uses SECURITY DEFINER to bypass per-user RLS on saved_plans.
-- Only surfaces plans with share_code set (owner explicitly shared) and ≥ 2 stops.

create or replace function public.fetch_community_feed_plans(p_limit int default 12)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select coalesce(jsonb_agg(row_json order by row_json->>'updated_at' desc), '[]'::jsonb)
  into result
  from (
    select jsonb_build_object(
      'id',          sp.id,
      'title',       sp.title,
      'plan_data',   sp.plan_data,
      'owner_id',    sp.owner_id,
      'updated_at',  sp.updated_at,
      'created_at',  sp.created_at
    ) as row_json
    from public.saved_plans sp
    where sp.share_code is not null
      and jsonb_array_length(sp.plan_data) >= 2
    order by sp.updated_at desc
    limit p_limit
  ) sub;

  return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.fetch_community_feed_plans(int) from public;
grant execute on function public.fetch_community_feed_plans(int) to anon, authenticated;
