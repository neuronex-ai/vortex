import { canonicalGameTitle, sameGameTitle } from "../src/services/titleMatch.mjs";

export function normalizeTitle(value) {
  return canonicalGameTitle(value);
}

export function sourceTitle(value, adapter) {
  // Only remove a version annotation, never editions or sequel subtitles.
  return adapter === 'fitgirl-json' ? value.replace(/\s+[–—-]\s+v\d.*$/i, '').trim() : value;
}

// Never strip edition names, subtitles or numbers: Silksong is not Hollow Knight.
export function matchSourceRecord(game, records) {
  const byId = records.filter(row => Number(row.appId ?? row.steam_app_id) === game.appId);
  if (byId.length === 1) return { record: byId[0], method: 'steam-app-id' };
  if (byId.length > 1) return null;
  const byTitle = records.filter(row => row.appId == null && row.steam_app_id == null
    && sameGameTitle(row.name ?? row.Name, game.title));
  return byTitle.length === 1 ? { record: byTitle[0], method: 'normalized-unique-title' } : null;
}

export function validateRecords(records) {
  if (!Array.isArray(records) || !records.length || records.some(row => !row || typeof row.name !== 'string')) {
    throw new Error('Formato inesperado na fonte GitHub. O catálogo anterior foi preservado.');
  }
  return records;
}

export function providerPage(value, allowedHosts) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !allowedHosts.includes(url.hostname)
      || url.pathname === '/' || /example|placeholder/i.test(url.href)) return null;
    return url.href;
  } catch { return null; }
}
