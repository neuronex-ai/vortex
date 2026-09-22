create policy "clients cannot read sync runs"
on public.game_sync_runs
for select
to anon, authenticated
using (false);

create policy "clients cannot write sync runs"
on public.game_sync_runs
for all
to anon, authenticated
using (false)
with check (false);
