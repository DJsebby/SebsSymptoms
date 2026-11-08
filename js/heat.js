// The day-by-day colour grid, shared by the Trends screen and the specialist report.

import { h, shortDate, parseDay } from './ui.js';
import { REGIONS, GENERAL, FACTORS } from './body.js';

// Highest score per day for every area / symptom / factor (several check-ins a day → keep the worst).
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
    ...GENERAL.map(g => ({ key: 'g:' + g.id, label: g.label, full: g.label })),
    ...REGIONS.map((r, i) => ({ key: r.id, label: r.short, full: r.label, gap: i === 0 })),
    // Sleep and stress are only counted when actually recorded (blank ≠ zero).
    ...FACTORS.map((f, i) => ({ key: 'f:' + f.id, label: f.short, full: f.label, gap: i === 0, optional: true })),
    ...(hasWeather ? [{ key: 'w:hum', label: 'Humidity', full: 'Humidity', gap: true, weather: true }] : []),
  ];
}

export const humBucket = v => Math.min(10, Math.max(1, Math.ceil(v / 10)));

function cellClass(row, day, daily, weather) {
  if (row.weather) {
    const w = weather.get(day);
    return w && w.humMean != null ? 'hum-' + humBucket(w.humMean) : 'nodata';
  }
  const dd = daily.get(day);
  if (!dd) return 'nodata';
  const v = dd[row.key];
  if (v == null && row.optional) return 'nodata';
  return v ? 'sev-' + v : 'zero';
}

// cell: fixed pixel width (Trends, scrolls sideways) or null for columns that stretch (report).
export function heatGrid({ days, daily, weather, rows, cell = null, labelW = 64, prefix = 'heat', labelEvery }) {
  const grid = h('div', { class: prefix });
  grid.style.gridTemplateColumns = cell
    ? `${labelW}px repeat(${days.length}, ${cell}px)`
    : `${labelW}px repeat(${days.length}, minmax(0, 1fr))`;
  rows.forEach((row, ri) => {
    const gap = row.gap ? ' gap-top' : '';
    grid.append(h('div', { class: `${prefix}-label${gap}` }, row.label));
    for (const d of days) {
      grid.append(h('div', { class: `${prefix}-cell${gap} ${cellClass(row, d, daily, weather)}`, 'data-day': d, 'data-row': String(ri) }));
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

export function describeCell(day, row, daily, weather) {
  const when = parseDay(day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const w = weather.get(day);
  if (row.weather) return w ? `${when}: ${weatherText(w)}` : `${when}: no weather data`;
  const dd = daily.get(day);
  if (!dd) return `${when}: no check-in` + (w ? `. Weather ${weatherText(w)}` : '');
  const v = dd[row.key];
  const text = `${when}: ${row.full} ${v ? v + ' / 10' : row.optional ? 'not recorded' : 'clear'}`;
  return w ? `${text}. Weather ${weatherText(w)}` : text;
}

export function heatLegend(hasWeather) {
  const ramp = cls => h('span', { class: 'ramp' }, Array.from({ length: 10 }, (_, i) => h('i', { class: `${cls}-${i + 1}` })));
  return h('div', { class: 'legend' },
    h('span', { class: 'legend-item' }, h('i', { class: 'lg nodata' }), 'No check-in'),
    h('span', { class: 'legend-item' }, h('i', { class: 'lg zero' }), 'Clear'),
    h('span', { class: 'legend-item' }, 'Score 1', ramp('sev'), '10'),
    hasWeather ? h('span', { class: 'legend-item' }, 'Humidity: dry', ramp('hum'), 'humid') : null);
}
