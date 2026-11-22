/* Expense Control — service worker: abre offline; nunca guarda respostas de outros sites (Google). */
var CACHE='ec-shell-v3.7';
var SHELL=['./','index.html','google-sync.js','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png','privacy.html','terms.html'];

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(SHELL)}).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){return k!==CACHE}).map(function(k){return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}));
});
self.addEventListener('fetch',function(e){
  var req=e.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return; /* Google/fontes: direto da rede, sem cache */
  e.respondWith(
    fetch(req).then(function(res){
      if(res&&res.ok){var copy=res.clone();caches.open(CACHE).then(function(c){c.put(req,copy)})}
      return res;
    }).catch(function(){
      return caches.match(req).then(function(m){return m||(req.mode==='navigate'?caches.match('index.html'):Response.error())});
    })
  );
});
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(l){
    for(var i=0;i<l.length;i++){if('focus' in l[i])return l[i].focus()}
    if(self.clients.openWindow)return self.clients.openWindow('./');
  }));
});
