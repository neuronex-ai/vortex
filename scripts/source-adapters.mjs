export function normalizeTitle(value) {
  return String(value ?? '').normalize('NFKC').replace(/[™®]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Never strip edition names, subtitles or numbers: Silksong is not Hollow Knight.
export function matchSourceRecord(game, records) {
  const byId = records.filter(row => Number(row.appId ?? row.steam_app_id) === game.appId);
  if (byId.length === 1) return { record: byId[0], method: 'steam-app-id' };
  if (byId.length > 1) return null;
  const byTitle = records.filter(row => row.appId == null && row.steam_app_id == null
    && normalizeTitle(row.name ?? row.Name) === normalizeTitle(game.title));
  return byTitle.length === 1 ? { record: byTitle[0], method: 'exact-unique-title' } : null;
}

export function validateRecords(records) {
  if (!Array.isArray(records) || !records.length || records.some(row => !row || typeof row.name !== 'string')) {
    throw new Error('Formato inesperado na fonte GitHub. O catálogo anterior foi preservado.');
  }
  return records;
}
