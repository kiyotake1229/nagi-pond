// 凪の池: 省電力の効き目を測る（触らずに置いたときの、描く回数と CPU の仕事量）
// 使い方: node tools/measure-power.mjs（要 Node.js 22 以降と Google Chrome。約4分かかる。音は消して動かす）
// しくみ: Chrome を画面なしで起動し、スマホの大きさで index.html を1回だけ開く。
// 「省電力オフ」「オン・触らず30秒たった状態」「オン・触らず5分たった状態」を20秒ずつ、順番を回して3回ずつ測り、
// 描いた回数と、Chrome 全体（画面の描画・GPU の代わりの処理を含む）が使った CPU 時間を比べる。
// 電池の減りそのものではないが、CPU の仕事量は電池の減りとほぼ比例する。
// 注意: 画面なしの Chrome は GPU を使わずに絵を描くため、画素を細かくすると毎秒60回に届かない。
// そのため画素の細かさは1倍で測る（実機は GPU で描くので、1回あたりの負担はもっと小さい）
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WINDOW = 20, ROUNDS = 3; // 1回に測る秒数と、繰り返す回数
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- アプリのフォルダを配る小さな Web サーバー ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---- Chrome を画面なしで起動し、開発者用の通信口（DevTools Protocol）につなぐ ----
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nagi-power-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--no-default-browser-check', '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
let port = null;
for (let i = 0; i < 150 && !port; i++) { try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await sleep(100); } }
if (!port) throw new Error('Chrome を起動できませんでした（CHROME で場所を指定できます）');
function connect(url) {
  const ws = new WebSocket(url); let seq = 0; const pending = new Map(), waiters = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    else if (m.method && waiters.has(m.method)) { waiters.get(m.method)(m.params); waiters.delete(m.method); }
  };
  const ready = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const once = method => new Promise(r => waiters.set(method, r));
  return { ws, ready, send, once };
}
const browserWs = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
const pageWs = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page').webSocketDebuggerUrl;
const B = connect(browserWs), P = connect(pageWs);
await B.ready; await P.ready;
await P.send('Page.enable'); await P.send('Performance.enable');
await P.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await P.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const evaluate = async expr => (await P.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
// Chrome のすべてのプロセス（画面の描画・GPU など）が使った CPU 時間の合計（秒）
const cpu = async () => (await B.send('SystemInfo.getProcessInfo')).processInfo.reduce((s, p) => s + p.cpuTime, 0);

async function measure() {
  const c0 = await cpu(), d0 = await evaluate('__nagi.drawCount'), t0 = Date.now();
  await sleep(WINDOW * 1000);
  const c1 = await cpu(), d1 = await evaluate('__nagi.drawCount'), sec = (Date.now() - t0) / 1000;
  return { fps: +((d1 - d0) / sec).toFixed(1), cpuMsPerSec: +((c1 - c0) / sec * 1000).toFixed(1) };
}
// 保存領域に設定を入れてから読み込む（音は消す・案内は出さない・景色は夜・秋に固定）
const loaded = P.once('Page.loadEventFired');
await P.send('Page.navigate', { url: `${base}/index.html` }); await loaded;
await evaluate(`localStorage.setItem('nagi.v1', JSON.stringify({ hint: 3, koi: [], set: { mute: true, bgm: false, sfx: false, scene: 'night', season: 'autumn' } })); 1`);
const again = P.once('Page.loadEventFired');
await P.send('Page.reload', { ignoreCache: true }); await again;
await evaluate('__nagi.start(); 1');
await sleep(15000); // 読み込み直後の揺れが収まるのを待つ

// 測る状態。idleFor で「何ミリ秒触っていないか」を作る（実際に待つと何分もかかるため）
const CASES = {
  offIdle: '__nagi.S.set.eco = false; __nagi.idleFor(40000); 1',
  onIdle: '__nagi.S.set.eco = true; __nagi.idleFor(40000); 1',
  onDeep: '__nagi.S.set.eco = true; __nagi.idleFor(310000); 1',
};
const samples = { offIdle: [], onIdle: [], onDeep: [] };
const median = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const result = {};
try {
  for (let r = 0; r < ROUNDS; r++) for (const [k, js] of Object.entries(CASES)) {
    await evaluate(js); await sleep(1000);
    samples[k].push(await measure());
    console.error(`  ${r + 1}回目 ${k}: ${JSON.stringify(samples[k].at(-1))}`);
  }
  for (const k of Object.keys(CASES)) result[k] = { fps: median(samples[k].map(x => x.fps)), cpuMsPerSec: median(samples[k].map(x => x.cpuMsPerSec)) };
} finally {
  B.ws.close(); P.ws.close(); chrome.kill(); server.close();
  await sleep(300);
  fs.rmSync(profile, { recursive: true, force: true });
}
const pct = (a, b) => Math.round((1 - a / b) * 100);
console.log(`触らずに置いたとき（スマホの大きさ・${WINDOW}秒ずつ ${ROUNDS}回の中央値）`);
console.log(`  省電力オフ          : 毎秒 ${result.offIdle.fps} 回描く / CPU ${result.offIdle.cpuMsPerSec} ms/秒`);
console.log(`  省電力オン（30秒後）: 毎秒 ${result.onIdle.fps} 回描く / CPU ${result.onIdle.cpuMsPerSec} ms/秒（オフより ${pct(result.onIdle.cpuMsPerSec, result.offIdle.cpuMsPerSec)}% 少ない）`);
console.log(`  省電力オン（5分後） : 毎秒 ${result.onDeep.fps} 回描く / CPU ${result.onDeep.cpuMsPerSec} ms/秒（オフより ${pct(result.onDeep.cpuMsPerSec, result.offIdle.cpuMsPerSec)}% 少ない）`);
console.log(JSON.stringify(result));
