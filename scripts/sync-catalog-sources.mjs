import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateRecords, providerPage, sourceTitle } from './source-adapters.mjs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('data/github-source-providers.json', root), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('data/steam-catalog-index.json', root), 'utf8'));
const sources = [];
const reports = [];
for (const provider of config.providers.filter(item => item.enabled)) {
  if (!['steamrip-client-json', 'fitgirl-json'].includes(provider.adapter) || !/^[\da-f]{40}$/.test(provider.commit)
    || !/^[\w-]+\/[\w.-]+$/.test(provider.repository) || provider.path.includes('..')) {
    throw new Error('Configuração de fonte inválida.');
  }
  const rawUrl = `https://raw.githubusercontent.com/${provider.repository}/${provider.commit}/${provider.path}`;
  const response = await fetch(rawUrl, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) throw new Error(`GitHub retornou ${response.status}; dados anteriores preservados.`);
  const text = await response.text();
  if (Buffer.byteLength(text) > 20_000_000) throw new Error('Fonte excede o limite de tamanho.');
  const records = validateRecords(JSON.parse(text));
  let matched = 0;
  for (const row of records) {
    const title = sourceTitle(row.name, provider.adapter);
    const externalUrl = providerPage(row.link, provider.allowedHosts ?? []);
    if (!externalUrl) continue;
    const game = catalog.catalog.find(game => game.title.toLowerCase() === title.toLowerCase());
    const literal = JSON.stringify(row.name);
    const positions = [...text.matchAll(new RegExp('"name"\\s*:\\s*' + literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))];
    if (positions.length !== 1) continue;
    const line = text.slice(0, positions[0].index).split('\n').length;
    sources.push({ appId: game?.appId ?? null, title, provider: provider.name,
      projectUrl: `https://github.com/${provider.repository}`,
      providerName: provider.providerName,
      externalUrl,
      downloadType: provider.adapter === "fitgirl-json" ? "Torrent na página externa" : "Página de download",
      referenceUrl: `https://github.com/${provider.repository}/blob/${provider.commit}/${provider.path}#L${line}`,
      matchMethod: "exact-unique-title", sourceTitle: row.name,
      size: row.game_size ?? row.packed ?? null,
      version: typeof row.version === 'string' ? row.version : null,
      sourceDate: row.upload_date ?? null, license: provider.license });
    if (game) matched++;
  }
  reports.push({ repository: provider.repository, commit: provider.commit, rawUrl,
    sha256: createHash('sha256').update(text).digest('hex'), records: records.length, matched });
}
const output = { version: 1, checkedAt: new Date().toISOString(), providers: reports, sources };
const target = new URL('data/steam-external-references.json', root);
const temporary = new URL('data/steam-external-references.json.tmp', root);
await writeFile(temporary, JSON.stringify(output, null, 2) + '\n');
await rename(temporary, target);
console.log(JSON.stringify({ references: sources.length, providers: reports }, null, 2));
