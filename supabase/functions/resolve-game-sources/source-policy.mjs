export const hosts = new Set(['steamrip.com','www.steamrip.com','fitgirl-repacks.site','steamverde.net','www.steamverde.net']);
export const titleKey = value => String(value ?? '').normalize('NFKC').replace(/[™®]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
export function safeProviderUrl(value) {
  try { const url = new URL(value); return url.protocol==='https:' && !url.username && !url.password && hosts.has(url.hostname) && url.pathname!=='/' ? url.href : null; } catch { return null; }
}
export function availabilityForStatus(status) {
  if (status===404 || status===410) return 'unavailable';
  if (status>=200 && status<300) return 'available';
  return 'unknown';
}
export function steamVerdeMatches(title, rows) {
  return rows.filter(row => {
    const name = String(row.title ?? '').replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))).replace(/&amp;/g,'&')
      .replace(/\s+\(\d{4}\).*$/,'').replace(/\s+v\d[\s\S]*$/i,'').replace(/\s+(?:PT-BR\s+)?torrent$/i,'');
    return titleKey(name)===titleKey(title) && safeProviderUrl(row.url) && new URL(row.url).pathname.startsWith('/download/');
  });
}
export async function checkSource(source, fetcher=fetch) {
  const url = safeProviderUrl(source.url);
  if (!url) return {...source, availability:'unavailable',httpStatus:null};
  try {
    const response = await fetcher(url,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(6000)});
    return {...source, availability:availabilityForStatus(response.status),httpStatus:response.status};
  } catch { return {...source,availability:'unknown',httpStatus:null}; }
}
