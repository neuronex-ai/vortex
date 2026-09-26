create table if not exists public.fusion_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text null check (title is null or char_length(title) <= 160),
  model text not null default 'gpt-5.6-luna',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (id, user_id)
);

create index if not exists fusion_ai_conversations_user_recent_idx
  on public.fusion_ai_conversations (user_id, last_message_at desc);

alter table public.fusion_ai_conversations enable row level security;

revoke all on table public.fusion_ai_conversations from anon;
revoke all on table public.fusion_ai_conversations from authenticated;
grant select, insert, update, delete on table public.fusion_ai_conversations to authenticated;

drop policy if exists fusion_ai_conversations_select_own on public.fusion_ai_conversations;
create policy fusion_ai_conversations_select_own
  on public.fusion_ai_conversations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists fusion_ai_conversations_insert_own on public.fusion_ai_conversations;
create policy fusion_ai_conversations_insert_own
  on public.fusion_ai_conversations
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists fusion_ai_conversations_update_own on public.fusion_ai_conversations;
create policy fusion_ai_conversations_update_own
  on public.fusion_ai_conversations
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists fusion_ai_conversations_delete_own on public.fusion_ai_conversations;
create policy fusion_ai_conversations_delete_own
  on public.fusion_ai_conversations
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.fusion_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null check (char_length(content) > 0 and char_length(content) <= 50000),
  model text null,
  latency_ms integer null check (latency_ms is null or latency_ms >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint fusion_ai_messages_conversation_owner_fkey
    foreign key (conversation_id, user_id)
    references public.fusion_ai_conversations(id, user_id)
    on delete cascade
);

create index if not exists fusion_ai_messages_conversation_created_idx
  on public.fusion_ai_messages (conversation_id, created_at asc);
create index if not exists fusion_ai_messages_user_created_idx
  on public.fusion_ai_messages (user_id, created_at desc);
create index if not exists fusion_ai_messages_conversation_owner_idx
  on public.fusion_ai_messages (conversation_id, user_id);

alter table public.fusion_ai_messages enable row level security;

revoke all on table public.fusion_ai_messages from anon;
revoke all on table public.fusion_ai_messages from authenticated;
grant select, insert, update, delete on table public.fusion_ai_messages to authenticated;

drop policy if exists fusion_ai_messages_select_own on public.fusion_ai_messages;
create policy fusion_ai_messages_select_own
  on public.fusion_ai_messages
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists fusion_ai_messages_insert_own on public.fusion_ai_messages;
create policy fusion_ai_messages_insert_own
  on public.fusion_ai_messages
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists fusion_ai_messages_update_own on public.fusion_ai_messages;
create policy fusion_ai_messages_update_own
  on public.fusion_ai_messages
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists fusion_ai_messages_delete_own on public.fusion_ai_messages;
create policy fusion_ai_messages_delete_own
  on public.fusion_ai_messages
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
