# Steam Catalog Data - Fusion

Este diretóºººrio contém arquivos JSON estruturados com dados de jogos para o aplicativo **Fusion**.

## Visãººo Geral

Os arquivos são organizados em camadas:

1. **Dados brutos** (master)
2. **Dados filtrados** (family-friendly)
3. **Fontes externas** (links de download)
4. **Íºndice unificado** (pronto para consumo do app)

---

## Estrutura dos Arquivos

### 1. `steam-games-master.json`

**Propóºººsito:** Lista completa de todos os jogos (sem filtro).

**Campos principais:**

```json
{
  "appId": 367520,
  "title": "Hollow Knight",
  "slug": "hollow-knight",
  "releaseYear": 2017,
  "genres": ["Action", "Platformer", "Indie"],
  "developer": "Team Cherry",
  "publisher": "Team Cherry",
  "steamRating": 97,
  "metacriticScore": 90,
  "tags": ["Metroidvania", "Indie", "Great Soundtrack"],
  "contentWarnings": [],
  "familyFriendly": true,
  "createdAt": "2026-09-22T00:00:00Z",
  "updatedAt": "2026-09-22T00:00:00Z"
}
```

**Quando usar:** Quando precisar de acesso a todos os jogos (ex.: admin, curadoria).

---

### 2. `steam-family-friendly.json`

**Propóºººsito:** Lista filtrada só com jogos adequados para todo p úblico.

**Crit érios de filtro:**

- `familyFriendly: true`
- Sem tags como: "Violence", "Sexual Content", "Strong Language", "Gore", "Nudity"

**Campos principais:**

Mesmos campos do `steam-games-master.json`, mas só com jogos filtrados.

**Quando usar:** Interface p ública do app (p ágina inicial, busca, etc.).

---

### 3. `steam-sources.json`

**Propóºººsito:** Links de fontes externas (SteamRIP e outros).

**Campos principais:**

```json
{
  "appId": 367520,
  "title": "Hollow Knight",
  "sources": [
    {
      "sourceId": "steamrip-003",
      "sourceName": "SteamRIP",
      "sourceType": "direct_download",
      "urls": [
        {
          "host": "Pixeldrain",
          "url": "https://pixeldrain.com/u/EXAMPLE5",
          "size": "4.2 GB",
          "parts": 1
        }
      ],
      "crackGroup": "GOG",
      "emulator": "None (DRM-Free)",
      "languages": ["English", "Portuguese-Brazil"],
      "lastUpdated": "2026-09-10T00:00:00Z",
      "verified": true,
      "working": true
    }
  ]
}
```

**Quando usar:** P ágina de detalhes do jogo (bot ão de download).

---

### 4. `steam-catalog-index.json`

**Propóºººsito:** Índice unificado pronto para consumo do app.

**Campos principais:**

```json
{
  "appId": 367520,
  "title": "Hollow Knight",
  "slug": "hollow-knight",
  "releaseYear": 2017,
  "genres": ["Action", "Platformer", "Indie"],
  "developer": "Team Cherry",
  "steamRating": 97,
  "familyFriendly": true,
  "hasSource": true,
  "sourceInfo": {
    "sourceName": "SteamRIP",
    "crackGroup": "GOG",
    "emulator": "None (DRM-Free)",
    "verified": true,
    "working": true,
    "lastUpdated": "2026-09-10T00:00:00Z",
    "totalUrls": 1
  },
  "tags": ["Metroidvania", "Indie", "Great Soundtrack"]
}
```

**Quando usar:** **Este é o arquivo principal** que o app deve consumir.

---

## Como Atualizar os Dados

### Opçºº ão 1: Script Autom ático (Recomendado)

1. Rode o script Python `generate-catalog.py` (ainda n ão criado).
2. Ele vai:
   - Scrape da Steam API.
   - Scrape do SteamRIP (ou leitura de JSONs existentes).
   - Aplicar filtros family-friendly.
   - Gerar os 4 JSONs.

### Opçºº ão 2: Manual

1. Edite os JSONs diretamente.
2. Mantenha o `appId` como chave ú nica.
3. Atualize o campo `updatedAt` sempre que mudar algo.

---

## Como o App Consome

**Fluxo sugerido:**

1. **Inicializaçºº ão:** O app carrega `steam-catalog-index.json`.
2. **Listagem:** Mostra s ó jogos com `familyFriendly: true`.
3. **Busca:** Filtra pelo campo `title`, `genres`, `tags`.
4. **Detalhes:** Ao clicar em um jogo:
   - Busca no `steam-sources.json` pelo `appId`.
   - Mostra os links de download (se `hasSource: true`).

---

## Disclaimer

> Este arquivo contém links para fontes externas p úblicas. O Fusion n ão hospeda, distribui ou endossa nenhum conteúdo. Todos os links são de responsabilidade de terceiros.

---

## Pr óximos Passos

1. Subir esses JSONs para o reposit ório do Fusion.
2. Pedir para a IA integrar a leitura desses arquivos no app.
3. Criar um script de atualizaçºº ão autom ática (opcional).

---

**Úºltima atualizaçºº ão:** 2026-09-22
