import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { safeExternalUrl, sourcesForGame, mergeCatalogGame, mergeSources, pageCatalog, steamEntry } from '../src/services/catalogModel.mjs';
import { matchSourceRecord, validateRecords, providerPage, sourceTitle } from '../scripts/source-adapters.mjs';
import { canonicalGameTitle, sameGameTitle } from '../src/services/titleMatch.mjs';
import { steamVerdeMatches } from '../supabase/functions/resolve-game-sources/source-policy.mjs';

const json = async name => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const catalog = await json('steam-catalog-index.json');
const sources = await json('steam-sources.json');
const refs = await json('steam-external-references.json');
const games = catalog.catalog.map(entry => mergeCatalogGame(entry, null, sourcesForGame(entry.appId, sources, refs)));

test('Public list excludes unapproved games even for searches and source filtering', () => {
  assert.deepEqual(pageCatalog(games).games.map(game => game.title), ['Stardew Valley', 'Hollow Knight']);
  assert.equal(pageCatalog(games, { query: 'Cyberpunk' }).total, 0);
  assert.ok(pageCatalog(games, { filter: 'Com fontes' }).games.every(game => game.familyFriendly && game.hasSource));
});

test('Search includes descriptions, tags and Portuguese genres', () => {
  const rich = games.map(game => ({ ...game, description: game.title === 'Hollow Knight' ? 'Explore cavernas antigas.' : '' }));
  assert.equal(pageCatalog(rich, { query: 'cavernas' }).games[0].title, 'Hollow Knight');
  assert.equal(pageCatalog(games, { query: 'relaxing' }).games[0].title, 'Stardew Valley');
  assert.equal(pageCatalog(games, { filter: 'Ação' }).games[0].title, 'Hollow Knight');
});

test('Pagination and each sort are deterministic', () => {
  const first = pageCatalog(games, { limit: 1 });
  const second = pageCatalog(games, { limit: 1, cursor: first.nextCursor });
  assert.equal(first.hasMore, true);
  assert.equal(second.hasMore, false);
  assert.notEqual(first.games[0].id, second.games[0].id);
  assert.equal(pageCatalog(games, { sort: 'nome' }).games[0].title, 'Hollow Knight');
  assert.equal(pageCatalog(games, { sort: 'recentes' }).games[0].title, 'Hollow Knight');
});

test('Steam metadata and favorite IDs survive merging; untrusted sources cannot override them', () => {
  const entry = catalog.catalog.find(game => game.appId === 367520);
  const merged = mergeCatalogGame(entry, { id: 18, title: entry.title, image: 'cover.jpg', description: 'Steam description', slug: 'database-slug' }, []);
  assert.equal(merged.id, 18);
  assert.equal(merged.image, 'cover.jpg');
  assert.equal(merged.description, 'Steam description');
  assert.equal(merged.slug, 'hollow-knight');
  assert.equal(merged.hasSource, false);
});

test('Links reject executable protocols, credentials and example placeholders', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', '/relative', 'https://user:pass@example.net', 'https://pixeldrain.com/u/EXAMPLE5', 'not a URL']) {
    assert.equal(safeExternalUrl(url), null);
  }
  assert.equal(safeExternalUrl('https://github.com/AveryChangedMan/SteamRipClient'), 'https://github.com/AveryChangedMan/SteamRipClient');
});

test('Existing example downloads are disabled while pinned GitHub references are usable', () => {
  const items = sourcesForGame(367520, sources, refs);
  assert.ok(items.some(item => item.kind === 'provider_page' && new URL(item.url).hostname === 'steamrip.com'
    && item.referenceUrl.includes('/blob/') && item.referenceUrl.includes('#L')));
  assert.ok(items.filter(item => item.kind === 'external_link').every(item => item.url === null));
  assert.equal(sourcesForGame(0, sources, refs).length, 0);
});

test('Cached provider matches merge by provider without duplicating static entries', () => {
  const merged = mergeSources(
    [{ id: 'static', providerName: 'SteamRIP', url: 'https://steamrip.com/old-game/', availability: 'unknown' }],
    [
      { id: 'cache', providerName: 'SteamRIP', url: 'https://steamrip.com/current-game/', availability: 'available' },
      { id: 'fitgirl', providerName: 'FitGirl', url: 'https://fitgirl-repacks.site/game/', availability: 'unknown' },
    ],
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.find(item => item.providerName === 'SteamRIP').url, 'https://steamrip.com/current-game/');
  assert.equal(merged.find(item => item.providerName === 'SteamRIP').availability, 'available');
  assert.ok(merged.some(item => item.providerName === 'FitGirl'));
});

test('Provider pages must belong to the configured provider, never a lookalike domain', () => {
  const hosts = ['steamrip.com'];
  assert.equal(providerPage('https://steamrip.com.evil.test/game/', hosts), null);
  assert.equal(providerPage('https://steamrip.com/', hosts), null);
  assert.equal(providerPage('https://steadownload/', hosts), null);
  assert.equal(providerPage('https://steamrip.com/hollow-knight-free-download-d1/', hosts), 'https://steamrip.com/hollow-knight-free-download-d1/');
});

test('Matching never conflates sequels, editions, duplicates or contradictory app IDs', () => {
  const game = { appId: 367520, title: 'Hollow Knight' };
  assert.equal(matchSourceRecord(game, [{ name: 'Hollow Knight: Silksong' }]), null);
  assert.equal(matchSourceRecord(game, [{ name: 'Hollow Knight Deluxe Edition' }]), null);
  assert.equal(matchSourceRecord(game, [{ name: 'Hollow Knight' }, { name: 'Hollow Knight' }]), null);
  assert.equal(matchSourceRecord(game, [{ appId: 123, name: 'Hollow Knight' }]), null);
  assert.equal(matchSourceRecord(game, [{ name: 'Hollow Knight' }]).method, 'normalized-unique-title');
  assert.equal(matchSourceRecord(game, [{ appId: 367520, name: 'Localized title' }]).method, 'steam-app-id');
  assert.throws(() => validateRecords({ games: [] }));
});

test('Title matching tolerates provider noise but preserves game identity', () => {
  const steamTitle = 'The Elder Scrolls IV: Oblivion Game of the Year Edition';
  const providerTitle = 'The Elder Scrolls IV: Oblivion Game of the Year Edition (2007-2009) v1.2.0416 torrent + Tradução PT-BR [GOG/DODI Repack]';

  assert.equal(canonicalGameTitle(steamTitle), 'elder scrolls 4 oblivion goty');
  assert.equal(canonicalGameTitle(providerTitle), 'elder scrolls 4 oblivion goty');
  assert.equal(sameGameTitle(steamTitle, providerTitle), true);
  assert.equal(sameGameTitle('Resident Evil IV', 'Resident Evil 4'), true);
  assert.equal(sameGameTitle('Resident Evil 4', 'Resident Evil 5'), false);
  assert.equal(sameGameTitle('Hollow Knight', 'Hollow Knight: Silksong'), false);
  assert.equal(sameGameTitle('Hollow Knight', 'Hollow Knight Deluxe Edition'), false);
});

test('SteamVerde matcher accepts noisy release labels only for the same game', () => {
  const title = 'The Elder Scrolls IV: Oblivion Game of the Year Edition';
  const rows = [
    {
      id: 1,
      title: 'The Elder Scrolls IV: Oblivion Game of the Year Edition (2007-2009) v1.2.0416 torrent + Tradução PT-BR [GOG/DODI Repack]',
      url: 'https://steamverde.net/download/the-elder-scrolls-iv-oblivion/',
    },
    {
      id: 2,
      title: 'The Elder Scrolls V: Skyrim Special Edition torrent',
      url: 'https://steamverde.net/download/the-elder-scrolls-v-skyrim/',
    },
  ];
  assert.deepEqual(steamVerdeMatches(title, rows).map(row => row.id), [1]);
});

test('Service browses the live Supabase catalog and hydrates missing Steam searches', async () => {
  const { build } = await import('vite');
  const saved = new Set([18]);
  const calls = [];
  const sourceCache = new Map([
    [367520, {
      steam_app_id: 367520,
      sources: [{
        id: 'cached:source',
        providerName: 'Cached provider',
        url: 'https://steamrip.com/hollow-knight-free-download-d1/',
        kind: 'provider_page',
        status: 'Página externa',
        availability: 'unknown',
      }],
      checked_at: '2026-09-22T09:00:00.000Z',
      next_check_at: '2999-01-01T00:00:00.000Z',
    }],
  ]);
  const rows = [
    { id: 18, steam_app_id: 367520, slug: 'hollow-knight', title: 'Hollow Knight', short_description: 'Ancient caverns', header_image: 'cover.jpg', genres: ['Action'], steam_category_ids: [2], adult_content: false },
    { id: 9, steam_app_id: 413150, slug: 'stardew-valley', title: 'Stardew Valley', local_coop: true, steam_category_ids: [1,2,9,39], adult_content: false },
  ];
  const steamResults = {
    terraria: { id: 25, steam_app_id: 105600, slug: 'terraria', title: 'Terraria', required_age: 0, adult_content: false, content_descriptors: { ids: [] }, short_description: 'Dig, fight, explore' },
    icarus: { id: 273, steam_app_id: 1149460, slug: 'icarus', title: 'ICARUS', required_age: 10, adult_content: false, content_descriptors: { ids: [] }, short_description: 'Survive on Icarus' },
  };

  function publicRows(params = {}) {
    let result = rows.filter(row => row.adult_content !== true);
    const q = String(params.p_query ?? '').trim().toLowerCase();
    if (q) result = result.filter(row => [row.title, row.short_description].some(value => String(value ?? '').toLowerCase().includes(q)));
    const modes = params.p_filters?.modes ?? [];
    if (modes.includes('local_coop')) result = result.filter(row => (row.steam_category_ids ?? []).includes(39));
    const offset = Number(params.p_offset ?? 0);
    const limit = Number(params.p_limit ?? 21);
    return result.slice(offset, offset + limit);
  }

  globalThis.__fusionTestSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
    functions: {
      async invoke(name, options) {
        calls.push({ function: name, body: options?.body });
        return {
          data: {
            results: (options?.body?.appIds ?? []).map(appId => ({ appId, sources: sourceCache.get(appId)?.sources ?? [] })),
          },
          error: null,
        };
      },
    },
    rpc(name, params) {
      calls.push({ rpc: name, params });
      if (name === 'browse_fusion_catalog_v2') return Promise.resolve({ data: publicRows(params), error: null });
      if (name === 'search_steam_fallback_ids') {
        const key = String(params.p_query ?? '').trim().toLowerCase();
        const row = steamResults[key];
        if (row && !rows.some(item => item.steam_app_id === row.steam_app_id)) rows.push(row);
        return Promise.resolve({ data: row ? [row.steam_app_id] : [], error: null });
      }
      if (name === 'ensure_steam_game') return Promise.resolve({ data: Number(params.p_app_id), error: null });
      return Promise.resolve({ data: null, error: null });
    },
    from(table) {
      const query = { table, filters: [] };
      const chain = {
        select(fields, options) { query.fields = fields; query.count = options?.count; return chain; },
        maybeSingle() { query.single = true; return chain; },
        in(key, ids) { query.in = [key, ids]; return chain; },
        eq(key, value) { query.filters.push([key, value]); return chain; },
        order() { return chain; },
        range(from, to) { query.range = [from, to]; return chain; },
        insert(value) { query.insert = value; return chain; },
        delete() { query.remove = true; return chain; },
        then(resolve, reject) {
          calls.push(query);
          if (table === 'fusion_public_games') {
            let selected = rows.filter(row => row.adult_content !== true);
            if (query.in) selected = selected.filter(row => query.in[1].includes(row[query.in[0]]));
            selected = selected.filter(row => query.filters.every(([key, value]) => row[key] === value));
            return Promise.resolve({ data: query.single ? selected[0] ?? null : selected, error: null }).then(resolve, reject);
          }
          if (table === 'game_source_cache') {
            let selected = [...sourceCache.values()];
            selected = selected.filter(row => query.filters.every(([key, value]) => row[key] === value));
            return Promise.resolve({ data: query.single ? selected[0] ?? null : selected, error: null }).then(resolve, reject);
          }
          if (table === 'game_favorites') {
            if (query.insert) saved.add(query.insert.game_id);
            if (query.remove) saved.delete(query.filters.find(([key]) => key === 'game_id')[1]);
            let ids = [...saved];
            if (query.range) ids = ids.slice(query.range[0], query.range[1] + 1);
            const result = ids.map(game_id => ({ game_id, created_at: '2026-09-22T00:00:00Z' }));
            return Promise.resolve({ data: result, count: saved.size, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };

  const built = await build({ configFile: false, logLevel: 'silent', plugins: [{ name: 'mock-database',
    load(id) { if (id.replaceAll('\\\\', '/').endsWith('/src/lib/supabase.js')) return 'export const supabase = globalThis.__fusionTestSupabase;'; } }],
    build: { write: false, minify: false, lib: { entry: 'src/services/gameCatalog.js', formats: ['es'] }, rolldownOptions: { output: { codeSplitting: false } } } });
  const output = (Array.isArray(built) ? built : [built]).flatMap(item => item.output).find(item => item.type === 'chunk' && item.isEntry);
  const url = 'data:text/javascript;base64,' + Buffer.from(output.code).toString('base64');

  try {
    const service = await import(url);
    const initial = await service.fetchGamePage();
    assert.equal(initial.games.length, 2);
    assert.equal((await service.fetchGamePage({ query: 'caverns' })).games[0].id, 18);
    assert.equal((await service.fetchGameBySlug('hollow-knight')).image, 'cover.jpg');
    assert.equal((await service.fetchFeaturedCoop())[0].steamAppId, 413150);

    const icarus = (await service.fetchGamePage({ query: 'icarus' })).games[0];
    assert.equal(icarus.title, 'ICARUS');
    assert.equal(icarus.requiredAge, 10);
    assert.equal(calls.filter(call => call.rpc === 'search_steam_fallback_ids' && call.params.p_query === 'icarus').length, 1);

    const terraria = (await service.fetchGamePage({ query: 'terraria' })).games[0];
    assert.equal(terraria.title, 'Terraria');
    assert.equal((await service.fetchGameBySlug('terraria')).steamAppId, 105600);

    const hollowSources = await service.fetchDistributionSources(367520);
    assert.ok(hollowSources.some(source => source.url));
    assert.ok(hollowSources.some(source => source.providerName === 'Cached provider'));

    assert.equal((await service.fetchFavoritePage()).games[0].id, 18);
    await service.addFavorite(9);
    assert.equal((await service.fetchFavoritePage()).count, 2);
    await service.removeFavorite(18);
    assert.equal((await service.fetchFavoritePage()).games[0].id, 9);

    await service.fetchGamePage({ query: 'terraria' });
    assert.equal(calls.filter(call => call.rpc === 'search_steam_fallback_ids' && call.params.p_query === 'terraria').length, 1);
  } finally {
    delete globalThis.__fusionTestSupabase;
  }
});

test('Steam discovery filters mature and unknown classifications and respects curated exclusions', () => {
  const base = {steam_app_id:105600,title:'Terraria',required_age:0,adult_content:false,content_descriptors:{ids:[]}};
  assert.equal(steamEntry(base).familyFriendly,true);
  assert.equal(steamEntry({...base,required_age:18}).familyFriendly,false);
  assert.equal(steamEntry({...base,content_descriptors:{ids:[2]}}).familyFriendly,false);
  assert.equal(steamEntry({...base,content_descriptors:null}).familyFriendly,false);
  assert.equal(steamEntry(base,{familyFriendly:false}).familyFriendly,false);
  assert.equal(sourceTitle('Hollow Knight – v1.5 + bonus','fitgirl-json'),'Hollow Knight');
  assert.equal(sourceTitle('Hollow Knight: Silksong – v1.0','fitgirl-json'),'Hollow Knight: Silksong');
});
