# Fusion + Supabase

Projeto Cloud: `Fusion - Game App Search`

## Catálogo

O catálogo público usa `public.games` e o RPC `public.search_games`.

- RLS habilitado.
- Cliente web possui somente leitura do catálogo seguro.
- Jogos com `adult_content = true` não são retornados.
- Paginação server-side limitada a 20 jogos por chamada.
- Metadados detalhados são sincronizados da Steam no servidor.

## Descoberta Steam

A descoberta em escala usa o método oficial `IStoreService/GetAppList`.

Fluxo:

```text
Steam GetAppList
      ↓
discover-steam-catalog
      ↓
steam_catalog_apps (fila)
      ↓
sync-steam-details
      ↓
sync_steam_apps / sync_steam_app
      ↓
games
      ↓
RLS + search_games
      ↓
Fusion React
```

A chave Steam deve existir no Supabase Vault com o nome:

```text
steam_web_api_key
```

Ela nunca deve ser adicionada ao Git ou ao Vite.

## Fontes de distribuição

`public.game_distribution_sources` separa metadados de catálogo das fontes onde um jogo pode ser obtido.

Tipos aceitos:

- `official_store`
- `official_demo`
- `freeware`
- `open_source_release`
- `authorized_download`
- `publisher_download`

O cliente só consegue ler fontes com `is_authorized = true`, `is_visible = true` e cujo jogo também esteja liberado pela política do catálogo.

## Edge Functions

- `discover-steam-catalog` — descobre App IDs oficiais em lotes.
- `sync-steam-details` — sincroniza até 50 jogos pendentes por chamada.

As duas exigem JWT com role `service_role` e não são chamadas pelo navegador.
