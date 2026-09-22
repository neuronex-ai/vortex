import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { safeExternalUrl, sourcesForGame, mergeCatalogGame, mergeSources, pageCatalog, steamEntry } from '../src/services/catalogModel.mjs';
import { matchSourceRecord, validateRecords, providerPage, sourceTitle } from '../scripts/source-adapters.mjs';

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
  assert.equal(matchSourceRecord(game, [{ name: 'Hollow Knight' }]).method, 'exact-unique-title');
  assert.equal(matchSourceRecord(game, [{ appId: 367520, name: 'Localized title' }]).method, 'steam-app-id');
  assert.throws(() => validateRecords({ games: [] }));
});

test('Service integrates metadata, deep links, sources and account favorites using database IDs', async () => {
  const { build } = await import('vite');
  const saved = new Set([18]);
  const calls = [];
  const sourceCache = new Map([
    [367520, {
      steam_app_id: 367520,
      sources: [{
        id: 'steamverde:cached',
        providerName: 'SteamVerde',
        url: 'https://steamverde.net/download/hollow-knight/',
        kind: 'provider_page',
        status: 'Página externa',
        availability: 'unknown',
      }],
      checked_at: '2026-09-22T09:00:00.000Z',
      next_check_at: '2999-01-01T00:00:00.000Z',
    }],
  ]);
  const rows = [{ id: 18, steam_app_id: 367520, title: 'Hollow Knight', short_description: 'Ancient caverns', header_image: 'cover.jpg', genres: ['Action'] },
    { id: 9, steam_app_id: 413150, title: 'Stardew Valley', local_coop: true },
    { id: 25, steam_app_id: 105600, title: 'Terraria', slug: 'terraria', required_age: 0, adult_content: false, content_descriptors: { ids: [] }, short_description: 'Dig, fight, explore' }];
  let offline = false;
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
      calls.push({rpc: name, params});
      return { abortSignal: async () => ({ data: params.p_query === 'terraria' ? [105600] : [367520], error: null }) };
    },
    from(table) {
      const query = { table, filters: [] };
      const chain = {
        maybeSingle() { query.single = true; return chain; },
        select() { return chain; }, in(key, ids) { query.ids = ids; return chain; },
        eq(key, value) { query.filters.push([key, value]); return chain; },
        order() { return chain; }, range(from, to) { query.range = [from, to]; return chain; },
        abortSignal() { return chain; },
        insert(value) { query.insert = value; return chain; }, delete() { query.remove = true; return chain; },
        then(resolve, reject) {
          calls.push(query);
          if (table === 'games') {
            const selected = rows.filter(row => (!query.ids || query.ids.includes(row.steam_app_id)) && query.filters.every(([key,value]) => row[key] === value));
            return Promise.resolve({ data: query.single ? selected[0] ?? null : selected, error: offline ? new Error('offline') : null }).then(resolve, reject);
          }
          if (table === 'game_source_cache') {
            const selected = [...sourceCache.values()].filter(row => (!query.ids || query.ids.includes(row.steam_app_id))
              && query.filters.every(([key, value]) => row[key] === value));
            return Promise.resolve({ data: query.single ? selected[0] ?? null : selected, error: offline ? new Error('offline') : null }).then(resolve, reject);
          }
          if (offline) return Promise.resolve({error:new Error('offline')}).then(resolve,reject);
          assert.ok(query.insert?.user_id === 'test-user' || query.filters.some(([key, value]) => key === 'user_id' && value === 'test-user'));
          if (query.insert) saved.add(query.insert.game_id);
          if (query.remove) saved.delete(query.filters.find(([key]) => key === 'game_id')[1]);
          const result = [...saved].filter(id => !query.ids || query.ids.includes(id)).map(game_id => ({ game_id, games: rows.find(row => row.id === game_id) }));
          return Promise.resolve({ data: result, count: result.length, error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const built = await build({ configFile: false, logLevel: 'silent', plugins: [{ name: 'mock-database',
    load(id) { if (id.replaceAll('\\', '/').endsWith('/src/lib/supabase.js')) return 'export const supabase = globalThis.__fusionTestSupabase;'; } }],
    build: { write: false, minify: false, lib: { entry: 'src/services/gameCatalog.js', formats: ['es'] }, rolldownOptions: { output: { codeSplitting: false } } } });
  const output = (Array.isArray(built) ? built : [built]).flatMap(item => item.output).find(item => item.type === 'chunk' && item.isEntry);
  const url = 'data:text/javascript;base64,' + Buffer.from(output.code).toString('base64');
  try {
    const service = await import(url);
    assert.equal((await service.fetchGamePage({ query: 'caverns' })).games[0].id, 18);
    assert.equal(await service.fetchGameBySlug('cyberpunk-2077'), null);
    assert.equal((await service.fetchGameBySlug('hollow-knight')).image, 'cover.jpg');
    assert.equal((await service.fetchFeaturedCoop())[0].steamAppId, 413150);
    const hollowSources = await service.fetchDistributionSources(367520);
    assert.ok(hollowSources.some(source => source.url));
    assert.ok(hollowSources.some(source => source.providerName === 'SteamVerde' && source.availability === 'unknown'));
    assert.equal((await service.fetchFavoritePage()).games[0].id, 18);
    await service.addFavorite(9);
    assert.equal((await service.fetchFavoritePage()).count, 2);
    await service.removeFavorite(18);
    assert.equal((await service.fetchFavoritePage()).games[0].id, 9);
    const newGame = (await service.fetchGamePage({query:'terraria'})).games[0];
    assert.equal(newGame.title, 'Terraria');
    assert.equal(newGame.id, 25);
    assert.ok(newGame.sources.some(source => source.providerName === 'FitGirl' && source.url));
    await service.addFavorite(25);
    assert.ok((await service.fetchFavoritePage()).games.some(game => game.id === 25));
    assert.equal((await service.fetchGameBySlug('terraria')).steamAppId, 105600);
    await service.fetchGamePage({query:'terraria'});
    assert.equal(calls.filter(call => call.rpc && call.params.p_query === 'terraria').length, 1);
    offline = true;
    const fallback = await import(url + '#offline');
    const page = await fallback.fetchGamePage();
    assert.equal(page.metadataUnavailable, true);
    assert.equal(page.games.length, 2);
    await assert.rejects(() => fallback.addFavorite(page.games[0].id));
    await assert.rejects(() => fallback.fetchFavoritePage());
  } finally { delete globalThis.__fusionTestSupabase; }
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
