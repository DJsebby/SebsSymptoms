// Likely triggers. For every food, food group, activity and product, this compares symptom
// scores on the days after it with nearby days without it, and checks how often a pattern
// that strong turns up by chance. No DOM in here, so it can be tested on its own.
//
// The model (a time-series regression with a permutation-style chance check):
//  • Outcome: each day's highest score, for every symptom and body area. By default each
//    item is matched with the symptom it lines up with best (a prawn reaction may only show
//    as swelling); one symptom can also be picked on its own.
//  • Exposure windows: the same day (only counting things logged before that day's last
//    check-in), by the next day, and within 2 days. The best-fitting window is kept.
//  • Slow ups and downs (season, a new treatment, a bad month) are taken out by fitting a
//    smooth trend alongside each item (penalised linear spline, knots every 14 days), so an
//    item is compared with days around the same time. Products are used for weeks at a
//    time, so they are compared period against period instead.
//  • Chance check: the item's dates are slid along the diary (a circular shift) to many
//    other positions, the whole search (every window and symptom) is repeated on each copy,
//    and the real result is ranked against them. This allows for flares that last several
//    days and for having picked the best window and symptom. Weekly routines (work shifts,
//    training days) land back on themselves when slid, so for those the same runs of days
//    are placed at random instead. Beyond the range of the copies, a widened exponential
//    tail is used; its width was tuned on simulated diaries so p-values stay honest.
//  • Things seen on only a few days are pulled toward "no effect" (normal prior, sd 0.8
//    points), and the uncertainty is widened if the copies vary more than theory expects.
//  • Labels (see tierOf) use false-discovery-rate checks (Benjamini–Hochberg) across
//    everything tested, because testing 100 foods throws up a few flukes by chance alone.
//    Products can only reach "possible": one switch can't separate the product from
//    anything else that changed at the same time.
// Simulated diaries (~60 things compared): no false "strong" in 80 trigger-free diaries
// (75 and 180 days). Planted triggers were found (strong or possible) in 58–100% of
// diaries after 75 days and 93–100% after 180 days.

import { addDays, daysBetween } from './ui.js';
import { REGIONS } from './body.js';
import { minutesOf, checkinWorst } from './heat.js';
import { normKey, pluralMap, groupsOf, GROUP_BY_ID, sameFood } from './foods.js';

export const MIN_DAYS = 14;    // days with a check-in before patterns are shown
export const STRONG_DAYS = 28; // days with a check-in before anything can be "strong"
export const TEST_DAYS = 21;   // length of an elimination test
const MAX_DAYS = 365;          // only the most recent year is analysed
const KNOT_DAYS = 14;          // how quickly the trend may bend
const SMOOTH = 1;              // roughness penalty on the trend
const PRIOR_SD = 0.8;          // typical size of a real trigger effect, in points
const MAX_SHIFTS = 199;
const MIN_SHIFTS = 8;
const TAIL_SCALE = 1.5;        // caution when extrapolating beyond the copies
const Z90 = 1.645;

const REGION_IDS = REGIONS.map(r => r.id);
const peak = (obj, keys) => { let m = 0; for (const k of keys) { const v = obj?.[k] || 0; if (v > m) m = v; } return m; };

export const TARGETS = [
  { id: 'worst', label: 'Overall', full: 'Overall (highest score)', value: checkinWorst },
  { id: 'skin', label: 'Skin', full: 'Skin (areas, itch, dryness, swelling)', value: c => Math.max(peak(c.areas, REGION_IDS), peak(c.general, ['itch', 'dry', 'swelling'])) },
  { id: 'sinus', label: 'Sinus', value: c => c.general?.sinus || 0 },
  { id: 'itch', label: 'Itch', value: c => c.general?.itch || 0 },
  { id: 'dry', label: 'Dry skin', value: c => c.general?.dry || 0 },
  { id: 'swelling', label: 'Swelling', value: c => c.general?.swelling || 0 },
  { id: 'face', label: 'Face', body: true, value: c => c.areas?.face || 0 },
  { id: 'neck', label: 'Neck', body: true, value: c => c.areas?.neck || 0 },
  { id: 'arms', label: 'Arms', body: true, value: c => peak(c.areas, ['arm_r', 'arm_l']) },
  { id: 'elbows', label: 'Inner elbows', body: true, value: c => peak(c.areas, ['elbow_r', 'elbow_l']) },
  { id: 'hands', label: 'Hands & wrists', body: true, value: c => peak(c.areas, ['hand_r', 'hand_l']) },
  { id: 'torso', label: 'Chest & stomach', body: true, value: c => c.areas?.torso || 0 },
  { id: 'legs', label: 'Legs', body: true, value: c => c.areas?.legs || 0 },
];
for (const t of TARGETS) t.full ||= t.label;
export const AUTO = { id: 'auto', label: 'Any symptom', full: 'Any symptom (best match)' };
export const targetDef = id => (id === 'auto' ? AUTO : TARGETS.find(t => t.id === id) || AUTO);

// Window w covers lags 0..w days after the item.
export const WINDOWS = [
  { label: 'on the same day', short: 'same day' },
  { label: 'by the next day', short: 'by next day' },
  { label: 'within 2 days', short: 'within 2 days' },
];

export const TIERS = {
  strong: 'Strong link',
  possible: 'Possible link',
  weak: 'Weak hint',
  unclear: 'No clear link',
  fine: 'No sign of a problem',
  few: 'Need more data',
  common: 'Too common to judge',
};
export const TIER_ORDER = Object.keys(TIERS);

const KIND_PREFIX = { food: 'food:', activity: 'act:', group: 'grp:', product: 'prod:' };

// ---------- small statistics helpers ----------

const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
function sd(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

// Benjamini–Hochberg q-values.
function bh(ps) {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const q = new Array(m);
  let min = 1;
  for (let j = m - 1; j >= 0; j--) {
    min = Math.min(min, (order[j][0] * m) / (j + 1));
    q[order[j][1]] = min;
  }
  return q;
}

function invert(A, p) {
  const w = 2 * p;
  const M = new Float64Array(p * w);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) M[i * w + j] = A[i * p + j];
    M[i * w + p + i] = 1;
  }
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(M[r * w + c]) > Math.abs(M[piv * w + c])) piv = r;
    if (Math.abs(M[piv * w + c]) < 1e-12) return null;
    if (piv !== c) for (let j = 0; j < w; j++) { const tmp = M[c * w + j]; M[c * w + j] = M[piv * w + j]; M[piv * w + j] = tmp; }
    const d = M[c * w + c];
    for (let j = 0; j < w; j++) M[c * w + j] /= d;
    for (let r = 0; r < p; r++) {
      const f = M[r * w + c];
      if (r === c || !f) continue;
      for (let j = 0; j < w; j++) M[r * w + j] -= f * M[c * w + j];
    }
  }
  const inv = new Float64Array(p * p);
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) inv[i * p + j] = M[i * w + p + j];
  return inv;
}

// Cholesky factor of a symmetric matrix with two bands either side of the diagonal.
function bandedCholesky(G, p) {
  const L0 = new Float64Array(p), L1 = new Float64Array(p), L2 = new Float64Array(p);
  for (let i = 0; i < p; i++) {
    if (i >= 2) L2[i] = G[i * p + i - 2] / L0[i - 2];
    if (i >= 1) L1[i] = (G[i * p + i - 1] - (i >= 2 ? L2[i] * L1[i - 1] : 0)) / L0[i - 1];
    const d = G[i * p + i] - L1[i] * L1[i] - L2[i] * L2[i];
    if (!(d > 1e-12)) return null;
    L0[i] = Math.sqrt(d);
  }
  return { L0, L1, L2 };
}

// ---------- the trend model ----------
// For each symptom j: y_j = trend_j + β·exposure. The trend is a linear spline with knots
// every ~14 days and a penalty on bending; for products ("flat") it is just the average.
// Symptoms share the same check-in days, so the costly parts are shared too.
function buildModels(ys, n, flat) {
  const J = ys.length;
  const known = new Uint8Array(n);
  let N = 0;
  for (let t = 0; t < n; t++) if (!Number.isNaN(ys[0][t])) { known[t] = 1; N++; }
  const R = new Float64Array(n * J); // residual of symptom j on day t at R[t*J + j]
  const yMy = new Float64Array(J);
  const done = extra => {
    const dead = Uint8Array.from(yMy, v => (v < 1e-9 ? 1 : 0)); // symptoms that never changed
    return { J, known, N, R, yMy, dead, ...extra };
  };
  if (flat || n < 3) {
    for (let j = 0; j < J; j++) {
      let s = 0;
      for (let t = 0; t < n; t++) if (known[t]) s += ys[j][t];
      const avg = N ? s / N : 0;
      for (let t = 0; t < n; t++) if (known[t]) { const r = ys[j][t] - avg; R[t * J + j] = r; yMy[j] += r * r; }
    }
    return done({ flat: true, edf: 1, p: 1 });
  }
  const q = Math.max(1, Math.round((n - 1) / KNOT_DAYS));
  const p = q + 1, step = (n - 1) / q;
  const bi = new Int32Array(n), bw = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const i = Math.min(q - 1, Math.floor(t / step));
    bi[t] = i;
    bw[t] = Math.min(1, t / step - i);
  }
  const BtB = new Float64Array(p * p);
  for (let t = 0; t < n; t++) {
    if (!known[t]) continue;
    const i = bi[t], w = bw[t], a = 1 - w;
    BtB[i * p + i] += a * a; BtB[i * p + i + 1] += a * w;
    BtB[(i + 1) * p + i] += a * w; BtB[(i + 1) * p + i + 1] += w * w;
  }
  const G = BtB.slice();
  for (let j = 0; j + 2 < p; j++) { // second differences of neighbouring knots
    const idx = [j, j + 1, j + 2], c = [1, -2, 1];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) G[idx[a] * p + idx[b]] += SMOOTH * c[a] * c[b];
  }
  for (let j = 0; j < p; j++) G[j * p + j] += 1e-8;
  const Ginv = invert(G, p);
  const chol = Ginv && bandedCholesky(G, p);
  if (!chol) return buildModels(ys, n, true);
  const By = new Float64Array(p), coef = new Float64Array(p);
  for (let j = 0; j < J; j++) {
    const y = ys[j];
    By.fill(0);
    for (let t = 0; t < n; t++) if (known[t]) { const i = bi[t], w = bw[t]; By[i] += (1 - w) * y[t]; By[i + 1] += w * y[t]; }
    for (let a = 0; a < p; a++) { let s = 0; for (let b = 0; b < p; b++) s += Ginv[a * p + b] * By[b]; coef[a] = s; }
    let s = 0;
    for (let t = 0; t < n; t++) {
      if (!known[t]) continue;
      const i = bi[t], w = bw[t];
      const r = y[t] - ((1 - w) * coef[i] + w * coef[i + 1]);
      R[t * J + j] = r;
      s += y[t] * r;
    }
    yMy[j] = Math.max(0, s);
  }
  let edf = 0;
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) edf += Ginv[a * p + b] * BtB[b * p + a];
  return done({ flat: false, edf, p, bi, bw, ...chol });
}

// The same models restricted to one symptom.
function pickTarget(M, j) {
  const R = new Float64Array(M.R.length / M.J);
  for (let t = 0; t < R.length; t++) R[t] = M.R[t * M.J + j];
  return { ...M, J: 1, R, yMy: Float64Array.of(M.yMy[j]), dead: Uint8Array.of(M.dead[j]) };
}

// x'Sx for the trend smoother S, via the banded Cholesky factor (b = B'x).
function quad(M, b, z) {
  let s = 0;
  for (let i = 0; i < M.p; i++) {
    let v = b[i];
    if (i >= 1) v -= M.L1[i] * z[i - 1];
    if (i >= 2) v -= M.L2[i] * z[i - 2];
    z[i] = v / M.L0[i];
    s += z[i] * z[i];
  }
  return s;
}

const workspace = M => ({ sr: new Float64Array(M.J), b: new Float64Array((M.p || 1) + 1), z: new Float64Array((M.p || 1) + 1) });
const fitOut = J => ({ t: new Float64Array(J), beta: new Float64Array(J), se: new Float64Array(J), nE: 0, nU: 0 });

// β for a 0/1 exposure (the list of exposed days), slid k days later, for every symptom.
// With M = I − S: β = x'My / x'Mx, where x'My is simply the sum of the trend residuals on
// exposed days. Returns false when there's too little to compare.
function fitBinary(M, X, k, n, ws, out) {
  const { known, R, J } = M;
  const { sr, b } = ws;
  sr.fill(0);
  if (!M.flat) b.fill(0);
  let nE = 0;
  for (let j = 0; j < X.length; j++) {
    let u = X[j] + k;
    if (u >= n) u -= n;
    if (!known[u]) continue;
    nE++;
    const off = u * J;
    for (let q = 0; q < J; q++) sr[q] += R[off + q];
    if (!M.flat) { const i = M.bi[u], w = M.bw[u]; b[i] += 1 - w; b[i + 1] += w; }
  }
  out.nE = nE;
  out.nU = M.N - nE;
  if (nE < 3 || out.nU < 5) return false;
  const xMx = nE - (M.flat ? (nE * nE) / M.N : quad(M, b, ws.z));
  const dof = M.N - M.edf - 1;
  if (xMx < 0.5 || dof < 3) return false;
  for (let q = 0; q < J; q++) {
    if (M.dead[q]) { out.t[q] = -Infinity; out.beta[q] = 0; out.se[q] = Infinity; continue; }
    const beta = sr[q] / xMx;
    const s2 = Math.max(1e-6, (M.yMy[q] - beta * beta * xMx) / dof);
    out.beta[q] = beta;
    out.se[q] = Math.sqrt(s2 / xMx);
    out.t[q] = beta / out.se[q];
  }
  return true;
}

// The same for a numeric exposure (weather, sleep, stress) on a compact list of days.
// Sliding happens within that list: value j+k is paired with day j.
function fitNumeric(M, days, xs, k, ws, out) {
  const m = days.length, { R, J } = M;
  const { sr, b } = ws;
  sr.fill(0);
  if (!M.flat) b.fill(0);
  let xx = 0, sx = 0;
  for (let i = 0; i < m; i++) {
    let j = i + k;
    if (j >= m) j -= m;
    const x = xs[j], t = days[i], off = t * J;
    for (let q = 0; q < J; q++) sr[q] += x * R[off + q];
    xx += x * x; sx += x;
    if (!M.flat) { const bi = M.bi[t], w = M.bw[t]; b[bi] += (1 - w) * x; b[bi + 1] += w * x; }
  }
  const xMx = xx - (M.flat ? (sx * sx) / M.N : quad(M, b, ws.z));
  const dof = M.N - M.edf - 1;
  if (xMx < 1e-6 || dof < 3) return false;
  for (let q = 0; q < J; q++) {
    if (M.dead[q]) { out.t[q] = 0; out.beta[q] = 0; out.se[q] = Infinity; continue; }
    const beta = sr[q] / xMx;
    const s2 = Math.max(1e-9, (M.yMy[q] - beta * beta * xMx) / dof);
    out.beta[q] = beta;
    out.se[q] = Math.sqrt(s2 / xMx);
    out.t[q] = beta / out.se[q];
  }
  return true;
}

// Slides for the chance check: skip the nearest ~10% (too similar to the real dates).
function shiftList(n) {
  const m = Math.max(3, Math.ceil(0.1 * n));
  const all = [];
  for (let k = m; k <= n - m; k++) all.push(k);
  if (all.length <= MAX_SHIFTS) return all;
  return Array.from({ length: MAX_SHIFTS }, (_, i) => all[Math.floor((i * all.length) / MAX_SHIFTS)]);
}

// Drops slides that put a routine back on its own days (e.g. a weekly shift by 7 days),
// which would otherwise copy the real pattern into the chance check.
function ownShifts(first, n, shifts) {
  const on = [];
  for (let t = 0; t < n; t++) if (first[t] >= 0) on.push(t);
  if (!on.length) return shifts;
  const base = on.length / n, limit = base + 0.5 * (1 - base);
  return shifts.filter(k => {
    let c = 0;
    for (const t of on) { let u = t + k; if (u >= n) u -= n; if (first[u] >= 0) c++; }
    return c / on.length <= limit;
  });
}

// A weekly routine (work shifts, training days) keeps landing on its own days when slid
// by 1–4 weeks.
function isWeekly(first, n) {
  const on = [];
  for (let t = 0; t < n; t++) if (first[t] >= 0) on.push(t);
  if (on.length < 4 || n < 28) return false;
  const base = on.length / n;
  let sum = 0, count = 0;
  for (let k = 7; k <= 28 && k < n; k += 7) {
    let hit = 0;
    for (const t of on) { let u = t + k; if (u >= n) u -= n; if (first[u] >= 0) hit++; }
    sum += hit / on.length;
    count++;
  }
  return sum / count >= base + 0.5 * (1 - base);
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

// For weekly routines, sliding can't break the pattern, so the chance check uses the same
// runs of days (e.g. three shifts in a row) placed at random instead. Seeded, so the same
// diary always gives the same answer. Returns a function giving the next arrangement
// (gaps between runs are a uniformly random composition, at least one day each).
function runShuffler(first, n, seed) {
  const runs = [];
  let cur = null;
  for (let t = 0; t < n; t++) {
    if (first[t] >= 0) { if (!cur) runs.push(cur = []); cur.push(first[t]); } else cur = null;
  }
  const m = runs.length, gaps = n - runs.reduce((s, r) => s + r.length, 0);
  if (!m || gaps < m - 1) return null;
  const R = rng(seed);
  const free = gaps - (m - 1), slots = free + m;
  const pool = new Int32Array(slots);
  const out = new Int16Array(n);
  return () => {
    const order = runs.slice();
    for (let i = m - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (let i = 0; i < slots; i++) pool[i] = i;
    for (let i = 0; i < m; i++) { const j = i + Math.floor(R() * (slots - i)); const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
    const bars = Array.from(pool.subarray(0, m)).sort((a, b) => a - b);
    out.fill(-1);
    let t = bars[0];
    order.forEach((run, i) => {
      if (i > 0) t += bars[i] - bars[i - 1]; // the gap: 1 day plus this run's share of the spare days
      for (const mins of run) out[t++] = mins;
    });
    return out;
  };
}

// Chance of a result at least this strong, from the slid copies. Beyond the bulk of the
// copies it extrapolates with a widened exponential tail fitted to the top fifth. (A
// normal curve made rare-looking results far too convincing; the widening was tuned on
// simulated diaries so that p-values stay honest.)
function tailP(nullVals, x) {
  const N = nullVals.length;
  const ge = nullVals.filter(v => v >= x - 1e-9).length;
  const pEmp = (1 + ge) / (1 + N);
  if (ge >= 10) return pEmp;
  const sorted = [...nullVals].sort((a, b) => a - b);
  const u = sorted[Math.floor(0.8 * (N - 1))];
  const exc = sorted.filter(v => v > u).map(v => v - u);
  const scale = mean(exc);
  if (!(scale > 1e-9) || x <= u) return pEmp;
  return Math.min(pEmp, (exc.length / N) * Math.exp(-(x - u) / (TAIL_SCALE * scale)));
}

// p-values from the slid copies, then the shrunken estimate and its 90% range.
function summarise(beta, se0, tObs, nullMax, nullBest, extrapolate = true) {
  let pEmp = 1, pZ = 1, infl = 1;
  if (nullMax.length >= MIN_SHIFTS) {
    pEmp = (1 + nullMax.filter(v => v >= tObs - 1e-9).length) / (1 + nullMax.length);
    pZ = extrapolate ? tailP(nullMax, tObs) : pEmp;
  }
  if (nullBest.length >= MIN_SHIFTS) infl = Math.max(1, sd(nullBest));
  const se = se0 * infl;
  const shrink = PRIOR_SD ** 2 / (PRIOR_SD ** 2 + se ** 2);
  const est = beta * shrink, post = se * Math.sqrt(shrink);
  return { beta, se, est, lo: est - Z90 * post, hi: est + Z90 * post, pEmp, pZ, nShifts: nullMax.length, infl };
}

// Fits every window and symptom, keeps the best, and runs the chance check on the whole
// search (one-sided: "worse after"). nulls: { shifts } slides the real dates;
// { draws, next } uses randomly placed copies (weekly routines).
function testBinary(M, Xs, n, nulls, ws, extrapolate = true) {
  const outs = Xs.map(() => fitOut(M.J));
  const ok = Xs.map((X, w) => fitBinary(M, X, 0, n, ws, outs[w]));
  let bw = -1, bq = -1, tObs = -Infinity;
  ok.forEach((good, w) => {
    if (!good) return;
    for (let q = 0; q < M.J; q++) if (outs[w].t[q] > tObs) { tObs = outs[w].t[q]; bw = w; bq = q; }
  });
  if (bw < 0) return { best: -1, nE: Math.max(...outs.map(o => o.nE)) };
  const tmp = fitOut(M.J);
  const nullMax = [], nullBest = [];
  const one = (lists, k) => {
    let mx = -Infinity;
    for (let w = 0; w < lists.length; w++) {
      if (!ok[w] || !fitBinary(M, lists[w], k, n, ws, tmp)) continue;
      for (let q = 0; q < M.J; q++) if (tmp.t[q] > mx) mx = tmp.t[q];
      if (w === bw) nullBest.push(tmp.t[bq]);
    }
    if (mx > -Infinity) nullMax.push(mx);
  };
  if (nulls.shifts) for (const k of nulls.shifts) one(Xs, k);
  else for (let d = 0; d < nulls.draws; d++) one(nulls.next(), 0);
  const o = outs[bw];
  return { best: bw, bestQ: bq, nE: o.nE, nU: o.nU, ...summarise(o.beta[bq], o.se[bq], tObs, nullMax, nullBest, extrapolate) };
}

// q: false-discovery-rate q-value among things of the same kind; qAll: among everything
// compared (foods, groups, activities, weather, sleep and stress together).
//  strong   – stands out even if 1 in 10 "links" this strong were flukes (qAll ≤ 10%)
//  possible – would at 3 in 10 (FDR 30%) and is unusual on its own (p ≤ 0.05): worth testing
//  weak     – unusual on its own (p ≤ 0.1), but expected now and then when testing a lot
function tierOf(x, checkinDays) {
  if (x.status !== 'tested') return x.status;
  // A product used for one stretch of time is only compared period against period, so
  // anything else that changed then could explain it: never more than "possible".
  if (x.kind !== 'product' && checkinDays >= STRONG_DAYS && x.qAll <= 0.1 && x.pEmp <= 0.05 && x.est >= 0.5 && x.days >= 5) return 'strong';
  if (x.q <= 0.3 && x.pZ <= 0.05 && x.pEmp <= 0.1 && x.est >= 0.3) return 'possible';
  if (x.pZ <= 0.1 && x.est >= 0.25) return 'weak';
  if (x.hi < 0.5 && x.est <= 0.2 && x.days >= 6) return 'fine';
  return 'unclear';
}

// ---------- weather & lifestyle (numbers rather than yes/no) ----------

const ENV = [
  { key: 'hum', label: 'Humidity', unit: '%', src: 'weather', get: w => w.humMean, pos: 'worse on more humid days', neg: 'worse on drier days', low: 'Driest third', high: 'Most humid third' },
  { key: 'temp', label: 'Temperature', unit: '°', src: 'weather', get: w => w.tMax, pos: 'worse on hotter days', neg: 'worse on cooler days', low: 'Coolest third', high: 'Hottest third' },
  { key: 'uv', label: 'UV', unit: '', src: 'weather', get: w => w.uv, pos: 'worse on high-UV days', neg: 'worse on low-UV days', low: 'Lowest-UV third', high: 'Highest-UV third' },
  { key: 'pm25', label: 'Air pollution (PM2.5)', unit: ' µg/m³', src: 'weather', get: w => w.pm25, pos: 'worse when the air is more polluted', neg: 'worse when the air is cleaner', low: 'Cleanest third', high: 'Most polluted third' },
  { key: 'pollen', label: 'Pollen', unit: '', src: 'weather', get: w => (w.pollen ? Math.max(0, ...Object.values(w.pollen)) : null), pos: 'worse on high-pollen days', neg: 'worse on low-pollen days', low: 'Lowest-pollen third', high: 'Highest-pollen third' },
  { key: 'sleep', label: 'Bad sleep', unit: '', src: 'factor', pos: 'worse after bad sleep', neg: 'worse after good sleep', low: 'Best-sleep third', high: 'Worst-sleep third', note: 'Itching also keeps you awake, so this link can run both ways.' },
  { key: 'stress', label: 'Stress', unit: '', src: 'factor', pos: 'worse on stressful days', neg: 'worse on calm days', low: 'Calmest third', high: 'Most stressful third' },
];

function testNumeric(ys, x, n) {
  const lags = [];
  for (const L of [0, 1]) { // the same day, and the day before
    const dl = [], xl = [];
    for (let t = L; t < n; t++) {
      if (Number.isNaN(ys[0][t]) || Number.isNaN(x[t - L])) continue;
      dl.push(t); xl.push(x[t - L]);
    }
    if (dl.length < MIN_DAYS) continue;
    const mu = mean(xl), s = sd(xl);
    if (s < 1e-9) continue;
    const keep = new Uint8Array(n);
    for (const t of dl) keep[t] = 1;
    const sub = ys.map(y => Float64Array.from(y, (v, t) => (keep[t] ? v : NaN)));
    const M = buildModels(sub, n, false);
    lags.push({ L, days: Int32Array.from(dl), raw: xl, xs: Float64Array.from(xl, v => (v - mu) / s), M, ws: workspace(M) });
  }
  if (!lags.length) return null;
  const J = ys.length;
  const outs = lags.map(() => fitOut(J));
  const ok = lags.map((l, i) => fitNumeric(l.M, l.days, l.xs, 0, l.ws, outs[i]));
  let bl = -1, bq = -1, tObs = -Infinity;
  ok.forEach((good, i) => {
    if (!good) return;
    for (let q = 0; q < J; q++) if (Math.abs(outs[i].t[q]) > tObs) { tObs = Math.abs(outs[i].t[q]); bl = i; bq = q; }
  });
  if (bl < 0 || !(tObs > 0)) return null;
  const tmp = fitOut(J);
  const nullMax = [];
  for (const k of shiftList(Math.min(...lags.map(l => l.days.length)))) { // two-sided: either direction
    let mx = -Infinity;
    lags.forEach((l, i) => {
      if (!ok[i] || !fitNumeric(l.M, l.days, l.xs, k, l.ws, tmp)) return;
      for (let q = 0; q < J; q++) mx = Math.max(mx, Math.abs(tmp.t[q]));
    });
    if (mx > -Infinity) nullMax.push(mx);
  }
  const s = summarise(1, 1, tObs, nullMax, []);
  // Plain-language size: the worst third of days against the opposite third.
  const l = lags[bl];
  const order = Array.from(l.days.keys()).sort((a, b) => l.raw[a] - l.raw[b]);
  const third = Math.floor(order.length / 3);
  const parts = [order.slice(0, third), order.slice(third, order.length - third), order.slice(order.length - third)];
  const resid = parts.map(idx => mean(idx.map(i => l.M.R[l.days[i] * J + bq])));
  const dir = outs[bl].beta[bq] > 0 ? 1 : -1;
  return {
    lag: l.L, q: bq, dir, n: l.days.length, pEmp: s.pEmp, pZ: s.pZ, nShifts: s.nShifts,
    eff: dir > 0 ? resid[2] - resid[0] : resid[0] - resid[2],
    thirds: parts.map(idx => ({ from: l.raw[idx[0]], to: l.raw[idx.at(-1)], avg: mean(idx.map(i => ys[bq][l.days[i]])), n: idx.length })),
  };
}

function envTier(e, checkinDays) {
  if (checkinDays >= STRONG_DAYS && e.qAll <= 0.1 && e.pEmp <= 0.05 && e.eff >= 0.5) return 'strong';
  if (e.fdr <= 0.3 && e.pZ <= 0.05 && e.pEmp <= 0.1 && e.eff >= 0.3) return 'possible';
  if (e.pZ <= 0.1 && e.eff >= 0.25) return 'weak';
  return 'unclear';
}

// ---------- what has been logged so far (shown before there's enough data) ----------

function tracking(entries, products) {
  const foods = new Set(), acts = new Set();
  for (const e of entries) {
    const set = e.type === 'food' ? foods : e.type === 'activity' ? acts : null;
    if (set) for (const it of e.items || []) { const k = normKey(it); if (k) set.add(k); }
  }
  const groups = new Set();
  for (const f of foods) for (const g of groupsOf(f)) groups.add(g);
  return {
    foods: foods.size,
    activities: acts.size,
    products: new Set(products.map(p => normKey(p.name))).size,
    groups: [...groups].map(g => GROUP_BY_ID[g].label),
  };
}

const topLabel = labels => [...labels.entries()].sort((a, b) => b[1] - a[1])[0][0];
const isExcluded = (list, name) => (list || []).some(e => sameFood(e, name));

// ---------- the main analysis ----------

export function analyze({ entries = [], products = [], weather = new Map(), target = 'auto', exclusions = {} } = {}) {
  const T = targetDef(target);
  const auto = T.id === 'auto';
  const checks = entries.filter(e => e.type === 'symptoms' && e.day);
  const checkDays = [...new Set(checks.map(c => c.day))].sort();
  const res = { target: T, auto, ready: false, checkinDays: checkDays.length, needDays: MIN_DAYS, items: [], env: [], tracked: tracking(entries, products) };
  if (checkDays.length < MIN_DAYS) return res;

  const to = checkDays.at(-1);
  let from = addDays(checkDays[0], -2); // so the first check-ins can see the 2 days before
  if (daysBetween(from, to) >= MAX_DAYS) from = addDays(to, -(MAX_DAYS - 1));
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const n = days.length;
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const inRange = checks.filter(c => dayIndex.has(c.day));
  const lastCheck = new Int16Array(n).fill(-1);
  for (const c of inRange) {
    const t = dayIndex.get(c.day), m = minutesOf(c.time);
    if (m > lastCheck[t]) lastCheck[t] = m;
  }
  // Each symptom's highest score per day (NaN = no check-in that day).
  const ys = TARGETS.map(def => {
    const y = new Float64Array(n).fill(NaN);
    for (const c of inRange) {
      const t = dayIndex.get(c.day), v = def.value(c);
      if (Number.isNaN(y[t]) || v > y[t]) y[t] = v;
    }
    return y;
  });
  const allTrend = buildModels(ys, n, false);
  const allFlat = buildModels(ys, n, true);
  Object.assign(res, { from, to, days: n, checkinDays: allTrend.N, since: days[allTrend.known.indexOf(1)] });
  if (allTrend.N < MIN_DAYS) return res;
  res.ready = true;
  const ti = auto ? -1 : TARGETS.indexOf(T);
  const trend = auto ? allTrend : pickTarget(allTrend, ti);
  const flat = auto ? allFlat : pickTarget(allFlat, ti);
  const qTarget = q => (auto ? TARGETS[q] : T); // symptom behind result column q
  if ([...flat.dead].every(Boolean)) { res.noVariation = true; return res; }
  const known = allTrend.known;

  // "Bad day" for a symptom: in your worst quarter of days.
  const badFor = j => {
    const v = ys[j].filter(x => !Number.isNaN(x)).sort((a, b) => a - b);
    return Math.min(v.at(-1), Math.max(1, Math.ceil(v[Math.floor(0.75 * (v.length - 1))])));
  };

  // ----- collect exposures -----
  const items = new Map();
  const getItem = (kind, name, extra) => {
    const key = KIND_PREFIX[kind] + name;
    let x = items.get(key);
    if (!x) items.set(key, x = { key, kind, name, first: new Int16Array(n).fill(-1), labels: new Map(), ...extra });
    return x;
  };
  const rawKeys = { food: new Set(), activity: new Set() };
  for (const e of entries) {
    if ((e.type === 'food' || e.type === 'activity') && dayIndex.has(e.day)) for (const it of e.items || []) { const k = normKey(it); if (k) rawKeys[e.type].add(k); }
  }
  const merge = { food: pluralMap([...rawKeys.food]), activity: pluralMap([...rawKeys.activity]) };
  for (const e of entries) {
    if (e.type !== 'food' && e.type !== 'activity') continue;
    const t = dayIndex.get(e.day);
    if (t === undefined) continue;
    const mins = minutesOf(e.time);
    for (const it of e.items || []) {
      const k0 = normKey(it);
      if (!k0) continue;
      const x = getItem(e.type, merge[e.type].get(k0) || k0);
      if (x.first[t] < 0 || mins < x.first[t]) x.first[t] = mins;
      const label = it.trim().replace(/\s+/g, ' ');
      x.labels.set(label, (x.labels.get(label) || 0) + 1);
    }
  }
  for (const p of products) {
    if (!p?.name || !p.start) continue;
    const x = getItem('product', normKey(p.name), { category: p.category });
    const end = p.end && p.end < to ? p.end : to;
    for (let t = 0; t < n; t++) if (days[t] >= p.start && days[t] <= end) x.first[t] = 0;
    x.labels.set(p.name, (x.labels.get(p.name) || 0) + 1);
  }
  for (const f of [...items.values()].filter(x => x.kind === 'food')) {
    f.label = topLabel(f.labels);
    for (const gid of groupsOf(f.name)) {
      const g = getItem('group', gid, { label: GROUP_BY_ID[gid].label, about: GROUP_BY_ID[gid].about, members: [] });
      const excluded = isExcluded(exclusions?.[gid], f.name);
      let d = 0;
      for (let t = 0; t < n; t++) if (f.first[t] >= 0) d++;
      g.members.push({ key: f.key, name: f.name, label: f.label, days: d, excluded });
      if (excluded) continue;
      for (let t = 0; t < n; t++) { const m = f.first[t]; if (m >= 0 && (g.first[t] < 0 || m < g.first[t])) g.first[t] = m; }
    }
  }

  // Exposed days for each window: same day (logged before the last check-in), +1, +2.
  const windowLists = (first, isProduct) => {
    if (isProduct) {
      const X = [];
      for (let t = 0; t < n; t++) if (first[t] >= 0) X.push(t);
      return [Int32Array.from(X)];
    }
    const lists = [[], [], []];
    for (let t = 0; t < n; t++) {
      const e0 = first[t] >= 0 && (lastCheck[t] < 0 || first[t] <= lastCheck[t]);
      const e1 = e0 || (t >= 1 && first[t - 1] >= 0);
      const e2 = e1 || (t >= 2 && first[t - 2] >= 0);
      if (e0) lists[0].push(t);
      if (e1) lists[1].push(t);
      if (e2) lists[2].push(t);
    }
    return lists.map(l => Int32Array.from(l));
  };
  const countKnown = X => { let c = 0; for (const t of X) if (known[t]) c++; return c; };

  // ----- test everything -----
  const shifts = shiftList(n);
  const wsTrend = workspace(trend), wsFlat = workspace(flat);
  const list = [];
  for (const x of items.values()) {
    const isProd = x.kind === 'product';
    x.label ||= topLabel(x.labels);
    x.Xs = windowLists(x.first, isProd);
    x.days = 0;
    for (let t = 0; t < n; t++) if (x.first[t] >= 0) x.days++;
    const same = countKnown(x.Xs[0]), widest = countKnown(x.Xs.at(-1));
    x.share = same / allTrend.N;
    // A group with only one food in it is just that food again: don't list or test it twice.
    if (x.members && x.members.filter(m => !m.excluded).length < 2) { x.status = x.tier = 'dup'; continue; }
    if (x.days < 3 || widest < 3) x.status = 'few';
    else if (x.share >= 0.85 || allTrend.N - same < 5) x.status = 'common';
    else {
      x.weekly = !isProd && isWeekly(x.first, n);
      const shuffle = x.weekly && runShuffler(x.first, n, hash(x.key));
      const nulls = shuffle
        ? { draws: Math.min(MAX_SHIFTS, Math.max(99, shifts.length)), next: () => windowLists(shuffle(), false) }
        : { shifts: ownShifts(x.first, n, shifts) };
      const r = testBinary(isProd ? flat : trend, x.Xs, n, nulls, isProd ? wsFlat : wsTrend, !isProd);
      if (r.best < 0) x.status = r.nE < 3 ? 'few' : 'common';
      else Object.assign(x, r, { status: 'tested', symptom: qTarget(r.bestQ) });
    }
    list.push(x);
  }
  for (const x of items.values()) if (x.members) x.members.sort((a, b) => b.days - a.days || a.label.localeCompare(b.label));
  const tested = list.filter(x => x.status === 'tested');
  res.tested = tested.length;

  // ----- weather & lifestyle -----
  const envYs = auto ? ys : [ys[ti]];
  for (const def of ENV) {
    const x = new Float64Array(n).fill(NaN);
    if (def.src === 'weather') {
      for (let t = 0; t < n; t++) {
        const w = weather.get(days[t]);
        const v = w ? def.get(w) : null;
        if (v != null && Number.isFinite(v)) x[t] = v;
      }
    } else {
      for (const c of inRange) {
        const v = c.factors?.[def.key];
        if (!(v > 0)) continue;
        const t = dayIndex.get(c.day);
        if (Number.isNaN(x[t]) || v > x[t]) x[t] = v;
      }
    }
    const r = testNumeric(envYs, x, n);
    if (r) res.env.push({ ...def, key: 'env:' + def.key, ...r, symptom: qTarget(r.q) });
  }

  // ----- labels -----
  // "Possible" is judged within each kind (things, products, weather & lifestyle). "Strong"
  // is judged across everything compared together, so a small family (6 weather and
  // lifestyle checks) can't let a one-in-ten fluke through.
  const things = tested.filter(x => x.kind !== 'product');
  bh(things.map(x => x.pZ)).forEach((q, i) => { things[i].q = q; });
  const prods = tested.filter(x => x.kind === 'product');
  bh(prods.map(x => x.pZ)).forEach((q, i) => { prods[i].q = q; });
  bh(res.env.map(e => e.pZ)).forEach((q, i) => { res.env[i].fdr = q; });
  const together = [...things, ...res.env];
  bh(together.map(x => x.pZ)).forEach((q, i) => { together[i].qAll = q; });
  res.compared = together.length;
  for (const x of list) x.tier = tierOf(x, allTrend.N);
  for (const e of res.env) e.tier = envTier(e, allTrend.N);

  const rank = t => TIER_ORDER.indexOf(t);
  const within = (a, b) => {
    if (a.tier === 'few' || a.tier === 'fine') return b.days - a.days;
    if (a.tier === 'common') return b.share - a.share;
    return b.est - a.est;
  };
  list.sort((a, b) => rank(a.tier) - rank(b.tier) || within(a, b) || a.label.localeCompare(b.label));
  res.items = list;
  res.lookup = key => items.get(key); // also finds one-food groups, which aren't listed
  res.env.sort((a, b) => rank(a.tier) - rank(b.tier) || b.eff - a.eff);

  let lo = -1, hi = 2;
  for (const x of tested) { lo = Math.min(lo, x.lo); hi = Math.max(hi, x.hi); }
  res.scale = { min: Math.max(-3, Math.floor(lo)), max: Math.min(5, Math.ceil(hi)) };

  // ----- details for one item (worked out when it's opened) -----
  res.detail = key => {
    const x = items.get(key);
    if (!x) return null;
    const isProd = x.kind === 'product';
    const M = isProd ? allFlat : allTrend;
    const ws = workspace(M);
    const out = fitOut(M.J);
    const w = x.status === 'tested' ? x.best : x.Xs.length - 1;
    const X = x.Xs[w];
    const sym = x.symptom || (auto ? TARGETS[0] : T);
    const j = TARGETS.indexOf(sym);
    const y = ys[j];

    const bad = badFor(j);
    const inX = new Uint8Array(n);
    for (const t of X) inX[t] = 1;
    const plain = { bad, withN: 0, withSum: 0, withBad: 0, withoutN: 0, withoutSum: 0, withoutBad: 0 };
    for (let t = 0; t < n; t++) {
      if (!known[t]) continue;
      const side = inX[t] ? 'with' : 'without';
      plain[side + 'N']++;
      plain[side + 'Sum'] += y[t];
      if (y[t] >= bad) plain[side + 'Bad']++;
    }
    plain.withAvg = plain.withN ? plain.withSum / plain.withN : null;
    plain.withoutAvg = plain.withoutN ? plain.withoutSum / plain.withoutN : null;

    // Day by day after it (for the symptom shown).
    const lags = isProd ? null : [0, 1, 2, 3].map(L => {
      const XL = [];
      for (let t = L; t < n; t++) {
        const f = x.first[t - L];
        if (f < 0 || (L === 0 && lastCheck[t] >= 0 && f > lastCheck[t])) continue;
        XL.push(t);
      }
      return { lag: L, beta: fitBinary(M, Int32Array.from(XL), 0, n, ws, out) ? out.beta[j] : null };
    });

    // Every symptom, in the same window.
    const byTarget = fitBinary(M, X, 0, n, ws, out)
      ? TARGETS.map((def, q) => (M.dead[q] ? null : { id: def.id, label: def.label, beta: out.beta[q], shown: q === j })).filter(Boolean)
      : [];

    const timeline = [];
    for (let t = Math.max(0, n - 84); t < n; t++) timeline.push({ day: days[t], y: known[t] ? y[t] : null, on: x.first[t] >= 0 });

    const mine = [];
    for (let t = 0; t < n; t++) if (x.first[t] >= 0) mine.push(t);
    const memberKeys = new Set((x.members || []).map(m => m.key));
    const together = [];
    if (!isProd && mine.length) {
      for (const o of items.values()) {
        if (o === x || o.kind === 'group' || o.kind === 'product' || memberKeys.has(o.key)) continue;
        let c = 0;
        for (const t of mine) if (o.first[t] >= 0) c++;
        // Only things that come together more than chance would (not everyday staples).
        const expected = (mine.length * o.days) / n;
        if (c >= 3 && c / mine.length >= 0.5 && c >= 1.5 * expected) together.push({ key: o.key, label: o.label, kind: o.kind, days: c, of: mine.length });
      }
      together.sort((a, b) => b.days - a.days || a.label.localeCompare(b.label));
    }
    const partOf = x.kind === 'food'
      ? groupsOf(x.name).map(g => ({ key: KIND_PREFIX.group + g, label: GROUP_BY_ID[g].label, excluded: isExcluded(exclusions?.[g], x.name) }))
      : [];
    return { window: w, symptom: sym, plain, lags, byTarget, timeline, together: together.slice(0, 4), partOf, members: x.members || null };
  };
  return res;
}

// ---------- elimination tests ----------
// trial: { id, key, label, start, days, end }

function trialMatcher(trial, exclusions) {
  const [prefix, ...rest] = trial.key.split(':');
  const name = rest.join(':');
  if (prefix === 'grp') return (type, it) => type === 'food' && groupsOf(normKey(it)).includes(name) && !isExcluded(exclusions?.[name], normKey(it));
  const kind = prefix === 'act' ? 'activity' : 'food';
  return (type, it) => type === kind && sameFood(it, name);
}

export function trialStats({ entries, trial, target = 'worst', exclusions = {}, today }) {
  const T = TARGETS.find(t => t.id === target) || TARGETS[0];
  const planned = trial.days || TEST_DAYS;
  const end = trial.end || today;
  const daily = new Map();
  for (const c of entries) {
    if (c.type !== 'symptoms') continue;
    const v = T.value(c);
    if (!daily.has(c.day) || v > daily.get(c.day)) daily.set(c.day, v);
  }
  const over = (a, b) => {
    let s = 0, k = 0;
    for (const [d, v] of daily) if (d >= a && d <= b) { s += v; k++; }
    return { avg: k ? s / k : null, n: k };
  };
  const dayNum = Math.max(1, daysBetween(trial.start, end) + 1);
  const matches = trialMatcher(trial, exclusions);
  const slips = [];
  for (const e of entries) {
    if ((e.type !== 'food' && e.type !== 'activity') || e.day < trial.start || e.day > end) continue;
    for (const it of e.items || []) if (matches(e.type, it)) slips.push({ day: e.day, item: it });
  }
  slips.sort((a, b) => a.day.localeCompare(b.day));
  return {
    symptom: T,
    before: over(addDays(trial.start, -TEST_DAYS), addDays(trial.start, -1)),
    during: over(trial.start, end),
    last7: dayNum >= 10 ? over(addDays(end, -6), end) : null,
    dayNum, planned, complete: dayNum >= planned, end, slips,
  };
}
