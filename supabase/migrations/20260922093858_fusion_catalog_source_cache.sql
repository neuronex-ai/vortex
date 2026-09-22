create table public.catalog_content_overrides (
  steam_app_id bigint primary key,
  approved boolean not null
);
alter table public.catalog_content_overrides enable row level security;
grant select on public.catalog_content_overrides to anon, authenticated;
grant all on public.catalog_content_overrides to service_role;
create policy "read catalog decisions" on public.catalog_content_overrides for select to anon, authenticated using (true);
insert into public.catalog_content_overrides values (367520,true),(413150,true),(1091500,false),(1245620,false),(1174180,false);

create view public.fusion_public_games with (security_invoker=true) as
select g.* from public.games g
left join public.catalog_content_overrides o on o.steam_app_id=g.steam_app_id
where g.is_visible and not g.adult_content
and coalesce(o.approved, g.required_age=0 and g.content_descriptors->'ids'='[]'::jsonb
  and array_to_string(g.tags || g.genres,' ') !~* '(violence|gore|nudity|sexual|strong language|adult only)');
grant select on public.fusion_public_games to anon, authenticated, service_role;

create table public.game_source_cache (
  steam_app_id bigint primary key references public.games(steam_app_id) on delete cascade,
  sources jsonb not null default '[]'::jsonb check(jsonb_typeof(sources)='array'),
  discovered_at timestamptz,
  checked_at timestamptz,
  next_check_at timestamptz not null default '-infinity',
  lease_until timestamptz,
  discovery_error text,
  updated_at timestamptz not null default now()
);
alter table public.game_source_cache enable row level security;
revoke all on public.game_source_cache from anon, authenticated;
grant select on public.game_source_cache to anon, authenticated;
grant all on public.game_source_cache to service_role;
create policy "read visible game sources" on public.game_source_cache for select to anon, authenticated
using (exists(select 1 from public.fusion_public_games g where g.steam_app_id=game_source_cache.steam_app_id));

create function public.browse_fusion_catalog(p_query text default '',p_filter text default 'Todos',p_sort text default 'popular',p_offset integer default 0,p_limit integer default 21)
returns setof public.games language sql stable security invoker set search_path='' as $$
select g.* from public.fusion_public_games g
where (coalesce(btrim(p_query),'')='' or g.search_text ilike '%'||left(p_query,80)||'%' or g.title ilike '%'||left(p_query,80)||'%')
and (p_filter='Todos' or (p_filter='Coop local' and g.local_coop)
 or (p_filter='Com fontes' and exists(select 1 from public.game_source_cache c, jsonb_array_elements(c.sources) s where c.steam_app_id=g.steam_app_id and s->>'availability' is distinct from 'unavailable' and s->>'url' is not null))
 or exists(select 1 from unnest(g.genres || g.tags) genre where lower(genre) in (lower(p_filter),case lower(p_filter) when 'ação' then 'action' when 'aventura' then 'adventure' when 'terror' then 'horror' when 'estratégia' then 'strategy' when 'simulação' then 'simulation' else lower(p_filter) end)))
order by case when p_sort='popular' then g.popularity_score end desc nulls last,
 case when p_sort='recentes' then g.release_date end desc nulls last,
 lower(g.title), g.id
limit least(greatest(p_limit,1),21) offset greatest(p_offset,0);
$$;
revoke all on function public.browse_fusion_catalog(text,text,text,integer,integer) from public;
grant execute on function public.browse_fusion_catalog(text,text,text,integer,integer) to anon, authenticated, service_role;
