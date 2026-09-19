const CACHE='lumen-v3';
const ASSETS=['./','./index.html','./manifest.json'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  e.respondWith(
    caches.match(req).then(res=>{
      if(res)return res;
      return fetch(req).then(r=>{
        const copy=r.clone();
        caches.open(CACHE).then(c=>{
          if(req.url.startsWith('http'))c.put(req,copy);
        });
        return r;
      }).catch(()=>caches.match('./index.html'));
    })
  );
});
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
  );
});
