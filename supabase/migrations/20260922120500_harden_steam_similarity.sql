-- Keep Steam recommendation access behind the Edge Function/service role.

drop policy if exists "clients cannot read steam tag dictionary" on public.steam_tag_dictionary;
create policy "clients cannot read steam tag dictionary"
on public.steam_tag_dictionary
for select
to anon, authenticated
using (false);

create or replace function public.steam_more_like_this_ids(
  p_app_id bigint,
  p_count integer default 24
)
returns bigint[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_input jsonb;
  v_status integer;
  v_payload jsonb;
  v_ids bigint[] := '{}'::bigint[];
  v_id bigint;
  v_count integer := least(greatest(coalesce(p_count, 24), 1), 30);
begin
  if p_app_id is null or p_app_id <= 0 then
    return '{}'::bigint[];
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'steam_web_api_key'
  limit 1;

  if nullif(v_key, '') is null then
    return '{}'::bigint[];
  end if;

  v_input := jsonb_build_object(
    'item_id', jsonb_build_object('appid', p_app_id),
    'context', jsonb_build_object('language', 'brazilian', 'country_code', 'BR'),
    'data_request', jsonb_build_object('include_basic_info', true, 'include_tag_count', 20),
    'count', v_count
  );

  select h.status, h.content::jsonb
    into v_status, v_payload
  from extensions.http_get(
    'https://api.steampowered.com/IStoreQueryService/MoreLikeThis/v1/?key=' ||
    extensions.urlencode(v_key::varchar) ||
    '&input_json=' || extensions.urlencode(v_input::text::varchar)
  ) h;

  if v_status = 200 then
    select coalesce(array_agg(app_id order by ord), '{}'::bigint[])
      into v_ids
    from (
      select
        coalesce(nullif(item ->> 'appid', '')::bigint, nullif(item ->> 'id', '')::bigint) as app_id,
        ord
      from jsonb_array_elements(coalesce(v_payload #> '{response,store_items}', '[]'::jsonb))
      with ordinality x(item, ord)
      where coalesce(nullif(item ->> 'appid', ''), nullif(item ->> 'id', '')) is not null
      order by ord
      limit v_count
    ) q
    where app_id <> p_app_id;
  end if;

  if cardinality(v_ids) = 0 then
    select coalesce(array_agg(ranked.steam_app_id order by ranked.position), '{}'::bigint[])
      into v_ids
    from (
      select
        g.steam_app_id,
        row_number() over (
          order by
            (
              select count(*)
              from unnest(g.tags) gt
              where gt = any(ref.tags)
            ) desc,
            (
              select count(*)
              from unnest(g.genres) gg
              where gg = any(ref.genres)
            ) desc,
            g.popularity_score desc,
            g.steam_app_id
        ) as position
      from public.fusion_public_games g
      cross join lateral (
        select r.tags, r.genres
        from public.fusion_public_games r
        where r.steam_app_id = p_app_id
      ) ref
      where g.steam_app_id <> p_app_id
      order by position
      limit v_count
    ) ranked;
  end if;

  foreach v_id in array v_ids loop
    if not exists (select 1 from public.games where steam_app_id = v_id) then
      perform public.sync_steam_app(v_id);
    end if;
  end loop;

  if cardinality(v_ids) > 0 then
    perform public.enrich_steam_store_metadata(v_ids);
  end if;

  return v_ids;
end;
$$;

revoke all on function public.steam_more_like_this_ids(bigint,integer)
from public, anon, authenticated;

grant execute on function public.steam_more_like_this_ids(bigint,integer)
to service_role;
