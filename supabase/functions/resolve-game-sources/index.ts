import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import references from './provider-snapshot.json' with { type: 'json' };
import { titleKey, safeProviderUrl, steamVerdeMatches, checkSource } from './source-policy.mjs';

const cors = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS' };
const base = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(base,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const publicKeys = new Set<string>();
const grouped = new Map<string, typeof references>();
for (const ref of references) { const key=titleKey(ref.title); grouped.set(key,[...(grouped.get(key)??[]),ref]); }
const json = (body: unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

function snapshotSources(title: string) {
  const matches=grouped.get(titleKey(title))??[];
  return matches.filter(item=>matches.filter(other=>other.providerName===item.providerName).length===1 && safeProviderUrl(item.externalUrl))
    .map((item,index)=>({id:`${item.providerName}:${index}`,providerName:item.providerName,url:item.externalUrl,kind:'provider_page',
      status:item.downloadType??'Página de download',size:item.size,availability:'unknown'}));
}

async function resolveGame(game: {steam_app_id:number;title:string}) {
  const appId=game.steam_app_id;
  const {error:insertError}=await admin.from('game_source_cache').upsert({steam_app_id:appId},{onConflict:'steam_app_id',ignoreDuplicates:true});
  if(insertError) throw insertError;
  const {data:cached,error:readError}=await admin.from('game_source_cache').select('*').eq('steam_app_id',appId).single();
  if(readError) throw readError;
  const now=new Date();
  if(new Date(cached.next_check_at)>now) return {appId,sources:cached.sources,cache:'hit'};
  const {data:claim,error:claimError}=await admin.from('game_source_cache').update({lease_until:new Date(Date.now()+120000).toISOString()})
    .eq('steam_app_id',appId).or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`).select('steam_app_id');
  if(claimError) throw claimError;
  if(!claim?.length) return {appId,sources:cached.sources,cache:'busy'};
  try {
    let sources=cached.sources;
    let discoveryError=null;
    if(!cached.discovered_at) {
      sources=snapshotSources(game.title);
      try {
        const response=await fetch(`https://steamverde.net/wp-json/wp/v2/search?search=${encodeURIComponent(game.title)}&per_page=50`,{signal:AbortSignal.timeout(8000),redirect:'error'});
        if(!response.ok) throw new Error(`HTTP ${response.status}`);
        const rows=await response.json();
        if(!Array.isArray(rows)) throw new Error('Unexpected response');
        const matches=steamVerdeMatches(game.title,rows);
        if(matches.length===1) sources.push({id:`steamverde:${matches[0].id}`,providerName:'SteamVerde',url:matches[0].url,kind:'provider_page',status:'Torrent na página externa',availability:'unknown'});
      } catch { discoveryError='SteamVerde search unavailable'; }
    } else {
      sources=await Promise.all(sources.map((source:unknown)=>checkSource(source)));
    }
    const checked=new Date().toISOString();
    const {error}=await admin.from('game_source_cache').update({sources,discovered_at:discoveryError?null:(cached.discovered_at??checked),
      checked_at:cached.discovered_at?checked:null,next_check_at:new Date(Date.now()+60000).toISOString(),lease_until:null,
      discovery_error:discoveryError,updated_at:checked}).eq('steam_app_id',appId);
    if(error) throw error;
    return {appId,sources,cache:cached.discovered_at?'revalidated':'discovered',discoveryError};
  } catch(error) {
    await admin.from('game_source_cache').update({lease_until:null}).eq('steam_app_id',appId);
    throw error;
  }
}

Deno.serve(async request=>{
  if(request.method==='OPTIONS') return new Response(null,{headers:cors});
  if(request.method!=='POST') return json({error:'Method not allowed'},405);
  const apiKey=request.headers.get('apikey')??'';
  if(!apiKey || apiKey.length>512) return json({error:'Invalid API key'},401);
  if(!publicKeys.has(apiKey)) {
    const response=await fetch(`${base}/rest/v1/fusion_public_games?select=id&limit=0`,{headers:{apikey:apiKey},signal:AbortSignal.timeout(5000)});
    if(!response.ok) return json({error:'Invalid API key'},401);
    if(publicKeys.size<5) publicKeys.add(apiKey);
  }
  try {
    const raw=await request.text();
    if(raw.length>2000) return json({error:'Request too large'},413);
    const body=JSON.parse(raw);
    if(!Array.isArray(body.appIds)||body.appIds.length>20||body.appIds.some((id:unknown)=>!Number.isSafeInteger(id)||Number(id)<=0))return json({error:'Invalid appIds'},400);
    const {data:games,error}=await admin.from('fusion_public_games').select('steam_app_id,title').in('steam_app_id',[...new Set(body.appIds)]);
    if(error) throw error;
    const results=[];
    for(let i=0;i<(games??[]).length;i+=4) {
      results.push(...await Promise.all(games!.slice(i,i+4).map(async game=>{
        try{return await resolveGame(game);}catch{return {appId:game.steam_app_id,error:'Source lookup failed'};}
      })));
    }
    return json({results});
  } catch { return json({error:'Source request failed'},500); }
});
