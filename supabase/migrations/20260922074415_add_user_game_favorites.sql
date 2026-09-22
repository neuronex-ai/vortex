create table public.game_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id bigint not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.game_favorites enable row level security;

revoke all on table public.game_favorites from anon, authenticated;
grant select, insert, delete on table public.game_favorites to authenticated;

create policy "users read their own game favorites"
on public.game_favorites
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users add their own game favorites"
on public.game_favorites
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users remove their own game favorites"
on public.game_favorites
for delete
to authenticated
using ((select auth.uid()) = user_id);
