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


## Configuração manual do secret Steam

O conector de automação não injeta credenciais brutas no projeto. No Dashboard do Supabase:

1. Abra **Database → Vault**.
2. Crie um novo secret.
3. Nome: `steam_web_api_key`.
4. Valor: a sua Steam Web API key.
5. Salve.

Depois disso, a função `public.discover_steam_catalog_page` e a Edge Function `discover-steam-catalog` passam a conseguir ler a chave somente no servidor.

Não coloque essa chave em `.env` exposto ao Vite, no GitHub ou em qualquer arquivo servido ao navegador.

## Execução administrativa

Além das Edge Functions, existe o RPC server-side:

`public.discover_steam_catalog_page(last_appid, max_results, if_modified_since)`

Ele usa a chave do Vault e alimenta `steam_catalog_apps`. O limite interno usado pelo Fusion é 5.000 App IDs por chamada, mesmo que a API oficial aceite lotes maiores, para manter as execuções previsíveis.


## Agendamento automático

O Supabase Cron mantém o catálogo em movimento sem depender do navegador:

- `fusion-steam-discovery`: a cada 10 minutos, descobre até 5.000 App IDs durante a primeira varredura.
- `fusion-steam-details`: a cada 5 minutos, sincroniza até 20 jogos pendentes.
- `fusion-cron-history-cleanup`: remove histórico de Cron com mais de 7 dias.

Depois que a primeira varredura completa termina, a descoberta passa a usar `if_modified_since` em atualização incremental diária. Registros cujo `last_modified` ou `price_change_number` mudou voltam automaticamente para a fila de detalhes.
