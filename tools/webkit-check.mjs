// 凪の池を本物の WebKit（iPhone の Safari と同じ描画エンジン）で動かして確かめる。Xcode が無くても iPhone の動きに近いところを見られる
// 使い方（初回だけ準備が必要。Playwright と WebKit で約300MB。Dropbox の外に置く）:
//   mkdir -p ~/.cache/nagi-pw && cd ~/.cache/nagi-pw && npm init -y && npm i playwright@1 && npx playwright install webkit
//   PW=~/.cache/nagi-pw node tools/webkit-check.mjs [画面写真の出力先]
// 確かめること: iPhone・iPad と見なされるか／「マナーモードでも鳴らす」で音の扱いが「再生」に変わり戻るか／
// 古い iPhone（Audio Session API なし）で無音の音声が流れて止まるか／実際のタップで満開・写真・図鑑まで動くか／
// 写真の画面で知らせが写真にかぶらないか／触らないと描く回数が減るか／エラーが出ないか。音は消して触る
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'nagi-webkit-'));
fs.mkdirSync(OUT, { recursive: true });
const { webkit, devices } = await import(process.env.PW ? path.join(process.env.PW, 'node_modules', 'playwright', 'index.mjs') : 'playwright');
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
const APP_URL = `http://127.0.0.1:${server.address().port}/index.html`;

// 音を消す（_テンプレート/動作チェックのミュート手順.md と同じしくみ）
const MUTE = `(() => { const oc = AudioNode.prototype.connect; AudioNode.prototype.connect = function (d, ...r) { if (d && d.context && d === d.context.destination) { const g = d.context.createGain(); g.gain.value = 0; oc.call(g, d); return oc.call(this, g, ...r); } return oc.call(this, d, ...r); }; const M = HTMLMediaElement.prototype, op = M.play; M.play = function () { this.muted = true; this.volume = 0; return op.call(this); }; })();`;
const problems = [];
const expect = (cond, msg) => { if (!cond) problems.push(msg); };

async function run(name, device, { noAudioSession } = {}) {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices[device] });
  await ctx.addInitScript(MUTE);
  if (noAudioSession) await ctx.addInitScript(`try { Object.defineProperty(Navigator.prototype, 'audioSession', { get: () => undefined, configurable: true }); } catch (e) {}`);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(APP_URL); await sleep(2600);
  const r = { device };
  r.before = await page.evaluate(() => ({ hasAudioSession: !!navigator.audioSession, isIOS: __nagi.IS_IOS }));
  await page.screenshot({ path: `${OUT}/${name}-1-title.png` });
  await page.tap('#startBtn'); await sleep(1800);
  // 設定を開き、「マナーモードでも鳴らす」を実際にタップする（オン → オフ）
  await page.tap('[data-open="settings"]'); await sleep(700);
  await page.locator('[data-toggle="ignoreMute"]').scrollIntoViewIfNeeded();
  await page.tap('[data-toggle="ignoreMute"]'); await sleep(900);
  r.on = await page.evaluate(() => ({ type: navigator.audioSession && navigator.audioSession.type, el: __nagi.unmuteEl && { paused: __nagi.unmuteEl.paused, duration: __nagi.unmuteEl.duration, error: __nagi.unmuteEl.error && __nagi.unmuteEl.error.code } }));
  await page.screenshot({ path: `${OUT}/${name}-2-settings.png` });
  await page.tap('[data-toggle="ignoreMute"]'); await sleep(500);
  r.off = await page.evaluate(() => ({ type: navigator.audioSession && navigator.audioSession.type, paused: __nagi.unmuteEl ? __nagi.unmuteEl.paused : null }));
  await page.tap('#sheetClose'); await sleep(900);
  // 水面を実際にタップして、五輪咲かせる
  for (let k = 0; k < 60; k++) {
    const p = await page.evaluate(() => { const q = __nagi.pads.find(x => !x.bloomed && x.alpha > .6); return q ? [q.x + 2, q.y + 2] : null; });
    if (!p) { if (await page.evaluate(() => __nagi.pads.every(x => x.bloomed))) break; await sleep(300); continue; }
    await page.touchscreen.tap(p[0], p[1]); await sleep(230);
  }
  await sleep(4200);
  r.play = await page.evaluate(() => ({ fulls: __nagi.S.fulls, koi: __nagi.S.koi.length }));
  await page.screenshot({ path: `${OUT}/${name}-3-bloom.png` });
  await page.tap('#shotBtn'); await sleep(1200);
  r.photo = await page.evaluate(() => { const t = document.querySelector('.toast'), img = document.getElementById('photoImg').getBoundingClientRect(); return { width: document.getElementById('photoImg').naturalWidth, toastBelow: t ? t.getBoundingClientRect().top >= img.bottom - 1 : true }; });
  await page.screenshot({ path: `${OUT}/${name}-4-photo.png` });
  await page.tap('#photoClose'); await sleep(700);
  await page.tap('[data-open="zukan"]'); await sleep(1200);
  await page.screenshot({ path: `${OUT}/${name}-5-zukan.png` });
  await page.tap('#sheetClose'); await sleep(500);
  r.idleFps = await page.evaluate(async () => { __nagi.idleFor(40000); const d0 = __nagi.drawCount; await new Promise(res => setTimeout(res, 3000)); return (__nagi.drawCount - d0) / 3; });
  r.errors = errors;
  await browser.close();

  expect(r.before.isIOS, `${name}: iPhone・iPad と見なされない`);
  if (noAudioSession) {
    expect(r.on.el && !r.on.el.paused && Math.abs(r.on.el.duration - .5) < .01 && !r.on.el.error, `${name}: 無音の音声が流れない ${JSON.stringify(r.on.el)}`);
    expect(r.off.paused === true, `${name}: オフにしても無音の音声が止まらない`);
  } else if (r.before.hasAudioSession) {
    expect(r.on.type === 'playback' && r.off.type === 'auto', `${name}: 音の扱いが ${r.on.type} → ${r.off.type}（playback → auto のはず）`);
  }
  expect(r.play.fulls >= 1 && r.play.koi >= 4, `${name}: 満開にならない ${JSON.stringify(r.play)}`);
  expect(r.photo.width === 1080 && r.photo.toastBelow, `${name}: 写真の画面 ${JSON.stringify(r.photo)}`);
  expect(r.idleFps > 25 && r.idleFps < 35, `${name}: 触らないときに毎秒 ${r.idleFps} 回（30回のはず）`);
  expect(!errors.length, `${name}: エラー ${errors.join(' / ')}`);
  return r;
}

const report = {};
try {
  report.iphone = await run('iphone', 'iPhone 15');
  report.iphoneOld = await run('iphone-old', 'iPhone 15', { noAudioSession: true });
  report.ipad = await run('ipad', 'iPad Pro 11');
} finally { server.close(); }
console.log(JSON.stringify(report, null, 1));
console.log(`\n画面写真: ${OUT}`);
console.log(problems.length ? `\n問題 ${problems.length} 件:\n- ${problems.join('\n- ')}` : '\n問題なし（iPhone・古い iPhone・iPad）');
process.exit(problems.length ? 1 : 0);
