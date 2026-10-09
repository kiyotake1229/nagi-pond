// 凪の池の自動テスト
// index.html のスクリプトをそのまま Node で動かし（画面・音・iOS の部品は最小限の偽物で置き換える）、
// 長く遊んでも止まらないこと、保存データの扱い、満開や引き継ぎなどの決まりごとが守られているかを確かめる。
// 使い方: node tools/test.mjs（要 Node.js 18 以降。ほかに入れるものは無い）
// NAGI_HTML で別のファイルを指定できる（わざと壊したコピーで、テストが失敗することを確かめる用）
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(process.env.NAGI_HTML || path.join(root, 'index.html'), 'utf8');
const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
const KEY = 'nagi.v1';

// ---- ブラウザの代わり（テストに必要な分だけ） ----
class FakeParam {
  constructor(v = 0) { this.value = v; }
  setValueAtTime() { return this; }
  exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new RangeError('exponentialRamp の値は 0 より大きくないといけない'); return this; }
  linearRampToValueAtTime() { return this; }
  setTargetAtTime() { return this; }
}
class FakeNode {
  constructor() { for (const k of ['gain', 'frequency', 'detune', 'Q', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[k] = new FakeParam(1); }
  connect(n) { if (!n) throw new Error('つなぎ先が無い'); return n; }
  start() {} stop() {}
}
class FakeAudioContext {
  constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 4000; this.destination = new FakeNode(); }
  resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); }
  createGain() { return new FakeNode(); } createOscillator() { return new FakeNode(); } createBiquadFilter() { return new FakeNode(); }
  createStereoPanner() { return new FakeNode(); } createDynamicsCompressor() { return new FakeNode(); } createConvolver() { return new FakeNode(); }
  createBufferSource() { return new FakeNode(); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
}

function makeApp({ storage: preset, native, w = 390, h = 844, prefs: prefsPreset, ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', audioSession, platform, touch } = {}) {
  const storage = new Map(Object.entries(preset || {}));
  const clock = { now: 0, timers: [], seq: 0 };
  const rafs = [];
  const flags = { drawThrows: false };
  // canvas の偽物。大きさ0の canvas を描こうとしたら、ブラウザと同じく例外にする
  const ctx2d = new Proxy({}, {
    get: (t, p) => {
      if (p in t) return t[p];
      if (p === 'drawImage') return img => { if (flags.drawThrows) throw new Error('わざと出した描画の例外'); if (img && (img.width === 0 || img.height === 0)) throw new Error('InvalidStateError: 大きさ0の canvas'); };
      return () => ({ addColorStop() {} });
    },
    set: (t, p, v) => ((t[p] = v), true),
  });
  const makeEl = (id, tag = 'div') => {
    const classes = new Set(), listeners = {};
    const el = {
      id, tagName: tag.toUpperCase(), textContent: '', style: {}, dataset: {}, hidden: false, value: '', src: '', attrs: {}, children: [],
      clientWidth: 96, clientHeight: 48, offsetWidth: 100, scrollTop: 0, width: 300, height: 150, html: '',
      classList: {
        add: (...c) => c.forEach(x => classes.add(x)), remove: (...c) => c.forEach(x => classes.delete(x)), contains: c => classes.has(c),
        toggle: (c, on) => { const v = on === undefined ? !classes.has(c) : !!on; v ? classes.add(c) : classes.delete(c); return v; },
      },
      get className() { return [...classes].join(' '); }, set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(x => classes.add(x)); },
      get innerHTML() { return this.html; }, set innerHTML(v) { this.html = String(v); },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
      addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
      fire(t, ev = {}) { for (const fn of listeners[t] || []) fn({ type: t, target: el, preventDefault() {}, ...ev }); },
      querySelector: () => null, querySelectorAll: () => [], appendChild(c) { this.children.push(c); return c; }, remove() {},
      focus() {}, select() {}, setPointerCapture() {}, closest: () => null,
      play() { this.playing = true; return Promise.resolve(); }, pause() { this.playing = false; },
      getContext: () => ctx2d, toDataURL: () => 'data:image/jpeg;base64,AAAA', toBlob: cb => cb(new Blob(['x'])),
    };
    return el;
  };
  const els = new Map();
  const get = id => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };
  const docListeners = {};
  const document = {
    getElementById: get, createElement: tag => makeEl('', tag), querySelectorAll: () => [], querySelector: () => null,
    body: makeEl('body', 'body'), documentElement: makeEl('html', 'html'), hidden: false, activeElement: null,
    addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
  };
  const fireDoc = (t, ev = {}) => { for (const fn of docListeners[t] || []) fn({ type: t, target: document.body, preventDefault() {}, ...ev }); };
  const localStorage = {
    getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k), clear: () => storage.clear(),
  };
  const setTimeout = (fn, ms = 0) => { const id = ++clock.seq; clock.timers.push({ id, at: clock.now + ms, fn }); return id; };
  const clearTimeout = id => { clock.timers = clock.timers.filter(t => t.id !== id); };
  // 時計を進めて、時間が来た予約を順に動かす
  const advance = ms => {
    const end = clock.now + ms;
    for (;;) {
      clock.timers.sort((a, b) => a.at - b.at);
      const t = clock.timers[0];
      if (!t || t.at > end) break;
      clock.timers.shift(); clock.now = t.at; t.fn();
    }
    clock.now = end;
  };
  const base = Date.now();
  class FakeDate extends Date { static now() { return base + clock.now; } }
  // iOS アプリ版の部品の偽物
  const prefs = new Map(Object.entries(prefsPreset || {}));
  const scheduled = [];
  const capacitor = native ? {
    isNativePlatform: () => true,
    Plugins: {
      Preferences: { get: async ({ key }) => ({ value: prefs.has(key) ? prefs.get(key) : null }), set: async ({ key, value }) => { prefs.set(key, value); }, remove: async ({ key }) => { prefs.delete(key); } },
      Haptics: { impact: async () => {}, notification: async () => {} },
      LocalNotifications: {
        requestPermissions: async () => ({ display: 'granted' }),
        schedule: async ({ notifications }) => { scheduled.push(...notifications); },
        cancel: async ({ notifications }) => { const ids = new Set(notifications.map(n => n.id)); for (let i = scheduled.length - 1; i >= 0; i--) if (ids.has(scheduled[i].id)) scheduled.splice(i, 1); },
      },
      StatusBar: { setStyle: async () => {} },
    },
  } : undefined;
  const errors = [];
  const ctx = {
    document, localStorage, console: { log() {}, warn() {}, error: e => errors.push(e) },
    navigator: { vibrate: () => true, userAgent: ua, platform: platform || (/iPhone/.test(ua) ? 'iPhone' : 'MacIntel'), maxTouchPoints: touch !== undefined ? touch : /iPhone/.test(ua) ? 5 : 0, ...(audioSession ? { audioSession } : {}) },
    location: { protocol: 'https:', hostname: 'example.test', reload() { throw new Error('再読み込みは使わない'); } },
    performance: { now: () => clock.now },
    devicePixelRatio: 2, innerWidth: w, innerHeight: h, addEventListener() {},
    requestAnimationFrame: fn => { rafs.push(fn); return rafs.length; }, cancelAnimationFrame() {},
    setTimeout, clearTimeout, Date: FakeDate, AudioContext: FakeAudioContext,
    TextEncoder, TextDecoder, btoa, atob, Blob, Capacitor: capacitor,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(script, ctx);
  const N = ctx.__nagi;
  // dt 秒ずつ n コマ進める（予約された処理も同じだけ時計を進める）
  const run = (sec, dt = 1 / 30, each) => { for (let i = 0, n = Math.round(sec / dt); i < n; i++) { advance(dt * 1000); N.step(dt); if (each) each(i); } };
  const flush = () => new Promise(r => globalThis.setTimeout(r, 0));
  // 画面の書き換え（毎秒60回）を sec 秒ぶん起こし、実際に描いた回数を返す
  const frames = sec => {
    const before = N.drawCount;
    for (let i = 0, n = Math.round(sec * 60); i < n; i++) { advance(1000 / 60); rafs[rafs.length - 1](clock.now); }
    return N.drawCount - before;
  };
  return { N, ctx, document, storage, prefs, scheduled, clock, advance, run, flush, rafs, flags, errors, get, fireDoc, frames };
}

// ---- テストの進め方 ----
const results = [];
async function test(name, fn) {
  const t0 = performance.now();
  try { await fn(); results.push([true, name, '']); }
  catch (e) { results.push([false, name, e && e.message]); }
  results[results.length - 1].push(performance.now() - t0);
}
function check(cond, msg) { if (!cond) throw new Error(msg); }
const finite = v => typeof v === 'number' && Number.isFinite(v);
// 全部のつぼみの上を触って咲かせる
function bloomAll(app) {
  const { N } = app;
  for (let k = 0; k < 80 && N.pads.some(p => !p.bloomed); k++) {
    const p = N.pads.find(q => !q.bloomed); N.tapAt(p.x + 2, p.y + 2); app.run(.25);
  }
  check(N.pads.every(p => p.bloomed), '80回触っても五輪咲かない');
}

// ---- 起動 ----
await test('はじめての起動: 鯉が3匹いて、保存される。例外なし', () => {
  const app = makeApp();
  check(app.N.S.koi.length === 3, `鯉が ${app.N.S.koi.length} 匹`);
  check(app.N.koi.length === 3, '池に描く鯉が3匹でない');
  check(app.storage.has(KEY), '保存されていない');
  check(app.N.pads.length === 5, 'つぼみが5つでない');
  check(app.rafs.length === 1, '描画の繰り返しが予約されていない');
});

await test('長く遊ぶ（10分・触る・なぞる・満開を何度も）: 例外が出ず、数が増え続けない', () => {
  const app = makeApp(); const { N } = app;
  N.start();
  let maxRip = 0, maxPel = 0, maxLight = 0, maxFloat = 0;
  app.run(600, 1 / 30, i => {
    if (i % 20 === 0) { const p = N.pads.find(q => !q.bloomed && q.alpha > .6) || { x: 100 + (i % 200), y: 300 }; N.tapAt(p.x, p.y); }
    maxRip = Math.max(maxRip, N.ripples.length); maxPel = Math.max(maxPel, N.pellets.length);
    maxLight = Math.max(maxLight, N.lights.length); maxFloat = Math.max(maxFloat, N.floaters.length);
  });
  check(N.S.fulls >= 3, `10分で満開が ${N.S.fulls} 回`);
  check(maxRip <= 56 && maxPel <= 8 && maxLight <= 400 && maxFloat <= 30, `数が多すぎる（波紋 ${maxRip}・餌 ${maxPel}・光 ${maxLight}・浮かぶもの ${maxFloat}）`);
  for (const k of N.koi) check(k.pts.every(p => finite(p.x) && finite(p.y)), '鯉の位置が数でなくなった');
  check(N.koi.every(k => finite(k.len) && k.len > 0), '鯉の大きさがおかしい');
  check(N.S.koi.every(k => Number.isInteger(k.xp)), '粒数が整数でない');
  check(finite(N.S.totalSec) && N.S.totalSec > 590, `これまでの時間が ${N.S.totalSec}`);
});

await test('満開: 新しい鯉が来て図鑑に載り、しばらくして次のつぼみが出る', () => {
  const app = makeApp(); const { N } = app;
  N.start(); app.run(2);
  bloomAll(app);
  app.run(1.5);
  check(N.round.celebrated && N.S.fulls === 1, '満開にならない');
  app.run(3);
  check(N.S.koi.length === 4 && N.koi.length === 4, `鯉が ${N.S.koi.length} 匹（4匹のはず）`);
  check(N.S.seen[N.S.koi[3].kind], '新しい鯉が図鑑に載っていない');
  app.run(16);
  check(N.pads.length === 5 && N.pads.every(p => !p.bloomed) && !N.round.done, '次のつぼみが出ていない');
});

await test('池がいっぱい（9匹）のときは、訪れた鯉が来て、しばらくすると帰る', () => {
  const st = { v: 1, koi: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, kind: 'kohaku', seed: i, xp: 10, born: 1 })), nextId: 10, hint: 3 };
  const app = makeApp({ storage: { [KEY]: JSON.stringify(st) } }); const { N } = app;
  N.start(); app.run(2); bloomAll(app); app.run(5);
  check(N.S.koi.length === 9, `保存される鯉が ${N.S.koi.length} 匹`);
  check(N.koi.length === 10 && N.koi.some(k => k.visitor), '訪れた鯉がいない');
  app.run(80);
  check(!N.koi.some(k => k.visitor), '訪れた鯉が帰らない');
});

await test('遊び始める前（タイトル画面）は、放っておいても蓮が咲かない', () => {
  const app = makeApp(); const { N } = app;
  app.run(300);
  check(N.S.blooms === 0 && N.S.fulls === 0, `タイトル画面のまま ${N.S.blooms} 輪咲いた`);
  check(N.pads.every(p => p.energy === 0), 'タイトル画面のまま、つぼみに開く力がたまっている');
});

await test('呼吸の最中は蓮が咲かず、終わると回数が記録される', () => {
  const app = makeApp(); const { N } = app;
  N.start(); app.run(1);
  N.S.set.blen = 1; N.breathStart();
  const e0 = N.pads.map(p => p.energy), b0 = N.S.blooms;
  let moved = false;
  // 呼吸が続いているあいだだけ確かめる（終わったあとは、また自然のしずくで開いてよい）
  app.run(70, 1 / 30, () => { if (N.breath && !N.breath.ending && (N.S.blooms !== b0 || N.pads.some((p, i) => p.energy !== e0[i]))) moved = true; });
  check(!moved, '呼吸中に蓮が開きかけた');
  check(!N.breath && N.S.breaths === 1 && N.S.breathSec >= 60, `呼吸の記録が ${N.S.breaths} 回・${N.S.breathSec} 秒`);
});

await test('はじめからやり直した後は、やり直す前の満開で予約された鯉が来ない', () => {
  const app = makeApp(); const { N } = app;
  N.start(); app.run(2); bloomAll(app); app.run(1.5);
  check(N.round.celebrated, '満開にならない');
  N.resetAll(); app.run(10);
  check(N.S.koi.length === 3 && N.S.fulls === 0, `やり直した後に鯉が ${N.S.koi.length} 匹・満開 ${N.S.fulls} 回`);
});

// ---- 保存データ ----
const broken = {
  '読めない文字列': '{oops',
  '中身が数': '42',
  '設定が壊れている': JSON.stringify({ set: { scene: 'mars', season: 'rainy', bp: 'x', blen: 7, vol: 'loud', notifyHour: 3 }, koi: [] }),
  '鯉が壊れている': JSON.stringify({ koi: [null, 5, { kind: 'shark' }, { kind: 'kohaku', xp: 'abc', seed: null, id: 2 }, { kind: 'ogon', id: 2, born: 'x', name: 123 }], nextId: 1 }),
  '日ごとの記録が壊れている': JSON.stringify({ days: { 'x': 50, '2026-10-01': 'abc', '2026-10-02': -5 }, koi: [{ kind: 'kohaku' }] }),
};
for (const [label, raw] of Object.entries(broken)) {
  await test(`壊れた保存データ（${label}）でも起動して遊べる`, () => {
    const app = makeApp({ storage: { [KEY]: raw } }); const { N } = app;
    N.start(); app.run(20, 1 / 30, i => { if (i % 15 === 0) N.tapAt(150, 400); });
    const S = N.S;
    check(['auto', 'night', 'dawn', 'day', 'dusk'].includes(S.set.scene) && ['auto', 'spring', 'summer', 'autumn', 'winter'].includes(S.set.season), '景色・季節の設定が直っていない');
    check([1, 3, 5].includes(S.set.blen) && finite(S.set.vol) && [20, 21, 22, 23].includes(S.set.notifyHour), '呼吸・音量・通知の設定が直っていない');
    check(S.koi.length >= 1 && S.koi.every(k => finite(k.xp) && finite(k.seed) && finite(k.born) && k.id > 0), '鯉のデータが直っていない');
    check(new Set(S.koi.map(k => k.id)).size === S.koi.length && S.nextId > Math.max(...S.koi.map(k => k.id)), '鯉の番号が重なっている');
    check(Object.entries(S.days).every(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && finite(v) && v > 0), '日ごとの記録が直っていない');
  });
}

await test('これまでの合計時間は、70日より前の日の分も消えない', () => {
  const old = new Date(); old.setDate(old.getDate() - 100);
  const k = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const app1 = makeApp({ storage: { [KEY]: JSON.stringify({ koi: [{ kind: 'kohaku', id: 1 }], days: { [k(old)]: 3600, [k(new Date())]: 600 } }) } });
  check(Math.round(app1.N.S.totalSec) === 4200, `古いデータの合計が ${app1.N.S.totalSec} 秒（4200 のはず）`);
  check(!(k(old) in app1.N.S.days), '100日前の日ごとの記録が残っている');
  const app2 = makeApp({ storage: { [KEY]: app1.storage.get(KEY) } });
  check(Math.round(app2.N.S.totalSec) === 4200, `読み込み直すと合計が ${app2.N.S.totalSec} 秒`);
  check(app2.N.recordHTML().includes('1<small>時間</small>10'), '記録の画面に 1時間10分 と出ない');
});

await test('続けた日数: 今日1分未満でも昨日までの連続を数える', () => {
  const k = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const app = makeApp({ storage: { [KEY]: JSON.stringify({ koi: [{ kind: 'kohaku', id: 1 }], days: { [k(0)]: 30, [k(1)]: 120, [k(2)]: 61, [k(3)]: 59, [k(4)]: 500 } }) } });
  check(app.N.streak() === 2, `続けた日数が ${app.N.streak()}（2 のはず）`);
});

// ---- 名前・引き継ぎ ----
await test('名前: 絵文字を途中で切らず、画面に出すときは記号を無害にする', () => {
  const app = makeApp({ storage: { [KEY]: JSON.stringify({ koi: [{ kind: 'kohaku', id: 1, name: '🐟'.repeat(12) }, { kind: 'ogon', id: 2, name: '<img src=x onerror=alert(1)>' }] }) } });
  const S = app.N.S;
  check(Array.from(S.koi[0].name).length === 10 && !S.koi[0].name.includes('�') && S.koi[0].name === '🐟'.repeat(10), `名前が「${S.koi[0].name}」`);
  const html = app.N.zukanHTML();
  check(!html.includes('<img src=x') && html.includes('&lt;img'), '図鑑の HTML に名前がそのまま入っている');
});

await test('引き継ぎコード: 作ったコードを別の端末で戻すと同じ池になる（通知の設定は移さない）', () => {
  const app1 = makeApp(); const A1 = app1.N;
  A1.start(); app1.run(2); bloomAll(app1); app1.run(6);
  A1.S.koi[0].name = 'あかね🐟'; A1.S.set.notify = true; A1.S.set.scene = 'dusk';
  const code = A1.exportCode();
  check(code.startsWith('NAGI1.') && /^[A-Za-z0-9+/=.]+$/.test(code.slice(0)), 'コードの形がおかしい');
  const app2 = makeApp(); const r = app2.N.parseCode('  ' + code.slice(0, 40) + '\n' + code.slice(40) + ' ');
  check(!r.err, `戻せない: ${r.err}`);
  check(r.state.koi.length === A1.S.koi.length && r.state.koi[0].name === 'あかね🐟' && r.state.fulls === A1.S.fulls, '中身が違う');
  check(r.state.set.notify === false && r.state.set.scene === 'dusk', '通知の設定まで移っている、または景色が移っていない');
  app2.N.applyState(r.state); app2.run(5);
  check(app2.N.koi.length === A1.S.koi.length && JSON.parse(app2.storage.get(KEY)).fulls === A1.S.fulls, '戻した池が保存・表示されていない');
  for (const bad of ['', 'hello', 'NAGI1.', code.slice(0, code.length - 30), 'NAGI1.' + Buffer.from('{"a":1}').toString('base64')]) {
    check(app2.N.parseCode(bad).err, `壊れたコード「${bad.slice(0, 20)}…」を受け付けた`);
  }
});

// ---- iOS アプリ版 ----
await test('iOS: WebView の記録が消えていても、アプリ用の保存領域の控えから戻る（控えを初期状態で上書きしない）', async () => {
  const backup = JSON.stringify({ koi: Array.from({ length: 6 }, (_, i) => ({ id: i + 1, kind: 'showa', seed: i, xp: 30, born: 1 })), fulls: 7, nextId: 7 });
  const app = makeApp({ native: true, prefs: { [KEY]: backup } });
  app.advance(1000); await app.flush(); await app.flush(); app.advance(1000); await app.flush();
  check(app.N.S.koi.length === 6 && app.N.S.fulls === 7, `戻った池が 鯉${app.N.S.koi.length}匹・満開${app.N.S.fulls}回`);
  check(JSON.parse(app.prefs.get(KEY)).fulls === 7, '控えが上書きされた');
  check(JSON.parse(app.storage.get(KEY)).fulls === 7, 'WebView 側に書き戻されていない');
});

await test('iOS: WebView に記録があるときは、それを控えにも書く', async () => {
  const st = JSON.stringify({ koi: [{ id: 1, kind: 'ogon', seed: 1, xp: 3, born: 1 }], fulls: 2 });
  const app = makeApp({ native: true, storage: { [KEY]: st }, prefs: { [KEY]: JSON.stringify({ koi: [], fulls: 99 }) } });
  await app.flush(); app.advance(1000); await app.flush();
  check(app.N.S.fulls === 2, 'WebView の記録より古い控えが優先された');
  check(JSON.parse(app.prefs.get(KEY)).fulls === 2, '控えに書かれていない');
});

await test('iOS: 夜のお知らせは、先の14日分を選んだ時刻・節気の文面で予約する', async () => {
  const st = JSON.stringify({ koi: [{ id: 1, kind: 'kohaku' }], set: { notify: true, notifyHour: 22 } });
  const app = makeApp({ native: true, storage: { [KEY]: st } });
  for (let i = 0; i < 5; i++) await app.flush();
  const list = app.scheduled;
  check(list.length === 14, `予約が ${list.length} 件`);
  check(new Set(list.map(n => n.id)).size === 14 && list.every(n => n.id >= 7000 && n.id < 7014), '通知の番号がおかしい');
  check(list.every(n => n.schedule.at.getHours() === 22 && n.schedule.at.getTime() > Date.now()), '時刻か日付がおかしい');
  check(list.every(n => /のころ。/.test(n.body)), '文面に節気が入っていない');
  await app.N.scheduleNotify(); await app.flush();
  check(app.scheduled.length === 14, `予約しなおすと ${app.scheduled.length} 件（重なっている）`);
});

// ---- 暦・画面 ----
await test('二十四節気: 境目の日付で正しく切り替わる', () => {
  const app = makeApp(); const s = (m, d) => app.N.sekkiNow(new Date(2026, m - 1, d));
  const cases = [[1, 1, '冬至', 'winter'], [1, 5, '小寒', 'winter'], [2, 3, '大寒', 'winter'], [2, 4, '立春', 'spring'], [5, 5, '立夏', 'summer'], [8, 7, '立秋', 'autumn'], [10, 7, '秋分', 'autumn'], [10, 8, '寒露', 'autumn'], [11, 7, '立冬', 'winter'], [12, 31, '冬至', 'winter']];
  for (const [m, d, name, season] of cases) { const r = s(m, d); check(r.name === name && r.season === season, `${m}/${d} が ${r.name}（${r.season}）`); }
});

await test('画面の大きさが0の瞬間があっても、描画で止まらない', () => {
  const app = makeApp({ w: 0, h: 0 });
  app.N.start(); app.run(3);
  app.ctx.innerWidth = 390; app.ctx.innerHeight = 844; app.N.resize(); app.run(3);
  check(app.errors.length === 0, `例外: ${app.errors[0]}`);
});

await test('描画で例外が出ても、次のコマが予約されて池は動き続ける', () => {
  const app = makeApp();
  app.flags.drawThrows = true;
  const before = app.rafs.length;
  app.rafs[app.rafs.length - 1](16);
  check(app.rafs.length === before + 1, '例外のあと次のコマが予約されていない');
  app.flags.drawThrows = false;
});

await test('おやすみタイマー: 時間が来ると眠り、触ると戻る', () => {
  const app = makeApp(); const { N } = app;
  N.start(); N.setSleep(15);
  app.advance(15 * 60 * 1000 + 1000); N.step(1 / 30);
  check(N.sleeping, '15分たっても眠らない');
  N.wakeUp();
  check(!N.sleeping, '触っても戻らない');
});

await test('池の写真が作れる', () => {
  const app = makeApp(); app.N.start(); app.run(1);
  app.N.takePhoto(); app.advance(400);
  check(app.get('photo').classList.contains('show'), '写真の画面が出ない');
  check(app.get('photoImg').src.startsWith('data:image/jpeg'), '写真の画像が無い');
});

// ---- 省電力 ----
await test('省電力: 触っているあいだは毎秒60回、30秒触らないと30回、5分で20回。触るとすぐ60回に戻る', () => {
  const app = makeApp(); const { N } = app;
  N.start(); app.fireDoc('pointerdown');
  const busy = app.frames(5) / 5;
  check(busy > 57, `触っているあいだ 毎秒${busy.toFixed(1)}回`);
  app.advance(26000); // 画面を動かさずに時計だけ進める（テストを速くするため）
  const idle = app.frames(10) / 10;
  check(idle > 28 && idle < 32, `30秒触らないと 毎秒${idle.toFixed(1)}回（30回のはず）`);
  app.advance(260000);
  const deep = app.frames(10) / 10;
  check(deep > 18 && deep < 22, `5分触らないと 毎秒${deep.toFixed(1)}回（20回のはず）`);
  app.fireDoc('pointerdown');
  const back = app.frames(3) / 3;
  check(back > 57, `触ったあと 毎秒${back.toFixed(1)}回`);
});

await test('省電力: 設定でオフにすると、触らなくても毎秒60回のまま', () => {
  const app = makeApp({ storage: { [KEY]: JSON.stringify({ koi: [{ kind: 'kohaku', id: 1 }], set: { eco: false } }) } });
  app.N.start(); app.advance(40000);
  const r = app.frames(10) / 10;
  check(r > 57, `毎秒${r.toFixed(1)}回`);
});

await test('省電力: 呼吸の最中は、触らなくても毎秒60回（輪をなめらかに）', () => {
  const app = makeApp(); const { N } = app;
  N.start(); app.advance(40000);
  N.breathStart();
  const r = app.frames(5) / 5;
  check(r > 57, `呼吸中に 毎秒${r.toFixed(1)}回`);
});

await test('省電力: 古いデータ（設定に省電力が無い）では、省電力がオンになる', () => {
  const app = makeApp({ storage: { [KEY]: JSON.stringify({ koi: [{ kind: 'kohaku', id: 1 }], set: { bgm: false } }) } });
  check(app.N.S.set.eco === true && app.N.S.set.ignoreMute === false, `省電力 ${app.N.S.set.eco}・マナーモードでも鳴らす ${app.N.S.set.ignoreMute}`);
});

// ---- マナーモードでも鳴らす ----
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
await test('マナーモード: iPhone では設定に出て、オンにすると Audio Session が「再生」になる', () => {
  const session = { type: 'auto' };
  const app = makeApp({ ua: IPHONE, audioSession: session }); const { N } = app;
  check(N.IS_IOS && N.settingsHTML().includes('マナーモードでも鳴らす'), '設定に出ない');
  N.start();
  check(session.type === 'auto', `オフなのに ${session.type}`);
  N.S.set.ignoreMute = true; N.applySilentMode();
  check(session.type === 'playback', `オンにしても ${session.type}`);
  N.S.set.ignoreMute = false; N.applySilentMode();
  check(session.type === 'auto', `オフに戻しても ${session.type}`);
});

await test('マナーモード: iPad（Mac と名乗る）は iPhone の仲間、Android は違うと見なす', () => {
  const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
  check(makeApp({ ua: IPAD, platform: 'MacIntel', touch: 5 }).N.IS_IOS, 'iPad を見分けられない');
  check(!makeApp({ ua: IPAD, platform: 'MacIntel', touch: 0 }).N.IS_IOS, 'タッチの無い Mac を iPad と見なした');
  // 開発用のブラウザで Android を真似したときは、Mac の上でタッチありになる
  check(!makeApp({ ua: ANDROID, platform: 'MacIntel', touch: 5 }).N.IS_IOS, 'Android を iPhone の仲間と見なした');
});

await test('マナーモード: PC や Android では設定に出ず、音の扱いも変えない', () => {
  const session = { type: 'auto' };
  const app = makeApp({ audioSession: session, storage: { [KEY]: JSON.stringify({ koi: [{ kind: 'kohaku', id: 1 }], set: { ignoreMute: true } }) } });
  app.N.start();
  check(!app.N.IS_IOS && !app.N.settingsHTML().includes('マナーモードでも鳴らす'), '設定に出ている');
  check(session.type === 'auto', `iPhone でないのに ${session.type}`);
});

await test('マナーモード: Audio Session の無い古い iPhone では、無音の音声を流し、見えなくなると止める', () => {
  const app = makeApp({ ua: IPHONE, storage: { [KEY]: JSON.stringify({ koi: [{ kind: 'kohaku', id: 1 }], set: { ignoreMute: true } }) } });
  app.N.start();
  const el = app.N.unmuteEl;
  check(el && el.playing && el.loop, '無音の音声が流れていない');
  const wav = Buffer.from(el.src.split(',')[1], 'base64');
  check(el.src.startsWith('data:audio/wav;base64,') && wav.length === 4044 && wav.toString('ascii', 0, 4) === 'RIFF' && wav.toString('ascii', 8, 12) === 'WAVE' && wav[44] === 128, '無音の WAV の形がおかしい');
  app.document.hidden = true; app.fireDoc('visibilitychange');
  check(!el.playing, '見えなくなっても止まらない');
});

// ---- 結果 ----
let fail = 0;
for (const [ok, name, msg, ms] of results) {
  console.log(`${ok ? '  OK ' : '  NG '} ${name}${ms > 3000 ? `（${(ms / 1000).toFixed(1)}秒）` : ''}${ok ? '' : `\n       → ${msg}`}`);
  if (!ok) fail++;
}
console.log(`\n${results.length - fail} / ${results.length} 件 合格`);
process.exit(fail ? 1 : 0);
