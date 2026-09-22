drop policy if exists "authorized distribution sources are public"
on public.game_distribution_sources;

create policy "authorized distribution sources are public"
on public.game_distribution_sources
for select
to anon, authenticated
using (
  is_visible = true
  and is_authorized = true
  and availability = 'available'
  and exists (
    select 1
    from public.games g
    where g.id = game_distribution_sources.game_id
      and g.is_visible = true
      and g.adult_content = false
  )
);
