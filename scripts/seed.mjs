import {writeFile,mkdir} from 'node:fs/promises';
import {steamGame} from '../server/provider.mjs';
const ids=[413150,105600,620,400,250900,588650,367520,504230,1145360,1086940,1245620,990080,1091500,1817070,108600,526870,427520,275850,493340,294100,391540,1057090,1190460,1237970];
const games=[];
await mkdir(new URL('../assets/games/',import.meta.url),{recursive:true});
for(const id of ids){try{const g=await steamGame(id);if(!g){console.log('Filtered',id);continue;}const r=await fetch(g.image,{signal:AbortSignal.timeout(15000)});if(r.ok){await writeFile(new URL(`../assets/games/${id}.jpg`,import.meta.url),Buffer.from(await r.arrayBuffer()));g.image=`/assets/games/${id}.jpg`;}games.push(g);console.log(g.name);}catch(e){console.log(id,e.message);}}
await writeFile(new URL('../data/catalog.json',import.meta.url),JSON.stringify(games,null,2));
console.log(`Saved ${games.length} verified metadata records. No download URLs fabricated.`);
