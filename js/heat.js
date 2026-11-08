// The day-by-day colour grid, shared by the Trends screen and the specialist report.
// Each square is one day. Inside a square, time runs left to right from midnight to
// midnight, and the colour blends between that day's check-ins, so a flare at 5 pm
// that settled by 9 pm shows as a red patch fading back to pale.

import { h, shortDate } from './ui.js';
import { REGIONS, GENERAL, FACTORS } from './body.js';

export const minutesOf = t => {
  const [hh, mm] = String(t || '12:00').split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
};

// The highest symptom score in one check-in (sleep and stress don't count).
export const checkinWorst = c => Math.max(0, ...Object.values(c.areas || {}), ...Object.values(c.general || {}));

export function checkinsByDay(entries) {
  const byDay = new Map();
  for (const e of entries) {
    if (e.type !== 'symptoms') continue;
    let list = byDay.get(e.day);
    if (!list) byDay.set(e.day, list = []);
    list.push(e);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.time.localeCompare(b.time));
  return byDay;
}

// Highest score per day for every area / symptom / factor (used for summaries).
export function dailyScores(entries) {
  const daily = new Map();
  for (const e of entries) {
    if (e.type !== 'symptoms') continue;
    let d = daily.get(e.day);
    if (!d) daily.set(e.day, d = {});
    for (const [k, v] of Object.entries(e.areas || {})) d[k] = Math.max(d[k] || 0, v);
    for (const [k, v] of Object.entries(e.general || {})) d['g:' + k] = Math.max(d['g:' + k] || 0, v);
    for (const [k, v] of Object.entries(e.factors || {})) d['f:' + k] = Math.max(d['f:' + k] || 0, v);
  }
  return daily;
}

export function heatRows(hasWeather) {
  return [
    { key: 'worst', label: 'Overall', full: 'Overall (highest score)' },
    ...GENERAL.map((g, i) => ({ key: 'g:' + g.id, label: g.label, full: g.label, gap: i === 0 })),
    ...REGIONS.map((r, i) => ({ key: r.id, label: r.short, full: r.label, gap: i === 0 })),
    // Sleep and stress only count when actually recorded (blank ≠ zero).
    ...FACTORS.map((f, i) => ({ key: 'f:' + f.id, label: f.short, full: f.label, gap: i === 0, optional: true })),
    ...(hasWeather ? [{ key: 'w:hum', label: 'Humidity', full: 'Humidity', gap: true, weather: true }] : []),
  ];
}

// One row's value in one check-in. null = not recorded (only possible for sleep/stress).
export function checkinValue(row, c) {
  if (row.key === 'worst') return checkinWorst(c);
  if (row.key.startsWith('g:')) return c.general?.[row.key.slice(2)] || 0;
  if (row.key.startsWith('f:')) return c.factors?.[row.key.slice(2)] || null;
  return c.areas?.[row.key] || 0;
}

// [[percent of the day, score], ...] for one row across a day's check-ins.
export function dayStops(row, checkins) {
  const stops = [];
  for (const c of checkins || []) {
    const v = checkinValue(row, c);
    if (v != null) stops.push([minutesOf(c.time) / 14.4, v]);
  }
  return stops;
}

const colour = v => (v ? `var(--sev${v})` : 'var(--zero)');

// Colours `el` from the stops (a solid colour, or a blend through the day) and
// returns the class to give it.
function paint(el, stops) {
  if (!stops.length) return 'nodata';
  if (stops.every(s => s[1] === stops[0][1])) return stops[0][1] ? 'sev-' + stops[0][1] : 'zero';
  el.style.backgroundImage = `linear-gradient(to right, ${stops.map(([p, v]) => `${colour(v)} ${p.toFixed(1)}%`).join(', ')})`;
  return 'grad';
}

export const humBucket = v => Math.min(10, Math.max(1, Math.ceil(v / 10)));

// cell: fixed pixel width (Trends, scrolls sideways) or null for columns that stretch (report).
export function heatGrid({ days, checkins, weather, rows, cell = null, labelW = 64, prefix = 'heat', labelEvery }) {
  const grid = h('div', { class: prefix });
  grid.style.gridTemplateColumns = cell
    ? `${labelW}px repeat(${days.length}, ${cell}px)`
    : `${labelW}px repeat(${days.length}, minmax(0, 1fr))`;
  rows.forEach((row, ri) => {
    const gap = row.gap ? ' gap-top' : '';
    grid.append(h('div', { class: `${prefix}-label${gap}` }, row.label));
    for (const d of days) {
      const el = h('div', { 'data-day': d, 'data-row': String(ri) });
      let cls;
      if (row.weather) {
        const w = weather.get(d);
        cls = w && w.humMean != null ? 'hum-' + humBucket(w.humMean) : 'nodata';
      } else {
        cls = paint(el, dayStops(row, checkins.get(d)));
      }
      el.className = `${prefix}-cell${gap} ${cls}`;
      grid.append(el);
    }
  });
  // Date labels underneath, counted back from the newest day; they overflow leftwards.
  grid.append(h('div', { class: `${prefix}-label` }));
  const every = labelEvery || (days.length <= 14 ? 2 : 7);
  const first = Math.ceil(38 / ((cell || 16) + 2));
  days.forEach((d, i) => grid.append(h('div', { class: `${prefix}-date` }, (days.length - 1 - i) % every === 0 && i >= first ? shortDate(d) : '')));
  return grid;
}

export function weatherText(w) {
  if (!w) return '';
  const parts = [`${Math.round(w.tMax)}° / ${Math.round(w.tMin)}°`];
  if (w.humMean != null) parts.push(`humidity ${Math.round(w.humMean)}%` + (w.humMin != null ? ` (low ${Math.round(w.humMin)}%)` : ''));
  if (w.rain) parts.push(`rain ${w.rain} mm`);
  if (w.uv != null) parts.push(`UV ${Math.round(w.uv)}`);
  if (w.pm25 != null) parts.push(`PM2.5 ${w.pm25}`);
  if (w.pollen) {
    const p = Object.entries(w.pollen).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`);
    if (p.length) parts.push('pollen ' + p.join(', '));
  }
  return parts.join(' · ');
}

export function heatLegend(hasWeather) {
  const ramp = cls => h('span', { class: 'ramp' }, Array.from({ length: 10 }, (_, i) => h('i', { class: `${cls}-${i + 1}` })));
  return h('div', { class: 'legend' },
    h('span', { class: 'legend-item' }, h('i', { class: 'lg nodata' }), 'No check-in'),
    h('span', { class: 'legend-item' }, h('i', { class: 'lg zero' }), 'Clear'),
    h('span', { class: 'legend-item' }, 'Score 1', ramp('sev'), '10'),
    hasWeather ? h('span', { class: 'legend-item' }, 'Humidity: dry', ramp('hum'), 'humid') : null);
}

// ---------- one day as a line chart ----------

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, cls, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  if (cls) el.setAttribute('class', cls);
  if (text != null) el.textContent = text;
  return el;
}
let chartIds = 0;

// Score (0–10) against time of day for one row, over the same colour blend as its grid square.
export function dayChart(row, checkins) {
  const W = 320, H = 160, L = 26, R = 12, T = 20, B = 24;
  const pw = W - L - R, ph = H - T - B;
  const x = m => L + (m / 1440) * pw;
  const y = v => T + (1 - v / 10) * ph;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${row.full} through the day` }, 'day-chart');

  const stops = dayStops(row, checkins);
  if (stops.length) {
    const id = `daygrad${++chartIds}`;
    const grad = svg('linearGradient', { id, x1: '0', x2: '1', y1: '0', y2: '0' });
    for (const [p, v] of stops) {
      const stop = svg('stop', { offset: String(p / 100) });
      stop.style.stopColor = colour(v);
      grad.append(stop);
    }
    root.append(svg('defs', {}, null), svg('rect', { x: L, y: T, width: pw, height: ph, rx: 6, fill: `url(#${id})` }, 'band'));
    root.firstChild.append(grad);
  }
  for (const v of [0, 5, 10]) {
    root.append(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v) }, 'gridline'));
    root.append(svg('text', { x: L - 6, y: y(v) + 3.5, 'text-anchor': 'end' }, 'axis', v));
  }
  [[0, '00:00'], [360, '06:00'], [720, '12:00'], [1080, '18:00'], [1440, '24:00']].forEach(([m, label], i) =>
    root.append(svg('text', { x: x(m), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle' }, 'axis', label)));

  const pts = (checkins || []).map(c => [minutesOf(c.time), checkinValue(row, c)]).filter(p => p[1] != null);
  if (pts.length > 1) root.append(svg('polyline', { points: pts.map(([m, v]) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(' ') }, 'line'));
  for (const [m, v] of pts) {
    root.append(svg('circle', { cx: x(m).toFixed(1), cy: y(v).toFixed(1), r: 5.5 }, 'pt ' + (v ? 'sev-' + v : 'zero')));
    root.append(svg('text', { x: x(m).toFixed(1), y: (y(v) - 10).toFixed(1), 'text-anchor': 'middle' }, 'pt-label', v));
  }
  return root;
}
