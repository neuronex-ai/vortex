# Vortex — catálogo local de jogos

## Prévia local

No terminal desta pasta, execute:

```powershell
npm run dev
```

A prévia fica disponível em `http://localhost:8080`.

## O que foi criado

- Página inicial, catálogo pesquisável e página de detalhes de cada jogo.
- Catálogo inicial com 24 jogos e dados públicos verificados: descrição, gênero, estúdio, data, requisitos e capturas.
- Filtro que exclui jogos eróticos ou pornográficos. Jogos de ação, terror e narrativas maduras não são excluídos por essa regra.
- Interface sem anúncios, com a identidade visual escura, cartões e tipografia do Vortex.
- Consulta de disponibilidade de opções externas somente quando a fonte responde. Se ela estiver indisponível, a interface informa isso e não exibe links inventados.

## Atualizar o catálogo inicial

```powershell
npm run seed
```

Esse comando atualiza os dados verificados em `data/catalog.json` e as capas locais em `assets/games/`.

## Estrutura principal

- `server/dev.mjs`: servidor local na porta 8080 e rotas de consulta.
- `server/provider.mjs`: consulta, filtragem de conteúdo e validação de links externos.
- `data/catalog.json`: catálogo local já validado.
- `css/vortex.css` e `js/vortex.js`: visual e interações da plataforma.
- `steam-rip/upstream-scraper` e `steam-rip/upstream-catalog`: cópias dos projetos de referência baixados do GitHub.

O diretório `backups/` conserva a exportação original que serviu como referência visual. Ele não é publicado pelo servidor local.
