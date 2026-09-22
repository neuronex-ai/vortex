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
  with source as (
    select lower(
      coalesce(p_content_descriptors::text, '') || ' ' ||
      coalesce(array_to_string(p_genres, ' '), '') || ' ' ||
      coalesce(p_title, '') || ' ' ||
      coalesce(p_description, '')
    ) as text_value
  )
  select case
    when text_value ~ '(porn|pornograph|erotic|erótico|erotico|adult only|somente para adultos)'
      then 'Steam metadata indicates adult-oriented sexual content'
    when text_value ~ '(sexual content|sexual material|conteúdo sexual|conteudo sexual|material sexual|sexo explícito|sexo explicito|explicit sexual)'
      then 'Steam metadata indicates sexual content'
    else null
  end
  from source;
$$;

update public.games
set
  adult_reason = public.fusion_adult_content_reason(
    title,
    coalesce(short_description, '') || ' ' || coalesce(about_game, ''),
    genres,
    content_descriptors
  ),
  adult_content = public.fusion_adult_content_reason(
    title,
    coalesce(short_description, '') || ' ' || coalesce(about_game, ''),
    genres,
    content_descriptors
  ) is not null,
  updated_at = now();

revoke all on function public.fusion_adult_content_reason(text,text,text[],jsonb)
from public, anon, authenticated;
