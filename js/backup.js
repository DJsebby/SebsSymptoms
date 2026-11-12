// Backups are ordinary, readable .zip files:
//   README.txt     what each file is
//   entries.csv    one row per diary entry (opens in Excel, Numbers, Google Sheets)
//   products.csv   detergents, soaps and creams with the dates used
//   weather.csv    daily weather, if weather is turned on
//   tests.csv      elimination tests (Triggers tab), if any
//   data.json      everything in one file; the app restores from this
//   photos/        symptom photos, named date_time_area
//   labels/        ingredient-label photos for products

import { makeZip, readZip } from './zip.js';
import { REGIONS, GENERAL, FACTORS, labelFor } from './body.js';
import { POLLEN } from './weather.js';
import { makeThumb } from './images.js';

export const FORMAT = 2;

const TYPE_LABEL = { symptoms: 'Check-in', food: 'Food', activity: 'Activity', meds: 'Meds & creams', note: 'Note', photo: 'Photo', poem: 'Weekly eczema score (POEM)' };

const README = `Seb's Symptoms backup
=====================

entries.csv   One row per diary entry. Opens in Excel, Numbers or Google Sheets.
              Check-in rows have a 0-10 score for every symptom and body area
              (0 = none). "Right" and "Left" mean your own right and left.
              Bad sleep and Stress are blank when not recorded.
              Weekly eczema score rows have a POEM score (0-28).
products.csv  Detergents, soaps and creams, with the dates you used them.
weather.csv   Daily weather for your area (if weather is turned on).
tests.csv     Elimination tests from the Triggers tab (if any).
photos/       Symptom photos, named date_time_area.
labels/       Photos of product ingredient labels.
data.json     Everything above in one file. The app restores from this.

To restore: open the app, go to Settings > Restore from a backup,
and choose this zip file.
`;

const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';

function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheets treating text as a formula
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// The leading BOM makes Excel read the file as UTF-8.
const toCsv = rows => '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

function entriesCsv(entries, fileFor) {
  const head = ['Date', 'Time', 'Type', 'Meal', 'Items', 'Note',
    ...GENERAL.map(g => g.label), ...REGIONS.map(r => r.label), ...FACTORS.map(f => f.label), 'Worst score', 'POEM score', 'Photo area', 'Photo file'];
  const rows = entries.map(e => {
    const check = e.type === 'symptoms';
    return [
      e.day, e.time, TYPE_LABEL[e.type] || e.type, e.meal || '', (e.items || []).join('; '),
      e.type === 'note' ? e.text : (e.note || ''),
      ...GENERAL.map(g => (check ? e.general?.[g.id] || 0 : '')),
      ...REGIONS.map(r => (check ? e.areas?.[r.id] || 0 : '')),
      ...FACTORS.map(f => (check ? e.factors?.[f.id] ?? '' : '')),
      check ? Math.max(0, ...Object.values(e.areas || {}), ...Object.values(e.general || {})) : '',
      e.type === 'poem' ? e.score : '',
      e.type === 'photo' && e.area ? labelFor(e.area) : '',
      fileFor.get(e.photoId) || '',
    ];
  });
  return toCsv([head, ...rows]);
}

function productsCsv(products, fileFor) {
  const head = ['Name', 'Category', 'Started', 'Stopped', 'Ingredients', 'Note', 'Label photo'];
  const rows = [...products].sort((a, b) => a.start.localeCompare(b.start))
    .map(p => [p.name, p.category, p.start, p.end || '', p.ingredients || '', p.note || '', fileFor.get(p.photoId) || '']);
  return toCsv([head, ...rows]);
}

function weatherCsv(weather) {
  const pollen = POLLEN.filter(p => weather.some(w => w.pollen?.[p] != null));
  const head = ['Date', 'Max temp °C', 'Min temp °C', 'Humidity avg %', 'Humidity low %', 'Rain mm', 'UV max', 'PM2.5 µg/m³', ...pollen.map(p => `${p} pollen`)];
  const rows = [...weather].sort((a, b) => a.day.localeCompare(b.day))
    .map(w => [w.day, w.tMax, w.tMin, w.humMean, w.humMin, w.rain, w.uv, w.pm25 ?? '', ...pollen.map(p => w.pollen?.[p] ?? '')]);
  return toCsv([head, ...rows]);
}

function testsCsv(trials) {
  const head = ['Without', 'Started', 'Ended', 'Planned days'];
  const rows = [...trials].sort((a, b) => a.start.localeCompare(b.start)).map(t => [t.label, t.start, t.end || '', t.days]);
  return toCsv([head, ...rows]);
}

// settings: { trials, groupExclusions } from the Triggers tab.
export function buildBackup({ entries, products, photos, weather = [], settings = {}, appVersion }) {
  const known = new Set(photos.map(p => p.id));
  const fileFor = new Map();
  const sorted = [...entries].sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time));
  for (const e of sorted) {
    if (e.photoId && known.has(e.photoId)) fileFor.set(e.photoId, `photos/${e.day}_${e.time.replace(':', '')}_${e.area || 'photo'}_${e.photoId.slice(0, 8)}.jpg`);
  }
  for (const p of products) {
    if (p.photoId && known.has(p.photoId)) fileFor.set(p.photoId, `labels/${slug(p.name)}_${p.photoId.slice(0, 8)}.jpg`);
  }
  for (const p of photos) if (!fileFor.has(p.id)) fileFor.set(p.id, `photos/unlinked_${p.id.slice(0, 8)}.jpg`);

  const withFile = x => (fileFor.has(x.photoId) ? { ...x, photoFile: fileFor.get(x.photoId) } : { ...x });
  const data = {
    app: 'SebsSymptoms', format: FORMAT, appVersion, exportedAt: new Date().toISOString(),
    entries: sorted.map(withFile),
    products: products.map(withFile),
    photos: photos.map(p => ({ id: p.id, file: fileFor.get(p.id), type: p.type, w: p.w, h: p.h, created: p.created })),
    weather: [...weather].sort((a, b) => a.day.localeCompare(b.day)),
    settings: { trials: settings.trials || [], groupExclusions: settings.groupExclusions || {} },
  };
  return makeZip([
    { name: 'README.txt', data: README },
    { name: 'entries.csv', data: entriesCsv(sorted, fileFor) },
    { name: 'products.csv', data: productsCsv(products, fileFor) },
    ...(weather.length ? [{ name: 'weather.csv', data: weatherCsv(weather) }] : []),
    ...(settings.trials?.length ? [{ name: 'tests.csv', data: testsCsv(settings.trials) }] : []),
    { name: 'data.json', data: JSON.stringify(data, null, 1) },
    ...photos.map(p => ({ name: fileFor.get(p.id), data: p.data })),
  ]);
}

// Reads a backup zip into { entries, products, photos, weather, settings } ready for the database.
export async function parseBackupZip(file, onProgress = () => {}) {
  const zip = await readZip(file);
  // Allow for the files sitting inside a folder (happens if it was re-zipped on a computer).
  const jsonName = zip.names.find(n => n === 'data.json' || n.endsWith('/data.json'));
  if (!jsonName) throw new Error("This zip isn't a Seb's Symptoms backup (no data.json inside).");
  const prefix = jsonName.slice(0, -'data.json'.length);
  let data;
  try { data = JSON.parse(await zip.text(jsonName)); } catch { throw new Error('data.json in this backup is damaged.'); }
  if (data.app !== 'SebsSymptoms' || !Array.isArray(data.entries)) throw new Error("This zip isn't a Seb's Symptoms backup.");

  const photos = [];
  const missing = [];
  for (const [i, m] of (data.photos || []).entries()) {
    onProgress(`Restoring photo ${i + 1} of ${data.photos.length}…`);
    const bytes = await zip.bytes(prefix + m.file);
    if (!bytes) { missing.push(m.file); continue; }
    const thumb = await makeThumb(bytes, m.type).catch(() => null);
    photos.push({ id: m.id, type: m.type, w: m.w, h: m.h, created: m.created, data: bytes.buffer, thumb });
  }
  const strip = ({ photoFile, ...rest }) => rest;
  const settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  return { entries: data.entries.map(strip), products: (data.products || []).map(strip), photos, weather: data.weather || [], settings, missing };
}
