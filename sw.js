/* Expense Control - service worker (offline-first). Só cacheia arquivos do próprio app. */
const V='ec-v2',CORE=['./','index.html','supabase-sync.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'],OPT=['vendor/supabase.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(async c=>{await c.addAll(CORE);await Promise.all(OPT.map(u=>c.add(u).catch(()=>{})))}).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==location.origin)return; /* Supabase/Google/fontes vão direto à rede (nunca cacheados) */
  const nav=r.mode==='navigate',key=nav?'index.html':r;
  e.respondWith((async()=>{
    try{
      const x=await Promise.race([fetch(r),new Promise((_,j)=>setTimeout(()=>j(new Error('timeout')),nav?5000:15000))]);
      if(x&&x.ok&&x.type==='basic'){const c=x.clone();caches.open(V).then(h=>h.put(key,c))} /* nunca guarda 404/500 */
      return x;
    }catch(err){
      const m=await caches.match(key,{ignoreSearch:true});
      return m||(nav?await caches.match('index.html'):new Response('',{status:504,statusText:'offline'}));
    }
  })());
});
