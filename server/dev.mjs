import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {searchGames,gameDetails,downloadsFor,status} from './provider.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
const routes=new Set(['index.html','catalogo.html','jogo.html','blog.html','changelog.html','contact.html','waitlist.html','privacy-policy.html','404.html']);
const server=http.createServer(async(req,res)=>{
  const json=(body,code=200)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  try {
    if(!['GET','HEAD'].includes(req.method)) return json({error:'Método não permitido.'},405);
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/status') return json(status());
    if(url.pathname==='/api/games') return json(await searchGames({q:(url.searchParams.get('q')||'').slice(0,100),genre:(url.searchParams.get('genre')||'').slice(0,60),page:Math.min(1000,Math.max(1,parseInt(url.searchParams.get('page'))||1)),sort:url.searchParams.get('sort')}));
    const match=url.pathname.match(/^\/api\/games\/(\d+)(\/downloads)?$/);
    if(match){ const value=match[2]?await downloadsFor(match[1]):await gameDetails(match[1]);return json(value||{error:'Jogo não encontrado.'},value?200:404); }
    if(url.pathname.startsWith('/api/')) return json({error:'Página não encontrada.'},404);
    let relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
    if(!routes.has(relative)&&! /^(assets|css|js|blog)\/[a-zA-Z0-9_./-]+$/.test(relative)) return json({error:'Página não encontrada.'},404);
    const file=path.resolve(root,relative);
    if(!file.startsWith(root)||relative.split(/[\\/]/).some(s=>s==='..'||s.startsWith('.'))) return json({error:'Página não encontrada.'},404);
    const ext=path.extname(file); if(!mime[ext]||!(await stat(file)).isFile()) return json({error:'Página não encontrada.'},404);
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[ext],'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://*.steamstatic.com https://*.akamaihd.net data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"});
    res.end(req.method==='HEAD'?undefined:body);
  } catch(error) { if(error.code==='ENOENT') return json({error:'Página não encontrada.'},404); console.error('Request failed:',error.message);json({error:'Não foi possível concluir a consulta. Tente novamente.'},503); }
});
const port=Number(process.env.PORT)||8080;
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`A porta ${port} está ocupada. Encerre a outra prévia ou defina PORT.`:error.message);process.exit(1);});
server.listen(port,'127.0.0.1',()=>console.log(`Vortex disponível em http://localhost:${port}`));
