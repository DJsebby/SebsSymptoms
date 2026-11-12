// Specialist report: one document summarising a period, for appointments.
// It is built as DOM for the in-app preview, and the same DOM is saved as a
// standalone HTML file (photos embedded) that opens, prints and emails anywhere.

import { h, addDays, parseDay, dayKey } from './ui.js';
import { REGIONS, GENERAL, FACTORS } from './body.js';
import { dailyScores, checkinsByDay, heatRows, heatGrid, heatLegend } from './heat.js';
import { poemBand, POEM_CREDIT } from './poem.js';
import { trialStats, TIERS, WINDOWS } from './insights.js';

const fmt = d => parseDay(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = d => parseDay(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const r1 = v => (v == null ? '–' : String(Math.round(v * 10) / 10));
const byTime = (a, b) => (a.day + a.time).localeCompare(b.day + b.time);
const TYPE_LABEL = { symptoms: 'Check-in', food: 'Food', activity: 'Activity', meds: 'Meds & creams', note: 'Note', photo: 'Photo', poem: 'POEM' };

function table(head, rows, numCols = []) {
  const cls = i => (numCols.includes(i) ? 'num' : null);
  return h('table', {},
    h('thead', {}, h('tr', {}, head.map((t, i) => h('th', { class: cls(i) }, t)))),
    h('tbody', {}, rows.map(r => h('tr', {}, r.map((c, i) => h('td', { class: cls(i) }, c))))));
}
const section = (title, ...kids) => h('section', { class: 'rpt-sec' }, h('h2', {}, title), kids);
const signed = v => (Math.abs(v) < 0.05 ? '0.0' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1));

// Patterns from the Triggers analysis (run on this period), plus any elimination tests.
function patternsSection(p, trials, entries, exclusions, from, to) {
  if (!p) return null;
  if (!p.ready) {
    return section('Possible triggers', h('p', { class: 'note' },
      `Not enough data in this period to look for patterns (it needs ${p.needDays} days with a check-in; this period has ${p.checkinDays}).`));
  }
  const linked = p.items.filter(x => ['strong', 'possible', 'weak'].includes(x.tier)).slice(0, 15);
  const fine = p.items.filter(x => x.tier === 'fine');
  const common = p.items.filter(x => x.tier === 'common');
  const env = p.env.filter(e => e.tier !== 'unclear');
  const tests = trials.filter(t => t.start <= to && (t.end || to) >= from).sort((a, b) => a.start.localeCompare(b.start));
  const kind = x => ({ group: ' (food group)', activity: ' (activity)', product: ' (product)' })[x.kind] || '';
  const short = { strong: 'Strong', possible: 'Possible', weak: 'Weak' };
  return section('Possible triggers (patterns in the diary)',
    h('p', { class: 'note' }, `How these were found: for each food, food group, activity and product, the daily score (highest of the day's check-ins) is compared with nearby days without it, after removing slow trends, at the delay (same day, next day or within 2 days) and symptom where it lines up best. Evidence comes from a permutation test (the item's dates are moved to other places in the diary and the search repeated) with false-discovery-rate control across the ${p.tested} items compared. "Change" is the estimated rise in points on the 0–10 scale, with its 90% range underneath. These are associations, not proof; products are compared period against period.`),
    linked.length
      ? table(['Item', 'Linked to', 'Change', 'Days', 'Evidence'], linked.map(x => [
        x.label + kind(x), `${x.symptom.label}, ${x.kind === 'product' ? 'while in use' : WINDOWS[x.best].short}`,
        [h('b', {}, signed(x.est)), h('br'), h('span', { class: 'range' }, `${signed(x.lo)} to ${signed(x.hi)}`)], String(x.days), short[x.tier]]), [2, 3])
      : h('p', {}, 'Nothing stood out in this period.'),
    fine.length ? h('p', { class: 'note' }, 'No sign of a problem (logged often, no rise afterwards): ' + fine.slice(0, 25).map(x => x.label + kind(x)).join(', ') + '.') : null,
    common.length ? h('p', { class: 'note' }, 'Too common to judge (almost every day): ' + common.map(x => x.label + kind(x)).join(', ') + '.') : null,
    env.length ? table(['Weather, sleep & stress', 'Pattern', 'Size', 'Evidence'],
      env.map(e => [e.label, `${e.symptom.label} ${e.dir > 0 ? e.pos : e.neg}`, signed(e.eff), TIERS[e.tier]]), [2]) : null,
    tests.length ? [
      h('h3', {}, 'Elimination tests'),
      table(['Without', 'Dates', 'Symptom', '3 weeks before', 'During', 'Logged anyway'], tests.map(t => {
        const st = trialStats({ entries, trial: t, target: t.symptom, exclusions, today: to });
        return [t.label, `${fmtShort(t.start)} – ${t.end ? fmtShort(t.end) : 'ongoing'}`, st.symptom.label, r1(st.before.avg), r1(st.during.avg), String(st.slips.length)];
      }), [3, 4, 5]),
      h('p', { class: 'note' }, 'Average daily score (highest check-in of each day). "Logged anyway" counts diary entries of the item during the test.'),
    ] : null);
}
const stat = (value, label) => h('div', { class: 'stat' }, h('b', {}, value), h('span', {}, label));

function itemDays(entries, type) {
  const m = new Map();
  for (const e of entries) {
    if (e.type !== type) continue;
    for (const it of e.items || []) {
      const k = it.toLowerCase();
      let x = m.get(k);
      if (!x) m.set(k, x = { label: it, days: new Set(), first: e.day, last: e.day });
      x.days.add(e.day);
      if (e.day < x.first) x.first = e.day;
      if (e.day > x.last) x.last = e.day;
    }
  }
  return [...m.values()].sort((a, b) => b.days.size - a.days.size || a.label.localeCompare(b.label));
}

// Days copied in from the paper notebook (one end-of-day check-in each) are pointed out.
function notebookNote(E) {
  const days = [...new Set(E.filter(e => e.source === 'notebook').map(e => e.day))].sort();
  if (!days.length) return null;
  return h('p', { class: 'note' }, `${days.length} day${days.length === 1 ? '' : 's'} (${fmt(days[0])} – ${fmt(days.at(-1))}) were copied from an earlier paper notebook, with one end-of-day check-in each; areas marked without a number were entered as 5.`);
}

// photoImg(id, full, cls) must return an <img data-photo-id=…> (the app fills in the picture).
// patterns: analyze() run on this period (optional); trials: elimination tests.
export function buildReport({ entries, products, weather, from, to, name, photoImg, patterns = null, trials = [], exclusions = {} }) {
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const E = entries.filter(e => e.day >= from && e.day <= to).sort(byTime);
  const daily = dailyScores(E);
  const checkins = checkinsByDay(E);
  const checkDays = days.filter(d => daily.has(d));
  const worstOf = d => Math.max(0, ...Object.entries(daily.get(d)).filter(([k]) => !k.startsWith('f:')).map(([, v]) => v));
  const worsts = checkDays.map(worstOf);
  const poems = E.filter(e => e.type === 'poem');
  const lastPoem = poems.at(-1);
  const wDays = days.map(d => weather.get(d)).filter(Boolean);
  const hasWeather = wDays.length > 0;

  // Areas: how often each was affected, and how badly.
  const areaRows = REGIONS.map(r => {
    const vals = checkDays.map(d => daily.get(d)[r.id] || 0);
    const hit = vals.filter(v => v > 0);
    return { r, n: hit.length, avg: mean(hit), max: Math.max(0, ...vals) };
  }).filter(x => x.n).sort((a, b) => b.n - a.n || b.avg - a.avg);

  const symptomRows = [
    ...GENERAL.map(g => ({ key: 'g:' + g.id, label: g.label, optional: false })),
    ...FACTORS.map(f => ({ key: 'f:' + f.id, label: f.label, optional: true })),
  ].map(s => {
    const vals = checkDays.map(d => daily.get(d)[s.key] ?? (s.optional ? null : 0)).filter(v => v != null);
    return [s.label, vals.length ? r1(mean(vals)) : '–', vals.length ? String(Math.max(...vals)) : '–', vals.length ? String(vals.filter(v => v >= 7).length) : '–'];
  });

  const rows = heatRows(hasWeather);
  // The grid starts at the first check-in in the period, so it isn't padded with empty weeks.
  const heatDays = checkDays.length ? days.filter(d => d >= checkDays[0]) : days;
  const chunks = [];
  for (let i = 0; i < heatDays.length; i += 31) chunks.push(heatDays.slice(i, i + 31));

  const prods = products.filter(p => p.start <= to && (!p.end || p.end >= from))
    .sort((a, b) => a.category.localeCompare(b.category) || a.start.localeCompare(b.start));

  const listSection = (title, type, limit) => {
    const items = itemDays(E, type).slice(0, limit);
    return items.length ? section(title, table(['Item', 'Days', 'First', 'Last'],
      items.map(x => [x.label, String(x.days.size), fmtShort(x.first), fmtShort(x.last)]), [1])) : null;
  };

  const notes = E.filter(e => (e.type === 'note' ? e.text : e.type !== 'photo' && e.note))
    .map(e => [`${fmtShort(e.day)} ${e.time}`, TYPE_LABEL[e.type] || e.type, e.type === 'note' ? e.text : e.note]);

  const photos = E.filter(e => e.type === 'photo' && e.photoId);
  const photoGroups = [...REGIONS.map(r => ({ label: r.label, items: photos.filter(p => p.area === r.id) })),
    { label: 'Other', items: photos.filter(p => !p.area) }].filter(g => g.items.length);

  const weatherSummary = () => {
    const hum = wDays.map(w => w.humMean).filter(v => v != null);
    const low = wDays.map(w => w.humMin ?? w.humMean).filter(v => v != null);
    const pm = wDays.map(w => w.pm25).filter(v => v != null);
    const parts = [
      hum.length ? `Average humidity ${Math.round(mean(hum))}% (lowest ${Math.round(Math.min(...low))}%).` : '',
      `Temperatures from ${Math.round(Math.min(...wDays.map(w => w.tMin)))}° to ${Math.round(Math.max(...wDays.map(w => w.tMax)))}°.`,
      `Rain (1 mm or more) on ${wDays.filter(w => w.rain >= 1).length} days.`,
      pm.length ? `Average PM2.5 ${r1(mean(pm))} µg/m³.` : '',
    ];
    return parts.filter(Boolean).join(' ');
  };

  return h('div', { class: 'rpt' },
    h('header', { class: 'rpt-head' },
      h('h1', {}, 'Skin & allergy diary'),
      h('p', { class: 'rpt-sub' }, (name ? name + ' · ' : '') + `${fmt(from)} – ${fmt(to)} (${days.length} days)`),
      h('p', { class: 'note' }, `Prepared ${fmt(dayKey())} from a daily diary kept by the patient. Symptom scores are self-rated from 1 (barely there) to 10 (worst); a blank area on a check-in day means no symptoms there.`),
      notebookNote(E)),

    section('Summary', h('div', { class: 'stats' },
      stat(`${checkDays.length} / ${days.length}`, 'days with a symptom check-in'),
      stat(worsts.length ? r1(mean(worsts)) : '–', 'average worst score on check-in days'),
      stat(String(worsts.filter(v => v >= 7).length), 'flare days (worst score 7 or more)'),
      stat(lastPoem ? `${lastPoem.score} / 28` : '–', lastPoem ? `latest POEM (${fmtShort(lastPoem.day)}): ${poemBand(lastPoem.score)}` : 'no weekly POEM score recorded'))),

    section('Most affected areas', areaRows.length
      ? table(['Area', 'Days affected', 'Average when affected', 'Highest'],
        areaRows.map(x => [x.r.label, `${x.n} (${Math.round((x.n / checkDays.length) * 100)}%)`, r1(x.avg), String(x.max)]), [1, 2, 3])
      : h('p', {}, 'No affected areas recorded in this period.')),

    section('Symptoms, sleep and stress', table(['', 'Average', 'Highest', 'Days at 7+'], symptomRows, [1, 2, 3]),
      h('p', { class: 'note' }, 'Averages are over check-in days. Sleep and stress only count days they were recorded.')),

    section('Day by day',
      h('p', { class: 'note' }, 'Each square is one day. Inside a square, time runs from midnight (left) to midnight (right) and the colour blends between that day\'s check-ins, so changes during the day are visible. "Overall" is the highest score in each check-in.' + (heatDays.length < days.length ? ` Starts at the first check-in (${fmt(heatDays[0])}).` : '')),
      chunks.map(c => h('div', { class: 'rpt-heat' }, heatGrid({ days: c, checkins, weather, rows, prefix: 'rh', labelW: 74, labelEvery: 7 }))),
      heatLegend(hasWeather)),

    poems.length ? section('Weekly eczema score (POEM)',
      table(['Week ending', 'Score (0–28)', 'Severity'], poems.map(p => [fmt(p.day), String(p.score), poemBand(p.score)]), [1]),
      h('p', { class: 'note' }, `${POEM_CREDIT} Bands: 0–2 clear or almost clear, 3–7 mild, 8–16 moderate, 17–24 severe, 25–28 very severe.`)) : null,

    patternsSection(patterns, trials, entries, exclusions, from, to),

    prods.length ? section('Products in contact with skin', prods.map(p => h('div', { class: 'rpt-product' },
      h('p', {}, h('strong', {}, p.name), ` · ${p.category} · ${fmt(p.start)} – ${p.end ? fmt(p.end) : 'still using'}`),
      p.ingredients ? h('p', { class: 'note' }, 'Ingredients: ' + p.ingredients) : null,
      p.note ? h('p', { class: 'note' }, p.note) : null,
      p.photoId ? photoImg(p.photoId, true, 'label-photo') : null))) : null,

    listSection('Medications & creams', 'meds', 60),
    listSection('Activities', 'activity', 40),
    listSection('Most frequent foods & drinks', 'food', 30),

    hasWeather ? section('Weather', h('p', {}, weatherSummary())) : null,

    notes.length ? section('Notes', table(['When', 'Type', 'Note'], notes)) : null,

    photoGroups.length ? section('Photos', photoGroups.map(g => [
      h('h3', {}, g.label),
      h('div', { class: 'photos' }, g.items.map(p => h('figure', {},
        photoImg(p.photoId, false, null),
        h('figcaption', {}, `${fmtShort(p.day)} ${p.time}` + (p.note ? ` · ${p.note}` : ''))))),
    ])) : null,

    h('footer', { class: 'rpt-foot' }, "Made with Seb's Symptoms, a personal symptom diary. All information is self-reported."));
}

function toDataURL(bytes, type) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(new Blob([bytes], { type }));
  });
}

const escapeHTML = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Turns the preview into a single self-contained HTML file.
export async function reportFile(rootEl, { css, title, getPhoto }) {
  // Copy into a detached document so swapping in embedded photos doesn't make the page load them.
  const clone = document.implementation.createHTMLDocument('').importNode(rootEl, true);
  for (const img of clone.querySelectorAll('img[data-photo-id]')) {
    const p = await getPhoto(img.dataset.photoId);
    if (!p) { img.remove(); continue; }
    img.src = await toDataURL(img.dataset.full ? p.data : (p.thumb || p.data), p.type);
    img.removeAttribute('data-photo-id');
    img.removeAttribute('data-full');
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<style>
html { background: #fff; }
body { margin: 0 auto; max-width: 820px; }
${css}
</style>
</head>
<body>
${clone.outerHTML}
</body>
</html>
`;
}
