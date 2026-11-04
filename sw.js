/* ============================================================================
   LUMEN Service Worker
   ----------------------------------------------------------------------------
   策略：
     · 主文档（导航请求）—— 网络优先，失败回落缓存；保证每次发布都能拿到新版
     · 静态资源 —— 缓存优先 + 后台顺带更新（stale-while-revalidate）
     · 版本自更新 —— 读取 manifest.json 里的 version 字段作为缓存名；
                     发布新版本时只要改 manifest.json 的 version 即可，
                     不必再手动改本文件里的版本号。
   ========================================================================== */

const FALLBACK_CACHE = 'lumen-v40';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './og-image.png'
];

let CACHE = FALLBACK_CACHE;

/* 读取 manifest.json 里的版本号，作为缓存名 */
async function resolveVersion() {
  try {
    const r = await fetch('./manifest.json', { cache: 'reload' });
    if (!r || !r.ok) return CACHE;
    const j = await r.json();
    if (j && j.version) {
      CACHE = 'lumen-v' + j.version;
      return CACHE;
    }
  } catch (e) { /* 离线时沿用当前缓存名 */ }
  return CACHE;
}

/* 打开当前版本的缓存 */
function openCache() {
  return caches.open(CACHE);
}

/* 导航请求判定 */
function isDocRequest(req) {
  return req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') > -1;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    await resolveVersion();
    const c = await openCache();
    await c.addAll(ASSETS).catch(() => {});
    await self.skipWaiting();              /* 装完立刻接管，不等旧页面关闭 */
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  /* ---- 页面导航 & 主文档：网络优先，拿不到再回缓存（离线兜底） ---- */
  if (isDocRequest(req)) {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        if (net && net.ok) {
          const copy = net.clone();
          const c = await openCache();
          c.put('./index.html', copy).catch(() => {});
        }
        return net;
      } catch (err) {
        const c = await openCache();
        const hit = await c.match('./index.html') || await c.match('./');
        if (hit) return hit;
        return new Response(
          '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>晨昏 LUMEN · 离线</title>' +
          '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
          'background:#0B0C11;color:#F4F6FA;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;' +
          'text-align:center;line-height:1.9}.b{font-size:17px;color:#BCC1D2;margin-top:10px}</style></head>' +
          '<body><div><div style="font-size:22px;font-weight:700">晨昏 LUMEN</div>' +
          '<div class="b">当前处于离线状态，且还没有缓存过页面。<br>联网后重新打开即可正常使用。</div></div></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  /* ---- 其它静态资源：缓存优先，同时后台更新 ---- */
  e.respondWith((async () => {
    const c = await openCache();
    const hit = await c.match(req);
    const net = fetch(req).then(async (r) => {
      if (r && r.ok) {
        const copy = r.clone();
        c.put(req, copy).catch(() => {});
      }
      return r;
    }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await resolveVersion();
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* 页面可发 {type:'SKIP_WAITING'} 立即激活新版本 */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
