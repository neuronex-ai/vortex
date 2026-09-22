create extension if not exists http with schema extensions;

alter table public.games
  add column if not exists content_descriptors jsonb not null default '{}'::jsonb,
  add column if not exists steam_store_url text;

create or replace function public.fusion_adult_content_reason(
  p_title text,
  p_description text,
  p_genres text[],
  p_content_descriptors jsonb
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when coalesce(p_content_descriptors::text, '') ~* '(sexual|nudity|nude|erotic|porn|sexo|sexual|nudez|conteúdo adulto|adult only)'
      then 'Steam content descriptors indicate sexual/adult content'
    when array_to_string(coalesce(p_genres, '{}'::text[]), ' ') ~* '(sexual|nudity|erotic|adult)'
      then 'Steam genre metadata indicates sexual/adult content'
    when (coalesce(p_title, '') || ' ' || coalesce(p_description, '')) ~* '(pornographic|explicit sexual content|conteúdo sexual explícito|adult only)'
      then 'Store description indicates explicit sexual/adult content'
    else null
  end;
$$;

revoke all on function public.fusion_adult_content_reason(text,text,text[],jsonb) from public;
