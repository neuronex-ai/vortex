import { load } from 'cheerio';
import { readFile, writeFile } from 'node:fs/promises';
import https from 'node:https';
const ORIGIN = 'https://steamrip.com';
const CACHE = new URL('../data/catalog.json', import.meta.url);
// The catalog excludes games whose purpose is erotic or pornographic. Mature
// action, horror and narrative games remain eligible, as requested.
const adult = /\b(hentai|porn(?:ographic|ografia|ô)?|erotic[a-z]*|erótic[a-z]*|nsfw|sex(?:ual)?\s*(?:game|simulator)|adult[ -]only|adults only|18\s*\+|uncensored|fetish|xxx|dating\s*simulator)\b/i;
const text = value => load(`<div>${value || ''}</div>`)('div').text().replace(/\s+/g, ' ').trim();
export const cleanTitle = value => text(value).replace(/\s*free\s+download.*$/i, '').trim();
export const normalize = value => cleanTitle(value).normalize('NFKD').replace(/[\u0300-\u036f™®]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function isAdult(value) { return adult.test(String(value || '')); }
export function safeSteam(data) {
  return !!data?.name && !isAdult(`${data.name} ${data.short_description} ${(data.genres || []).map(x=>x.description).join(' ')}`);
}
const sourceHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    Referer: 'https://steamrip.com/'
};
async function sourceIp() {
  const answer = await (await fetch('https://dns.google/resolve?name=steamrip.com&type=A', {signal:AbortSignal.timeout(6000)})).json();
  const ip = answer.Answer?.find(record => record.type === 1 && /^\d{1,3}(\.\d{1,3}){3}$/.test(record.data))?.data;
  if (!ip) throw new Error('Source DNS unavailable');
  return ip;
}
async function requestSource(url) {
  const ip = await sourceIp();
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => request.destroy(new Error('Source timeout')), 12000);
    const request = https.get(url, {headers:sourceHeaders, servername:'steamrip.com', lookup:(_host,_options,callback)=>callback(null,ip,4)}, response => {
      const chunks=[]; response.on('data',chunk=>chunks.push(chunk)); response.on('end',()=>{clearTimeout(timer); if(response.statusCode<200||response.statusCode>299) return reject(new Error(`Source HTTP ${response.statusCode}`)); resolve(Buffer.concat(chunks).toString('utf8'));});
    });
    request.on('error',error=>{clearTimeout(timer);reject(error)});
  });
}
export async function remote(url, json = false) {
  if (!json && new URL(url).hostname === 'steamrip.com') return requestSource(url);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), redirect:'error', headers: {
    'User-Agent': sourceHeaders['User-Agent'],
    Accept: json ? 'application/json' : sourceHeaders.Accept,
    'Accept-Language': sourceHeaders['Accept-Language']
  } });
  if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
  return json ? response.json() : response.text();
}
export function parseIndex(html) {
  const $ = load(html), games = new Map();
  $('.az-list-item a, a[href*="-free-download"]').each((_, el) => {
    try {
      const url = new URL($(el).attr('href'), ORIGIN);
      const name = cleanTitle($(el).text());
      if (url.origin !== ORIGIN || !/free-download/.test(url.pathname) || !name || isAdult(name)) return;
      games.set(url.pathname, {name, sourcePath:url.pathname});
    } catch {}
  });
  return [...games.values()];
}
const HOSTS = ['gofile.io','megadb.net','buzzheavier.com','1fichier.com','pixeldrain.com','qiwi.gg','datanodes.to'];
export function safeDownload(href) {
  try { const u = new URL(href); return u.protocol==='https:' && !u.username && !u.password && HOSTS.some(h=>u.hostname===h || u.hostname.endsWith('.'+h)) ? u.href : null; } catch { return null; }
}
export function parseDetail(html) {
  const $ = load(html);
  $('script,style,iframe,nav,footer,aside,.related-posts,.jp-relatedposts,.sharedaddy').remove();
  const article = $('.entry-content').first().length ? $('.entry-content').first() : $('article').first();
  const name = cleanTitle($('h1').first().text());
  const category = $('a[rel="category tag"],.cat-links,.entry-categories').text();
  const paragraphs = article.find('p').map((_,e)=>$(e).text()).get();
  if (!name || !article.length) throw new Error('Unknown source layout');
  if (isAdult(`${name} ${category} ${paragraphs.join(' ')}`)) return {blocked:true};
  const downloads = new Map();
  article.find('a[href]').each((_,e)=>{ const url=safeDownload($(e).attr('href')); if(url) downloads.set(url,{url,host:new URL(url).hostname.replace(/^www\./,'' )}); });
  const appLink = article.find('a[href*="store.steampowered.com/app/"]').first().attr('href') || '';
  return {name,downloads:[...downloads.values()],appId:appLink.match(/\/app\/(\d+)/)?.[1],description:paragraphs.map(text).filter(p=>p.length>80&&!/download|password|steamrip/i.test(p)).slice(0,3).join('\n\n')};
}
let catalog = [];
try { catalog = JSON.parse(await readFile(CACHE,'utf8')); } catch {}
let index = null, checked = 0, sourceState = 'unchecked', pending;
export async function sourceIndex(force=false) {
  if (pending) return pending;
  if (!force && Date.now()-checked < 300000) return index;
  pending = (async()=>{ try { const parsed=parseIndex(await remote(`${ORIGIN}/games-list-page/`)); if(!parsed.length) throw new Error('Empty source'); index=parsed; sourceState='online'; } catch { sourceState='unavailable'; } finally { checked=Date.now(); pending=null; } return index; })();
  return pending;
}
export const status = () => ({source:sourceState, checkedAt:checked?new Date(checked).toISOString():null});
export async function steamGame(appId) {
  const response=await remote(`https://store.steampowered.com/api/appdetails?appids=${Number(appId)}&cc=br&l=brazilian`,true);
  const data=response[appId]?.data;
  if (!safeSteam(data)) return null;
  return {id:String(appId),name:data.name,description:text(data.short_description),about:text(data.about_the_game),image:data.header_image,genres:(data.genres||[]).map(g=>g.description),developer:(data.developers||[]).join(', '),release:data.release_date?.date,requirements:text(data.pc_requirements?.minimum),screenshots:(data.screenshots||[]).slice(0,5).map(s=>s.path_thumbnail),verifiedAt:new Date().toISOString(),contentVerified:true};
}
async function saveCatalog() { await writeFile(CACHE,JSON.stringify(catalog,null,2)); }
let searchWork=Promise.resolve();
export async function searchGames({q='',genre='',page=1,sort='name'}={}) {
  await sourceIndex();
  // Unknown games never reach the UI until their own Steam metadata passes the content filter.
  if (q.length>=2 && index && !isAdult(q)) {
    const work=async()=>{
      const candidates=index.filter(g=>normalize(g.name).includes(normalize(q))&&!catalog.some(c=>normalize(c.name)===normalize(g.name))).slice(0,4);
      for(const candidate of candidates) {
        try {
          const results=await remote(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(candidate.name)}&l=brazilian&cc=br`,true);
          const match=results.items?.find(g=>normalize(g.name)===normalize(candidate.name));
          if(!match) continue;
          const game=await steamGame(match.id);
          if(game&&!catalog.some(c=>c.id===game.id)) { catalog.push(game); await saveCatalog(); }
        } catch {}
      }
    };
    searchWork=searchWork.then(work,work); await searchWork;
  }
  let games=catalog.filter(g=>g.contentVerified&&!isAdult(g.name)&&normalize(g.name).includes(normalize(q))&&(!genre||g.genres.includes(genre)));
  if(isAdult(q)) games=[];
  games.sort((a,b)=>sort==='recent'?b.verifiedAt.localeCompare(a.verifiedAt):a.name.localeCompare(b.name,'pt-BR'));
  const total=games.length, pages=Math.max(1,Math.ceil(total/12)); page=Math.min(Math.max(1,page),pages);
  return {...status(),games:games.slice((page-1)*12,page*12).map(({about,requirements,screenshots,...g})=>({...g,available:!!index?.some(s=>normalize(s.name)===normalize(g.name))})),total,page,pages,genres:[...new Set(catalog.flatMap(g=>g.genres))].sort()};
}
export async function gameDetails(id) { return catalog.find(g=>g.id===id&&g.contentVerified&&!isAdult(g.name)) || null; }
export async function downloadsFor(id) {
  const game=await gameDetails(id); if(!game) return {state:'not-found',downloads:[]};
  await sourceIndex(true);
  if(sourceState!=='online') return {state:'unavailable',downloads:[]};
  const entry=index.find(g=>normalize(g.name)===normalize(game.name));
  if(!entry) return {state:'not-found',downloads:[]};
  try { const detail=parseDetail(await remote(new URL(entry.sourcePath,ORIGIN))); if(detail.blocked) return {state:'blocked',downloads:[]}; return {state:detail.downloads.length?'online':'empty',downloads:detail.downloads}; } catch {return {state:'unavailable',downloads:[]};}
}
