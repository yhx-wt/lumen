/* LUMEN Service Worker —— 网络优先，保证每次发布都能拿到新版 */
const CACHE = 'lumen-v4';            /* 版本号：每次发布若仍不生效，把这个号 +1 */
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())          /* 装完立刻接管，不等旧页面关闭 */
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  /* 页面导航 & 主文档：网络优先，拿不到再回缓存（离线兜底） */
  const isDoc =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') > -1;

  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return r;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  /* 其它静态资源：缓存优先，但后台顺带更新 */
  e.respondWith(
    caches.match(req).then(res => {
      const net = fetch(req)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return r;
        })
        .catch(() => res);
      return res || net;
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 页面可发 {type:'SKIP_WAITING'} 立即激活新版本 */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
