export function safeExternalUrl(value) {
  if (typeof value !== 'string' || /example|placeholder/i.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function sourcesForGame(appId, localSources, references) {
  const github = references.sources.filter(item => item.appId === appId).map((item, index) => ({
    id: `github:${appId}:${index}`, providerName: item.provider, kind: 'external_reference',
    url: safeExternalUrl(item.referenceUrl), projectUrl: safeExternalUrl(item.projectUrl),
    size: item.size, version: item.version, status: 'Informação no GitHub',
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

export function mergeCatalogGame(entry, steam, sources) {
  return {
    id: `steam:${entry.appId}`, steamAppId: entry.appId, slug: entry.slug, title: entry.title,
    description: 'Descrição não disponível.', about: '', image: null, gallery: [],
    genres: entry.genres ?? [], tags: entry.tags ?? [], categories: [],
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
