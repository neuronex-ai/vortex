# Fusion + Supabase

Projeto Cloud: `Fusion - Game App Search`

## Estado atual

O catálogo público usa a tabela `public.games` e o RPC `public.search_games`.

- RLS habilitado.
- Cliente web possui somente leitura do catálogo seguro.
- Jogos marcados como `adult_content = true` não são retornados ao navegador.
- Paginação server-side limitada a no máximo 20 jogos por chamada.
- Sincronização Steam ocorre somente do lado do servidor.
- `game_sync_runs` registra execuções de sincronização e não é exposto ao cliente.

## Migrações aplicadas no Cloud

1. `20260922064729_create_fusion_game_catalog`
2. `20260922064904_add_steam_store_sync`
3. `20260922065035_fix_steam_sync_metadata`
4. `20260922065224_upgrade_catalog_search_pagination`
5. `add_secure_steam_batch_sync`
6. `lock_down_sync_runs`

## Fluxo de dados

```text
Steam Store metadata
        ↓
sync_steam_app / sync_steam_apps
        ↓
Supabase Postgres
        ↓
RLS + search_games
        ↓
Fusion React (/app/)
```

A descoberta em escala do catálogo Steam será adicionada em uma fase posterior usando uma Steam Web API key no servidor. Nenhuma chave privilegiada deve ir para o React.
