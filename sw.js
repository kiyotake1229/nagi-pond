// 凪の池: 一度開けば通信なしで起動できるようにする
// 本体（index.html）は通信できれば最新を取り、できなければ保存分を使う。アイコンなどは保存分を優先する
const CACHE = "nagi-v1";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon.svg", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(res => {
      const cp = res.clone(); caches.open(CACHE).then(c => c.put("./index.html", cp)); return res;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
    const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res;
  })));
});
