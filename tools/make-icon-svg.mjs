// 凪の池のアイコン（icon.svg）を作る。ゲームの鯉と同じ形の作り方で、2匹が輪を描いて泳ぐ絵
// 使い方: node tools/make-icon-svg.mjs icon.svg → そのあと bash tools/make-icons.sh で PNG を作る
import fs from 'node:fs';
const out = process.argv[2];
const f = n => +n.toFixed(2);
const prof = t => t < .28 ? .62 + .38 * Math.sin(t / .28 * Math.PI / 2) : 1 - .8 * Math.pow((t - .28) / .72, 1.5);
const N = 14, C = 128, WF = .108;
function spine(headDeg, R, len, dir) {
  // 円周に沿って頭から尾へ。dir=1 で時計回りに泳ぐ
  const pts = [], arc = len * .78 / R;
  for (let i = 0; i < N; i++) { const a = (headDeg * Math.PI / 180) - dir * arc * i / (N - 1); pts.push({ x: C + Math.cos(a) * R, y: C + Math.sin(a) * R }); }
  return pts;
}
function sp(pts, t) {
  const fl = Math.min(.999, Math.max(0, t)) * (pts.length - 1), i = Math.floor(fl), k = fl - i, a = pts[i], b = pts[i + 1];
  const dx = a.x - b.x, dy = a.y - b.y, m = Math.hypot(dx, dy);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: dx / m, dy: dy / m };
}
function body(pts, len) {
  const L = [], R = []; let d0 = null, w0 = 0;
  pts.forEach((p, i) => {
    const q = i === 0 ? pts[1] : pts[i - 1];
    let dx = i === 0 ? p.x - q.x : q.x - p.x, dy = i === 0 ? p.y - q.y : q.y - p.y; const m = Math.hypot(dx, dy); dx /= m; dy /= m;
    const w = len * WF * prof(i / (pts.length - 1));
    if (i === 0) { d0 = [dx, dy]; w0 = w; }
    L.push([p.x - dy * w, p.y + dx * w]); R.push([p.x + dy * w, p.y - dx * w]);
  });
  let d = `M${f(L[0][0])} ${f(L[0][1])}`;
  for (let i = 1; i < N - 1; i++) d += `Q${f(L[i][0])} ${f(L[i][1])} ${f((L[i][0] + L[i + 1][0]) / 2)} ${f((L[i][1] + L[i + 1][1]) / 2)}`;
  d += `L${f(L[N - 1][0])} ${f(L[N - 1][1])}L${f(R[N - 1][0])} ${f(R[N - 1][1])}`;
  for (let i = N - 2; i > 0; i--) d += `Q${f(R[i][0])} ${f(R[i][1])} ${f((R[i][0] + R[i - 1][0]) / 2)} ${f((R[i][1] + R[i - 1][1]) / 2)}`;
  const k = w0 * 1.25;
  d += `L${f(R[0][0])} ${f(R[0][1])}C${f(R[0][0] + d0[0] * k)} ${f(R[0][1] + d0[1] * k)} ${f(L[0][0] + d0[0] * k)} ${f(L[0][1] + d0[1] * k)} ${f(L[0][0])} ${f(L[0][1])}Z`;
  return d;
}
function fins(pts, len) {
  let d = '';
  for (const [t, fl, base] of [[.19, .3, 1.05], [.55, .14, .8]]) {
    const s = sp(pts, t), w = len * WF * prof(t), a = Math.atan2(-s.dy, -s.dx);
    for (const side of [1, -1]) {
      const bx = s.x - s.dy * w * .7 * side, by = s.y + s.dx * w * .7 * side, fa = a + side * base, Lf = len * fl;
      const cx = bx + Math.cos(fa) * Lf * .5, cy = by + Math.sin(fa) * Lf * .5;
      d += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(Lf * .5)}" ry="${f(Lf * .22)}" transform="rotate(${f(fa * 180 / Math.PI)} ${f(cx)} ${f(cy)})"/>`;
    }
  }
  const e = pts[N - 1], p2 = pts[N - 2], q = pts[N - 3];
  const ba = Math.atan2(e.y - p2.y, e.x - p2.x), ca = Math.atan2(p2.y - q.y, p2.x - q.x);
  let sw = ba - ca; sw = Math.atan2(Math.sin(sw), Math.cos(sw)) * 1.6;
  const tl = len * .36, we = len * WF * prof(1), P = (a, r) => [e.x + Math.cos(ba + a + sw) * r, e.y + Math.sin(ba + a + sw) * r];
  const nx = -Math.sin(ba), ny = Math.cos(ba);
  const c1 = P(.36, tl * .55), t1 = P(.62, tl), n1 = P(.14, tl * .8), nt = P(0, tl * .5), n2 = P(-.14, tl * .8), t2 = P(-.62, tl), c2 = P(-.36, tl * .55);
  d += `<path d="M${f(e.x + nx * we)} ${f(e.y + ny * we)}Q${f(c1[0])} ${f(c1[1])} ${f(t1[0])} ${f(t1[1])}Q${f(n1[0])} ${f(n1[1])} ${f(nt[0])} ${f(nt[1])}Q${f(n2[0])} ${f(n2[1])} ${f(t2[0])} ${f(t2[1])}Q${f(c2[0])} ${f(c2[1])} ${f(e.x - nx * we)} ${f(e.y - ny * we)}Z"/>`;
  return d;
}
function koi(id, pts, len, base, fin, spots, sheen, net) {
  const b = body(pts, len);
  let s = `<g transform="translate(3 5)" fill="#000" opacity=".32">${fins(pts, len)}<path d="${b}"/></g>`;
  s += `<g fill="${fin}" opacity=".78" stroke="#fff" stroke-opacity=".35" stroke-width=".6">${fins(pts, len)}</g>`;
  s += `<clipPath id="${id}"><path d="${b}"/></clipPath><path d="${b}" fill="${base}"/>`;
  s += `<g clip-path="url(#${id})">`;
  for (const [t, o, r, c] of spots) {
    const p = sp(pts, t), cx = p.x - p.dy * o * len, cy = p.y + p.dx * o * len, a = Math.atan2(p.dy, p.dx) * 180 / Math.PI;
    s += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(r * len * 1.25)}" ry="${f(r * len)}" fill="${c}" transform="rotate(${f(a)} ${f(cx)} ${f(cy)})"/>`;
  }
  if (net) {
    let d = '';
    for (let t = .12; t < .92; t += .06) for (let o = -.09; o <= .091; o += .03) {
      const p = sp(pts, t), cx = p.x - p.dy * o * len, cy = p.y + p.dx * o * len, rr = len * .022, a = Math.atan2(p.dy, p.dx);
      const x1 = cx + Math.cos(a + 2.2) * rr, y1 = cy + Math.sin(a + 2.2) * rr, x2 = cx + Math.cos(a + 4.08) * rr, y2 = cy + Math.sin(a + 4.08) * rr;
      d += `M${f(x1)} ${f(y1)}A${f(rr)} ${f(rr)} 0 0 1 ${f(x2)} ${f(y2)}`;
    }
    s += `<path d="${d}" fill="none" stroke="${net}" stroke-width=".9"/>`;
  }
  const line = pts.slice(1, N - 2).map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join('');
  s += `<path d="${line}" fill="none" stroke="${sheen}" stroke-width="${f(len * .04)}" stroke-linecap="round"/>`;
  s += `</g><path d="${b}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width=".8"/>`;
  const e = sp(pts, .055), w = len * WF * prof(.055) * .74;
  for (const side of [1, -1]) s += `<circle cx="${f(e.x - e.dy * w * side)}" cy="${f(e.y + e.dx * w * side)}" r="${f(len * .012)}" fill="#151214" opacity=".8"/>`;
  return s;
}
const R = '#d8432a';
const len = 132, rad = 54;
const k1 = koi('k1', spine(-58, rad, len, 1), len, '#f6f2ea', '#f1ece2',
  [[.07, .0, .05, R], [.1, .03, .04, R], [.3, .02, .055, R], [.36, -.03, .05, R], [.42, .01, .05, R], [.6, -.01, .045, R], [.66, .03, .04, R]], 'rgba(255,255,255,.2)');
const k2 = koi('k2', spine(122, rad, len, 1), len, '#e2ae40', '#f2cf73', [], 'rgba(255,248,215,.45)', 'rgba(150,100,20,.45)');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256">
<defs><radialGradient id="bg" cx="50%" cy="46%" r="72%"><stop offset="0" stop-color="#173a47"/><stop offset=".6" stop-color="#0c2029"/><stop offset="1" stop-color="#050d12"/></radialGradient>
<radialGradient id="moon" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f2ead0" stop-opacity=".22"/><stop offset="1" stop-color="#f2ead0" stop-opacity="0"/></radialGradient></defs>
<rect width="256" height="256" fill="url(#bg)"/>
<g id="art">
<ellipse cx="128" cy="128" rx="70" ry="70" fill="url(#moon)"/>
<circle cx="128" cy="128" r="94" fill="none" stroke="#ece6d3" stroke-opacity=".1" stroke-width="1.4"/>
<circle cx="128" cy="128" r="80" fill="none" stroke="#ece6d3" stroke-opacity=".16" stroke-width="1.4"/>
<circle cx="128" cy="128" r="16" fill="none" stroke="#ece6d3" stroke-opacity=".22" stroke-width="1.2"/>
${k1}
${k2}
</g>
</svg>
`;
fs.writeFileSync(out, svg);
console.log('wrote', out, svg.length);
