/* ============================================================================
   LUMEN Service Worker · v41
   ----------------------------------------------------------------------------
   · 缓存名写死在本文件：发布新版改 CACHE 一处即可（浏览器只在 sw.js 字节
     变化时才重装 SW，靠 manifest.version 动态取名会在 SW 重启后漂移）
   · 核心资源逐个缓存，任一失败不影响其余；图标为可选资源，缺图不拖垮离线
   · 导航请求：网络优先，失败回落缓存（保证每次发布都拿到新版）
   · 其它资源：缓存优先 + 后台顺带更新
   · activate 只清理 lumen- 前缀的旧缓存，不误删同域其它应用的缓存
   ========================================================================== */

const CACHE = 'lumen-v41';
const CORE = ['./', './index.html', './manifest.json'];
const OPTIONAL = [
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png',
  './og-image.png'
];

function isDocRequest(req) {
  return req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') > -1;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    /* 逐个 add：任一 404 只影响自己，不会让 addAll 整体失败 */
    await Promise.all(CORE.map(u => c.add(u).catch(() => {})));
    await Promise.all(OPTIONAL.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();              /* 装完立刻接管，不等旧页面关闭 */
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.indexOf('lumen-') === 0 && k !== CACHE)
          .map(k => caches.delete(k))
    );
    await self.clients.claim();
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
          const c = await caches.open(CACHE);
          c.put('./index.html', net.clone()).catch(() => {});
        }
        return net;
      } catch (err) {
        const c = await caches.open(CACHE);
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
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    const net = fetch(req).then(async r => {
      if (r && r.ok) c.put(req, r.clone()).catch(() => {});
      return r;
    }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});

/* 页面可发 {type:'SKIP_WAITING'} 立即激活新版本 */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
