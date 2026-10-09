// 凪の池: 一度開けば通信なしで起動できるようにする
// 本体（index.html）は通信できれば最新を取り、できなければ保存分を使う。アイコンなどは保存分を優先する
// 電波が弱いと通信の返事を長く待ってしまうため、本体は3秒で見切って保存分を出す
const CACHE = "nagi-v2";
const TIMEOUT = 3000;
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon.svg", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    const net = fetch(req).then(res => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put("./index.html", cp)); }
      return res;
    });
    const late = new Promise(r => setTimeout(r, TIMEOUT)).then(() => caches.match("./index.html"));
    // 先に届いた方を使う。保存分が無ければ通信を待つ。通信が失敗したら保存分
    e.respondWith(Promise.race([net.catch(() => null), late]).then(r => r || net.catch(() => caches.match("./index.html"))));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
    const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res;
  })));
});
