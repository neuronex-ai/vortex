export function safeExternalUrl(value) {
  if (typeof value !== 'string' || /example|placeholder/i.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

const matchTitle = value => String(value ?? '').normalize('NFKC').replace(/[™®]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
export function sourcesForGame(appId, localSources, references, title = '') {
  const candidates = references.sources.filter(item => item.appId === appId
    || (item.appId == null && title && matchTitle(item.title) === matchTitle(title)));
  const unique = candidates.filter(item => candidates.filter(other => other.providerName === item.providerName).length === 1);
  const github = unique.map((item, index) => ({
    id: `github:${appId}:${index}`, providerName: item.providerName ?? item.provider,
    kind: safeExternalUrl(item.externalUrl) ? 'provider_page' : 'external_reference',
    url: safeExternalUrl(item.externalUrl),
    referenceUrl: safeExternalUrl(item.referenceUrl), projectUrl: safeExternalUrl(item.projectUrl),
    size: item.size, version: item.version, status: item.downloadType ?? 'Página de download',
    lastCheckedAt: references.checkedAt,
  }));
  const local = (localSources.sources.find(item => item.appId === appId)?.sources ?? []).flatMap(source =>
    (source.urls ?? []).map((link, index) => {
      const url = source.working === false ? null : safeExternalUrl(link.url);
      return { id: `${source.sourceId}:${index}`, providerName: source.sourceName, host: link.host,
        kind: 'external_link', url, size: link.size, parts: link.parts, lastCheckedAt: source.lastUpdated,
        status: /example|placeholder/i.test(link.url) ? 'Link de exemplo — indisponível'
          : url ? 'Fonte externa' : 'Link indisponível' };
    }));
  return [...github, ...local];
}

export function steamEntry(row, known) {
  const blocked = /violence|gore|nudity|sexual|strong language|adult only/i.test([...(row.tags ?? []), ...(row.genres ?? [])].join(' '));
  const allowed = known ? known.familyFriendly === true : row.adult_content === false
    && Number(row.required_age) === 0 && Array.isArray(row.content_descriptors?.ids)
    && row.content_descriptors.ids.length === 0 && !blocked;
  return { appId: Number(row.steam_app_id), title: row.title, slug: known?.slug ?? row.slug,
    genres: row.genres ?? [], tags: row.tags ?? [], familyFriendly: allowed,
    releaseYear: row.release_year, steamRating: known?.steamRating,
    developer: row.developers?.[0], publisher: row.publishers?.[0] };
}

export function mergeCatalogGame(entry, steam, sources) {
  return {
    id: `steam:${entry.appId}`, steamAppId: entry.appId, title: entry.title,
    description: 'Descrição não disponível.', about: '', image: null, gallery: [],
    genres: entry.genres ?? [], categories: [],
    year: entry.releaseYear, developers: [entry.developer].filter(Boolean), publishers: [entry.publisher].filter(Boolean),
    platforms: {}, requirements: {}, players: 'Modo não informado', price: 'Ver na Steam',
    metacritic: entry.metacriticScore, ...steam,
    // The reviewed index controls inclusion and stable links; Steam supplies rich metadata and database IDs.
    slug: entry.slug, familyFriendly: entry.familyFriendly === true, steamRating: entry.steamRating,
    tags: [...new Set([...(steam?.tags ?? []), ...(entry.tags ?? [])])],
    storeUrl: `https://store.steampowered.com/app/${entry.appId}/`, sources,
    hasSource: sources.some(source => Boolean(source.url)),
    size: sources.find(source => source.url && source.size)?.size ?? null,
  };
}

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const aliases = { acao: 'action', aventura: 'adventure', terror: 'horror', estrategia: 'strategy', simulacao: 'simulation', plataforma: 'platformer' };
export function pageCatalog(allGames, { query = '', filter = 'Todos', sort = 'popular', cursor = null, limit = 20 } = {}) {
  const term = normalize(query.trim());
  const genre = aliases[normalize(filter)] ?? normalize(filter);
  const games = allGames.filter(game => {
    if (!game.familyFriendly) return false;
    const text = normalize([game.title, game.description, game.about, ...game.genres, ...game.tags].join(' '));
    return (!term || text.includes(term) || text.includes(aliases[term] ?? term))
      && (filter === 'Todos' || (filter === 'Com fontes' ? game.hasSource : filter === 'Coop local' ? game.localCoop
        : [...game.genres, ...game.tags].some(item => [genre, normalize(filter)].includes(normalize(item)))));
  }).sort((a, b) => (sort === 'nome' ? 0 : sort === 'recentes' ? (b.year ?? 0) - (a.year ?? 0)
    : (b.steamRating ?? 0) - (a.steamRating ?? 0)) || a.title.localeCompare(b.title, 'pt-BR') || a.steamAppId - b.steamAppId);
  const size = Math.min(20, Math.max(1, Math.floor(Number(limit) || 20)));
  const start = Math.max(0, Math.floor(Number(cursor?.offset) || 0));
  const page = games.slice(start, start + size).map((game, index) => ({ ...game, cursor: { offset: start + index + 1 } }));
  return { games: page, total: games.length, hasMore: start + size < games.length, nextCursor: page.at(-1)?.cursor ?? null };
}
