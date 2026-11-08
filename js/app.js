// Seb's Symptoms — main screens. All data stays in this phone's storage (IndexedDB).
// The only way data leaves is an encrypted backup file you choose to share.

import { h, icon, openSheet, confirmSheet, toast, dayKey, timeKey, addDays, prettyDay, prettyDate, shortDate, whenText, uid, fmtBytes, parseDay } from './ui.js';
import * as db from './db.js';
import { REGIONS, GENERAL, labelFor, shortLabel, bodyMap } from './body.js';
import { compressImage } from './images.js';
import * as bk from './backup.js';

const APP_VERSION = '1.0.0';

const state = {
  tab: 'today',
  day: dayKey(),
  lastToday: dayKey(),
  entries: [],
  products: [],
  settings: new Map(),
  trendRange: 30,
  photoFilter: 'all',
  updateWorker: null,
};

const mainEl = document.getElementById('main');
const tabsEl = document.getElementById('tabs');

// ================= data helpers =================

const setting = key => state.settings.get(key);
async function saveSetting(key, value) {
  await db.put('settings', { key, value });
  state.settings.set(key, value);
}

async function saveEntry(entry) {
  entry.updated = Date.now();
  await db.put('entries', entry);
  const i = state.entries.findIndex(e => e.id === entry.id);
  if (i >= 0) state.entries[i] = entry; else state.entries.push(entry);
}

async function removeEntry(entry) {
  await db.del('entries', entry.id);
  if (entry.photoId) await db.del('photos', entry.photoId);
  state.entries = state.entries.filter(e => e.id !== entry.id);
}

async function saveProduct(p) {
  p.updated = Date.now();
  await db.put('products', p);
  const i = state.products.findIndex(x => x.id === p.id);
  if (i >= 0) state.products[i] = p; else state.products.push(p);
}

async function removeProduct(p) {
  await db.del('products', p.id);
  if (p.photoId) await db.del('photos', p.photoId);
  state.products = state.products.filter(x => x.id !== p.id);
}

const byTime = (a, b) => (a.day + a.time).localeCompare(b.day + b.time);
const entriesOn = day => state.entries.filter(e => e.day === day).sort(byTime);
const lastCheckin = () => state.entries.filter(e => e.type === 'symptoms').sort(byTime).at(-1);

const CATEGORIES = ['Laundry detergent', 'Fabric softener', 'Body wash / soap', 'Hand soap', 'Shampoo', 'Conditioner',
  'Moisturiser', 'Sunscreen', 'Deodorant', 'Dish soap', 'Cleaning product', 'Other'];
const byCategory = (a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name);
const productsOn = day => state.products.filter(p => p.start <= day && (!p.end || p.end >= day)).sort(byCategory);

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const backupDue = () => { const last = setting('lastBackup'); return !last || dayKey(new Date(last)) !== dayKey(); };

function guard(fn) {
  let busy = false;
  return async (...args) => {
    if (busy) return;
    busy = true;
    try { await fn(...args); } catch (err) { console.error(err); toast('Something went wrong: ' + err.message, 4000); } finally { busy = false; }
  };
}

// Photos are stored as bytes; thumbnails get a cached URL, full images are made on demand.
const thumbURLs = new Map();
async function photoURL(id, full = false) {
  if (!full && thumbURLs.has(id)) return thumbURLs.get(id);
  const p = await db.get('photos', id);
  if (!p) return null;
  const url = URL.createObjectURL(new Blob([full ? p.data : (p.thumb || p.data)], { type: p.type }));
  if (!full) thumbURLs.set(id, url);
  return url;
}
function thumb(id, cls = 'thumb') {
  const img = h('img', { class: cls, alt: '' });
  photoURL(id).then(u => { if (u) img.src = u; });
  return img;
}

function pickFile(accept = 'image/*') {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept, class: 'visually-hidden', tabindex: '-1' });
    const done = file => { input.remove(); resolve(file); };
    input.addEventListener('change', () => done(input.files[0] || null), { once: true });
    input.addEventListener('cancel', () => done(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

// ================= shell =================

const TABS = [
  ['today', 'Today', 'calendar'],
  ['photos', 'Photos', 'image'],
  ['trends', 'Trends', 'grid'],
  ['products', 'Products', 'bottle'],
  ['settings', 'Settings', 'sliders'],
];

function go(tab) { state.tab = tab; render(); window.scrollTo(0, 0); }

function render() {
  tabsEl.replaceChildren(...TABS.map(([id, label, ic]) =>
    h('button', { class: 'tab' + (state.tab === id ? ' active' : ''), 'aria-current': state.tab === id ? 'page' : null, onclick: () => go(id) },
      icon(ic), h('span', {}, label))));
  const views = { today: viewToday, photos: viewPhotos, trends: viewTrends, products: viewProducts, settings: viewSettings };
  mainEl.replaceChildren(views[state.tab]());
}

function banner(kind, title, text, action) {
  return h('div', { class: 'banner ' + kind },
    h('div', { class: 'banner-text' }, h('strong', {}, title), text ? h('span', {}, text) : null),
    action ? h('button', { class: 'btn small ' + (kind === 'warn' ? '' : 'primary'), onclick: action.fn }, action.label) : null);
}

function banners() {
  const out = [];
  if (state.updateWorker) out.push(banner('info', 'Update ready', 'A new version of the app is downloaded.', { label: 'Update', fn: () => state.updateWorker.postMessage('skipWaiting') }));
  if (!isStandalone()) {
    out.push(banner('warn', 'Add this to your Home Screen',
      'In Safari tap Share, then "Add to Home Screen". Always open the app from that icon: Safari keeps a separate copy of the data.'));
  }
  if (state.entries.length) {
    if (!setting('backupKey')) out.push(banner('info', 'Turn on encrypted backups', 'Takes a minute. Protects your diary if anything happens to this phone.', { label: 'Set up', fn: () => openPassphraseSetup() }));
    else if (backupDue()) out.push(banner('info', "Today's backup isn't done", 'Last backup: ' + whenText(setting('lastBackup')) + '.', { label: 'Back up', fn: openBackup }));
  }
  return out;
}

// ================= Today =================

const QUICK = [
  { type: 'symptoms', label: 'Check-in', icon: 'person' },
  { type: 'food', label: 'Food', icon: 'bowl' },
  { type: 'activity', label: 'Activity', icon: 'pulse' },
  { type: 'meds', label: 'Meds & creams', icon: 'pill' },
  { type: 'photo', label: 'Photo', icon: 'camera' },
  { type: 'note', label: 'Note', icon: 'pencil' },
];

const TYPE_META = {
  symptoms: { title: 'Check-in', icon: 'person' },
  food: { title: 'Food', icon: 'bowl' },
  activity: { title: 'Activity', icon: 'pulse' },
  meds: { title: 'Meds & creams', icon: 'pill' },
  note: { title: 'Note', icon: 'pencil' },
  photo: { title: 'Photo', icon: 'camera' },
};

function viewToday() {
  const day = state.day;
  const isToday = day === dayKey();
  const list = entriesOn(day);
  const checkedIn = list.some(e => e.type === 'symptoms');

  return h('div', { class: 'view' },
    banners(),
    h('div', { class: 'dayhead' },
      h('button', { class: 'icon-btn', 'aria-label': 'Previous day', onclick: () => { state.day = addDays(day, -1); render(); } }, icon('left')),
      h('button', { class: 'daytitle', onclick: () => { state.day = dayKey(); render(); } },
        h('strong', {}, prettyDay(day)), h('span', {}, prettyDate(day))),
      h('button', { class: 'icon-btn', 'aria-label': 'Next day', disabled: isToday, onclick: () => { state.day = addDays(day, 1); render(); } }, icon('right'))),
    h('div', { class: 'quick' }, QUICK.map(q =>
      h('button', { class: 'quick-btn' + (q.type === 'symptoms' ? ' main' : '') + (q.type === 'symptoms' && !checkedIn ? ' due' : ''), onclick: () => startNew(q.type) },
        icon(q.icon), h('span', {}, q.label)))),
    productsCard(day),
    h('h3', { class: 'section' }, isToday ? 'Today so far' : 'Entries'),
    list.length
      ? h('div', { class: 'entries' }, list.map(entryRow))
      : h('p', { class: 'empty' }, 'Nothing logged yet. Tap a button above to add something.'));
}

function productsCard(day) {
  const list = productsOn(day);
  return h('button', { class: 'card products-card', onclick: () => go('products') },
    h('div', { class: 'card-row' }, icon('bottle'), h('strong', {}, 'Products in use'), h('span', { class: 'muted' }, String(list.length))),
    list.length
      ? h('p', { class: 'small muted clamp' }, list.map(p => p.name).join(' · '))
      : h('p', { class: 'small muted' }, 'Add your detergent, soaps and creams once. They\'re logged automatically every day.'));
}

function maxScore(e) {
  return Math.max(0, ...Object.values(e.areas || {}), ...Object.values(e.general || {}));
}

function summarize(e) {
  switch (e.type) {
    case 'symptoms': {
      const areas = Object.entries(e.areas || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      const general = GENERAL.filter(g => e.general?.[g.id] > 0).map(g => `${g.label} ${e.general[g.id]}`);
      if (!areas.length && !general.length) return 'No symptoms';
      const parts = areas.slice(0, 3).map(([k, v]) => `${shortLabel(k)} ${v}`);
      if (areas.length > 3) parts.push(`+${areas.length - 3} more`);
      return [...parts, ...general].join(' · ');
    }
    case 'food': case 'activity': case 'meds': return (e.items || []).join(', ') + (e.note ? ` — ${e.note}` : '');
    case 'note': return e.text;
    case 'photo': return [e.area ? labelFor(e.area) : 'No area', e.note].filter(Boolean).join(' · ');
    default: return '';
  }
}

function entryRow(e) {
  const meta = TYPE_META[e.type];
  const title = e.type === 'food' ? (e.meal || 'Food') : meta.title;
  const worst = e.type === 'symptoms' ? maxScore(e) : 0;
  return h('button', { class: 'entry', onclick: () => openEntry(e) },
    h('span', { class: 'entry-time' }, e.time),
    e.type === 'photo' ? thumb(e.photoId, 'entry-thumb') : h('span', { class: 'entry-icon t-' + e.type }, icon(meta.icon)),
    h('span', { class: 'entry-main' }, h('span', { class: 'entry-title' }, title), h('span', { class: 'entry-sub' }, summarize(e))),
    e.type === 'symptoms' ? h('span', { class: 'badge sev-' + worst + (worst ? '' : ' zero') }, worst ? String(worst) : '0') : null);
}

function newEntry(type) {
  const isToday = state.day === dayKey();
  return { id: uid(), type, day: state.day, time: isToday ? timeKey() : '12:00', created: Date.now() };
}

function startNew(type) {
  if (type === 'photo') return addPhotoFlow();
  openEntry(newEntry(type), true);
}

function openEntry(e, isNew = false) {
  const openers = { symptoms: openCheckin, food: openItems, activity: openItems, meds: openItems, note: openNote, photo: openPhoto };
  openers[e.type](e, isNew);
}

// ---------- shared form bits ----------

function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

function timeInput(value) { return h('input', { type: 'time', value, required: true }); }

function addFooter(sheet, { onSave, onDelete, saveLabel = 'Save' }) {
  if (onDelete) sheet.footer.append(h('button', { class: 'btn danger-ghost', onclick: onDelete }, 'Delete'));
  sheet.footer.append(h('button', { class: 'btn primary grow', onclick: guard(onSave) }, saveLabel));
}

async function confirmAndDelete(sheet, what, fn) {
  if (!await confirmSheet(`Delete this ${what}?`, "This can't be undone.", 'Delete', true)) return;
  await fn();
  sheet.close();
  render();
  toast('Deleted');
}

// ---------- symptom check-in ----------

function pickScore(title, current, onPick) {
  const s = openSheet(title, { backdropClose: true });
  s.add(
    h('p', { class: 'muted small center' }, '1 = barely there · 10 = worst it gets'),
    h('div', { class: 'score-grid' }, Array.from({ length: 10 }, (_, i) => i + 1).map(n =>
      h('button', { class: 'score sev-' + n + (current === n ? ' current' : ''), 'aria-label': `Score ${n}`, onclick: () => { onPick(n); s.close(); } }, String(n)))),
    h('button', { class: 'btn wide', onclick: () => { onPick(0); s.close(); } }, 'None / clear'));
}

function openCheckin(entry, isNew) {
  let areas = { ...(entry.areas || {}) };
  let general = { ...(entry.general || {}) };
  let copiedFrom = null;
  if (isNew) {
    const last = lastCheckin();
    if (last) { areas = { ...(last.areas || {}) }; general = { ...(last.general || {}) }; copiedFrom = last; }
  }
  const sheet = openSheet(isNew ? 'Symptom check-in' : 'Edit check-in', { full: true });
  const setScore = (obj, id, v) => { if (v > 0) obj[id] = v; else delete obj[id]; };

  const scoredList = h('p', { class: 'small muted center scored' });
  const map = bodyMap(areas, id => pickScore(labelFor(id), areas[id], v => { setScore(areas, id, v); drawAreas(); }));
  function drawAreas() {
    map.update(areas);
    const scored = Object.entries(areas).sort((a, b) => b[1] - a[1]);
    scoredList.textContent = scored.length ? scored.map(([k, v]) => `${labelFor(k)} ${v}`).join(' · ') : 'Tap an area of the body to score it from 1 to 10.';
  }

  const generalList = h('div', { class: 'list' });
  function drawGeneral() {
    generalList.replaceChildren(...GENERAL.map(g => {
      const v = general[g.id] || 0;
      return h('button', { class: 'list-row', onclick: () => pickScore(g.label, v, nv => { setScore(general, g.id, nv); drawGeneral(); }) },
        h('span', {}, g.label),
        h('span', { class: 'badge sev-' + v + (v ? '' : ' zero') }, v ? String(v) : '–'));
    }));
  }

  const copiedBanner = copiedFrom ? h('div', { class: 'note-banner' },
    h('span', {}, `Copied from your last check-in (${prettyDay(copiedFrom.day)} ${copiedFrom.time}). Just change what's different.`),
    h('button', { class: 'link', onclick: () => { areas = {}; general = {}; drawAreas(); drawGeneral(); copiedBanner.remove(); } }, 'Start blank')) : null;

  const time = timeInput(entry.time);
  const note = h('textarea', { rows: 2, placeholder: 'Anything else? e.g. flared after the gym', value: entry.note || '' });

  sheet.add(
    copiedBanner,
    h('div', { class: 'body-wrap' },
      h('div', { class: 'side-labels' }, h('span', {}, 'Your right'), h('span', {}, 'Your left')),
      map.el),
    scoredList,
    h('h3', { class: 'section' }, 'Overall'),
    generalList,
    field('Time', time),
    field('Note', note));
  drawAreas();
  drawGeneral();

  addFooter(sheet, {
    onSave: async () => {
      Object.assign(entry, { areas, general, note: note.value.trim(), time: time.value || entry.time });
      await saveEntry(entry);
      sheet.close(); render(); toast('Check-in saved');
    },
    onDelete: isNew ? null : () => confirmAndDelete(sheet, 'check-in', () => removeEntry(entry)),
  });
}

// ---------- food / activity / meds ----------

const ITEM_TYPES = {
  food: { title: 'Food & drink', placeholder: 'e.g. oat milk', seeds: [] },
  activity: { title: 'Activity', placeholder: 'e.g. gym', seeds: ['Exercise / sweating', 'Swimming', 'Gardening', 'Cleaning', 'Hot shower', 'Outdoors', 'Around pets', 'Poor sleep', 'Stressed'] },
  meds: { title: 'Meds & creams', placeholder: 'e.g. hydrocortisone 1%', seeds: ['Moisturiser', 'Steroid cream', 'Antihistamine', 'Nasal spray'] },
};
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink'];

function defaultMeal(time) {
  const [hh, mm] = time.split(':').map(Number);
  const m = hh * 60 + mm;
  if (m < 630) return 'Breakfast';
  if (m < 870) return 'Lunch';
  if (m >= 1020 && m < 1260) return 'Dinner';
  return 'Snack';
}

function frequentItems(type) {
  const map = new Map();
  for (const e of state.entries) {
    if (e.type !== type) continue;
    for (const item of e.items || []) {
      const k = item.toLowerCase();
      const m = map.get(k);
      if (m) { m.count++; if (e.day > m.last) m.last = e.day; } else map.set(k, { label: item, count: 1, last: e.day });
    }
  }
  for (const seed of ITEM_TYPES[type].seeds) if (!map.has(seed.toLowerCase())) map.set(seed.toLowerCase(), { label: seed, count: 0, last: '' });
  return [...map.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last) || a.label.localeCompare(b.label));
}

function openItems(entry, isNew) {
  const type = entry.type;
  const cfg = ITEM_TYPES[type];
  let items = [...(entry.items || [])];
  let meal = entry.meal || defaultMeal(entry.time);
  const freq = frequentItems(type);
  const sheet = openSheet(isNew ? cfg.title : 'Edit ' + cfg.title.toLowerCase(), { full: true });

  const has = label => items.some(i => i.toLowerCase() === label.toLowerCase());
  const input = h('input', { type: 'text', placeholder: cfg.placeholder, autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'done' });
  const chosen = h('div', { class: 'chips' });
  const suggestions = h('div', { class: 'chips' });
  const mealRow = h('div', { class: 'seg' });

  function addItem(raw) {
    for (const part of raw.split(',')) {
      const v = part.trim().replace(/\s+/g, ' ');
      if (v && !has(v)) items.push(v);
    }
    input.value = '';
    draw();
  }
  function draw() {
    chosen.replaceChildren(...(items.length
      ? items.map(it => h('button', { class: 'chip on', 'aria-label': `Remove ${it}`, onclick: () => { items = items.filter(x => x !== it); draw(); } }, it, h('span', { class: 'x' }, '×')))
      : [h('span', { class: 'small muted' }, 'Nothing added yet')]));
    const q = input.value.trim().toLowerCase();
    const list = freq.filter(f => !has(f.label) && (!q || f.label.toLowerCase().includes(q))).slice(0, 30);
    suggestions.replaceChildren(...list.map(f => h('button', { class: 'chip', onclick: () => addItem(f.label) }, f.label)));
    mealRow.replaceChildren(...MEALS.map(m => h('button', { class: 'seg-btn' + (m === meal ? ' on' : ''), onclick: () => { meal = m; draw(); } }, m)));
  }
  input.addEventListener('input', draw);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addItem(input.value); } });

  const time = timeInput(entry.time);
  const note = h('textarea', { rows: 2, placeholder: 'Note (optional)', value: entry.note || '' });

  sheet.add(
    type === 'food' ? mealRow : null,
    h('div', { class: 'add-row' }, input, h('button', { class: 'btn primary', onclick: () => addItem(input.value) }, 'Add')),
    chosen,
    freq.length ? h('h3', { class: 'section' }, items.length || freq.some(f => f.count) ? 'Tap to add' : 'Ideas') : null,
    suggestions,
    field('Time', time),
    field('Note', note));
  draw();

  addFooter(sheet, {
    onSave: async () => {
      if (input.value.trim()) addItem(input.value);
      if (!items.length) { toast('Add at least one item first'); return; }
      Object.assign(entry, { items, note: note.value.trim(), time: time.value || entry.time });
      if (type === 'food') entry.meal = meal;
      await saveEntry(entry);
      sheet.close(); render(); toast('Saved');
    },
    onDelete: isNew ? null : () => confirmAndDelete(sheet, 'entry', () => removeEntry(entry)),
  });
}

// ---------- note ----------

function openNote(entry, isNew) {
  const sheet = openSheet(isNew ? 'Note' : 'Edit note', { full: true });
  const text = h('textarea', { rows: 6, placeholder: 'e.g. very humid day, new pillowcase, stressed at work', value: entry.text || '' });
  const time = timeInput(entry.time);
  sheet.add(field('Note', text), field('Time', time));
  addFooter(sheet, {
    onSave: async () => {
      if (!text.value.trim()) { toast('Write something first'); return; }
      Object.assign(entry, { text: text.value.trim(), time: time.value || entry.time });
      await saveEntry(entry);
      sheet.close(); render(); toast('Saved');
    },
    onDelete: isNew ? null : () => confirmAndDelete(sheet, 'note', () => removeEntry(entry)),
  });
}

// ---------- photos ----------

async function addPhotoFlow() {
  const file = await pickFile();
  if (!file) return;
  try {
    const img = await compressImage(file);
    openPhoto(newEntry('photo'), true, img);
  } catch (err) {
    console.error(err);
    toast("Couldn't read that photo. Try another.", 3500);
  }
}

function openPhoto(entry, isNew, img) {
  let url;
  let area = entry.area || '';
  const sheet = openSheet(isNew ? 'New photo' : 'Photo', { full: true, onClose: () => url && URL.revokeObjectURL(url) });
  const pic = h('img', { class: 'photo-full', alt: 'Symptom photo' });
  if (img) { url = URL.createObjectURL(new Blob([img.data], { type: img.type })); pic.src = url; }
  else photoURL(entry.photoId, true).then(u => { if (u) { url = u; pic.src = u; } });

  const areaChips = h('div', { class: 'chips' });
  const drawAreas = () => areaChips.replaceChildren(...REGIONS.map(r =>
    h('button', { class: 'chip' + (area === r.id ? ' on' : ''), onclick: () => { area = area === r.id ? '' : r.id; drawAreas(); } }, r.label)));
  drawAreas();

  const note = h('textarea', { rows: 2, placeholder: 'Note (optional)', value: entry.note || '' });
  const time = timeInput(entry.time);
  sheet.add(
    pic,
    !isNew ? h('p', { class: 'small muted' }, `${prettyDate(entry.day)} at ${entry.time}`) : null,
    h('h3', { class: 'section' }, 'Which area?'),
    areaChips,
    field('Note', note),
    field('Time', time));

  addFooter(sheet, {
    onSave: async () => {
      if (isNew) {
        const photoId = uid();
        await db.put('photos', { id: photoId, ...img, created: Date.now() });
        entry.photoId = photoId;
      }
      Object.assign(entry, { area: area || null, note: note.value.trim(), time: time.value || entry.time });
      await saveEntry(entry);
      sheet.close(); render(); toast('Photo saved');
    },
    onDelete: isNew ? null : () => confirmAndDelete(sheet, 'photo', () => removeEntry(entry)),
  });
}

function viewPhotos() {
  const photos = state.entries.filter(e => e.type === 'photo').sort(byTime).reverse();
  const areasPresent = REGIONS.filter(r => photos.some(p => p.area === r.id));
  if (state.photoFilter !== 'all' && !areasPresent.some(r => r.id === state.photoFilter)) state.photoFilter = 'all';
  const shown = state.photoFilter === 'all' ? photos : photos.filter(p => p.area === state.photoFilter);
  const filterChip = (id, label) => h('button', { class: 'chip' + (state.photoFilter === id ? ' on' : ''), onclick: () => { state.photoFilter = id; render(); } }, label);

  return h('div', { class: 'view' },
    h('div', { class: 'title-row' }, h('h1', {}, 'Photos'), h('button', { class: 'btn primary small', onclick: addPhotoFlow }, icon('plus'), 'Add')),
    areasPresent.length > 1 ? h('div', { class: 'chips scroll-x' }, filterChip('all', 'All'), areasPresent.map(r => filterChip(r.id, r.short))) : null,
    shown.length
      ? h('div', { class: 'photo-grid' }, shown.map(p =>
        h('button', { class: 'photo-tile', onclick: () => openPhoto(p, false) },
          thumb(p.photoId, 'tile-img'),
          h('span', { class: 'photo-cap' }, shortDate(p.day) + (p.area ? ' · ' + shortLabel(p.area) : '')))))
      : h('p', { class: 'empty' }, 'No photos yet. Tip: use the same spot, light and distance each time so changes are easy to compare.'),
    h('p', { class: 'small muted' }, "Photos taken here stay inside this app. They don't go to your camera roll or iCloud Photos, and location data is removed."));
}

// ================= Products =================

function viewProducts() {
  const today = dayKey();
  const current = productsOn(today);
  const past = state.products.filter(p => p.end && p.end < today).sort((a, b) => b.end.localeCompare(a.end));
  const future = state.products.filter(p => p.start > today);
  const card = p => h('button', { class: 'product', onclick: () => openProduct(p, false) },
    p.photoId ? thumb(p.photoId, 'product-thumb') : h('span', { class: 'product-thumb empty-thumb' }, icon('bottle')),
    h('span', { class: 'entry-main' },
      h('span', { class: 'entry-title' }, p.name),
      h('span', { class: 'entry-sub' }, `${p.category} · ${p.end ? `${shortDate(p.start)} – ${shortDate(p.end)}` : 'since ' + shortDate(p.start)}`)));

  return h('div', { class: 'view' },
    h('div', { class: 'title-row' }, h('h1', {}, 'Products'), h('button', { class: 'btn primary small', onclick: () => openProduct(null, true) }, icon('plus'), 'Add')),
    h('p', { class: 'small muted' }, 'Anything that touches your skin or clothes. Add a product once and it counts for every day you use it. When you switch, mark the old one "Stopped".'),
    h('h3', { class: 'section' }, 'In use now'),
    current.length ? h('div', { class: 'entries' }, current.map(card)) : h('p', { class: 'empty' }, 'Nothing yet. Start with your laundry detergent and body wash.'),
    future.length ? [h('h3', { class: 'section' }, 'Starting later'), h('div', { class: 'entries' }, future.map(card))] : null,
    past.length ? [h('h3', { class: 'section' }, 'Used before'), h('div', { class: 'entries' }, past.map(card))] : null);
}

function openProduct(p, isNew) {
  const product = p ? { ...p } : { id: uid(), category: CATEGORIES[0], name: '', start: dayKey(), end: null, photoId: null, ingredients: '', note: '', created: Date.now() };
  let newPhoto = null;
  let url;
  const sheet = openSheet(isNew ? 'Add product' : product.name, { full: true, onClose: () => url && URL.revokeObjectURL(url) });

  const category = h('select', { value: product.category }, CATEGORIES.map(c => h('option', { value: c }, c)));
  const name = h('input', { type: 'text', placeholder: 'Brand and product, e.g. Omo Sensitive', value: product.name, autocapitalize: 'words' });
  const start = h('input', { type: 'date', value: product.start, max: dayKey() });
  const end = h('input', { type: 'date', value: product.end || '' });
  const ingredients = h('textarea', { rows: 3, placeholder: 'Optional: type the ingredients, or just take a photo', value: product.ingredients || '' });
  const note = h('textarea', { rows: 2, placeholder: 'Note (optional)', value: product.note || '' });

  const pic = h('img', { class: 'photo-full' + (product.photoId ? '' : ' hidden'), alt: 'Ingredients label' });
  if (product.photoId) photoURL(product.photoId, true).then(u => { if (u) { url = u; pic.src = u; } });
  const photoBtn = h('button', { class: 'btn wide', onclick: guard(async () => {
    const file = await pickFile();
    if (!file) return;
    newPhoto = await compressImage(file, 2200, 0.85); // larger so small print stays readable
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(new Blob([newPhoto.data], { type: newPhoto.type }));
    pic.src = url;
    pic.classList.remove('hidden');
    photoBtn.lastChild.textContent = 'Retake label photo';
  }) }, icon('camera'), h('span', {}, product.photoId ? 'Retake label photo' : 'Photo of ingredients label'));

  sheet.add(
    field('Type', category),
    field('Name', name),
    field('Started using', start),
    !isNew ? field('Stopped using', end, 'Leave empty if you still use it.') : null,
    h('h3', { class: 'section' }, 'Ingredients'),
    pic, photoBtn,
    h('p', { class: 'small muted' }, 'A dermatologist can match the ingredients against patch-test results, so the label is worth keeping.'),
    field('Ingredients', ingredients),
    field('Note', note));

  if (!isNew && !product.end) {
    sheet.footer.append(h('button', { class: 'btn', onclick: guard(async () => {
      product.end = dayKey();
      await saveProduct(product);
      sheet.close(); render(); toast(`Marked as stopped today`);
    }) }, 'Stopped'));
  }
  addFooter(sheet, {
    onSave: async () => {
      if (!name.value.trim()) { toast('Give it a name first'); return; }
      if (!start.value) { toast('Pick a start date'); return; }
      if (end.value && end.value < start.value) { toast('Stop date is before the start date'); return; }
      if (newPhoto) {
        const photoId = uid();
        await db.put('photos', { id: photoId, ...newPhoto, created: Date.now() });
        if (product.photoId) await db.del('photos', product.photoId);
        thumbURLs.delete(product.photoId);
        product.photoId = photoId;
      }
      Object.assign(product, { category: category.value, name: name.value.trim(), start: start.value, end: end.value || null, ingredients: ingredients.value.trim(), note: note.value.trim() });
      await saveProduct(product);
      sheet.close(); render(); toast('Product saved');
    },
    onDelete: isNew ? null : () => confirmAndDelete(sheet, 'product', () => removeProduct(product)),
  });
}

// ================= Trends =================

function viewTrends() {
  const range = state.trendRange;
  const today = dayKey();
  const days = Array.from({ length: range }, (_, i) => addDays(today, i - range + 1));

  // Highest score per day for each area / symptom (several check-ins a day → keep the worst).
  const daily = new Map();
  for (const e of state.entries) {
    if (e.type !== 'symptoms') continue;
    let d = daily.get(e.day);
    if (!d) daily.set(e.day, d = {});
    for (const [k, v] of Object.entries(e.areas || {})) d[k] = Math.max(d[k] || 0, v);
    for (const [k, v] of Object.entries(e.general || {})) d['g:' + k] = Math.max(d['g:' + k] || 0, v);
  }
  const rows = [
    ...GENERAL.map(g => ({ key: 'g:' + g.id, label: g.label, full: g.label })),
    ...REGIONS.map(r => ({ key: r.id, label: r.short, full: r.label })),
  ];
  const logged = days.filter(d => daily.has(d)).length;

  const labelW = 64, gap = 2;
  const avail = Math.min(window.innerWidth, 640) - 32 - 26 - labelW; // page + card padding
  const cell = Math.max(7, Math.floor((avail - gap * range) / range));
  const detail = h('p', { class: 'heat-detail' }, 'Tap a square to see the details.');

  const grid = h('div', { class: 'heat' });
  grid.style.gridTemplateColumns = `${labelW}px repeat(${range}, ${cell}px)`;
  rows.forEach((row, ri) => {
    grid.append(h('div', { class: 'heat-label' + (ri === GENERAL.length ? ' gap-top' : '') }, row.label));
    for (const d of days) {
      const dd = daily.get(d);
      const v = dd ? (dd[row.key] || 0) : null;
      grid.append(h('div', {
        class: 'heat-cell' + (ri === GENERAL.length ? ' gap-top' : '') + (v === null ? ' nodata' : v === 0 ? ' zero' : ' sev-' + v),
        'data-day': d, 'data-row': ri,
      }));
    }
  });
  // date labels underneath
  grid.append(h('div', { class: 'heat-label' }));
  const every = range <= 14 ? 2 : 7;
  const firstLabel = Math.ceil(38 / (cell + gap)); // labels overflow leftwards; keep the first one clear of the row names
  days.forEach((d, i) => grid.append(h('div', { class: 'heat-date' }, (range - 1 - i) % every === 0 && i >= firstLabel ? shortDate(d) : '')));

  grid.addEventListener('click', e => {
    const c = e.target.closest('.heat-cell');
    if (!c) return;
    grid.querySelector('.heat-cell.sel')?.classList.remove('sel');
    c.classList.add('sel');
    const row = rows[+c.dataset.row];
    const dd = daily.get(c.dataset.day);
    const when = parseDay(c.dataset.day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    detail.textContent = !dd ? `${when}: no check-in` : `${when}: ${row.full} ${dd[row.key] ? dd[row.key] + ' / 10' : 'clear'}`;
  });

  const scroller = h('div', { class: 'heat-scroll' }, grid);
  requestAnimationFrame(() => { scroller.scrollLeft = scroller.scrollWidth; });

  const rangeBtn = n => h('button', { class: 'seg-btn' + (range === n ? ' on' : ''), onclick: () => { state.trendRange = n; render(); } }, `${n} days`);

  return h('div', { class: 'view' },
    h('h1', {}, 'Trends'),
    h('div', { class: 'seg' }, rangeBtn(14), rangeBtn(30), rangeBtn(90)),
    h('p', { class: 'small muted' }, `Checked in on ${logged} of the last ${range} days. Each square is the worst score that day.`),
    h('div', { class: 'card heat-card' },
      scroller,
      detail,
      h('div', { class: 'legend' },
        h('span', { class: 'legend-item' }, h('i', { class: 'heat-cell nodata' }), 'No check-in'),
        h('span', { class: 'legend-item' }, h('i', { class: 'heat-cell zero' }), 'Clear'),
        h('span', { class: 'legend-item' }, '1', h('span', { class: 'ramp' }, Array.from({ length: 10 }, (_, i) => h('i', { class: 'sev-' + (i + 1) }))), '10'))),
    h('p', { class: 'small muted' }, 'Pattern-finding (which foods or products line up with flare-ups) comes in a later version, once there\'s enough data.'));
}

// ================= Settings, backup, restore =================

function viewSettings() {
  const key = setting('backupKey');
  const storageLine = h('p', { class: 'small muted' }, 'Checking storage…');
  (async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      storageLine.textContent = `Using ${fmtBytes(est?.usage || 0)} on this phone. Protected from automatic clean-up: ${persisted ? 'yes' : 'not confirmed (keep backing up)'}.`;
    } catch { storageLine.textContent = ''; }
  })();
  const photoCount = state.entries.filter(e => e.type === 'photo').length;

  return h('div', { class: 'view' },
    h('h1', {}, 'Settings'),

    h('section', { class: 'card' },
      h('div', { class: 'card-row' }, icon('cloud'), h('h2', {}, 'Backup to Google Drive')),
      key
        ? h('p', {}, 'Encrypted backups are on. Last backup: ', h('strong', {}, whenText(setting('lastBackup'))), '.')
        : h('p', {}, 'Set a passphrase to turn on encrypted backups. You\'ll back up with two taps a day.'),
      h('div', { class: 'stack' },
        key ? h('button', { class: 'btn primary wide', onclick: openBackup }, 'Back up now') : null,
        h('button', { class: 'btn wide' + (key ? '' : ' primary'), onclick: () => openPassphraseSetup() }, key ? 'Change passphrase' : 'Set backup passphrase'),
        h('button', { class: 'btn wide', onclick: openRestore }, 'Restore from a backup'))),

    h('section', { class: 'card' },
      h('h2', {}, 'Daily reminders'),
      h('p', { class: 'small' }, "iPhone web apps can't send their own reminders without an online server. To keep everything on your phone, use the Reminders app:"),
      h('ol', { class: 'steps small' },
        h('li', {}, 'Open Reminders and add "Fill in symptom diary".'),
        h('li', {}, 'Tap the info (i) button, turn on Date and Time, and pick a time (e.g. 9:00 pm).'),
        h('li', {}, 'Set Repeat to Daily. Add a second reminder for the morning if you like.'))),

    h('section', { class: 'card' },
      h('div', { class: 'card-row' }, icon('lock'), h('h2', {}, 'Privacy')),
      h('ul', { class: 'steps small' },
        h('li', {}, 'Your diary is stored only on this iPhone. The app has no account and no tracking, and it is locked so it cannot send data to any server.'),
        h('li', {}, 'Backups are encrypted (AES-256) with your passphrase before they leave the phone, so Google can\'t read them.'),
        h('li', {}, 'Use a passcode or Face ID on your iPhone. That is what protects the data stored on the phone itself.'))),

    h('section', { class: 'card' },
      h('h2', {}, 'Storage'),
      h('p', { class: 'small' }, `${state.entries.length} entries, ${photoCount} photos, ${state.products.length} products.`),
      storageLine,
      h('p', { class: 'small warn-text' }, 'Deleting the app from your Home Screen deletes its data. Back up first.')),

    h('section', { class: 'card' },
      h('h2', {}, 'Danger zone'),
      h('button', { class: 'btn danger wide', onclick: openDeleteAll }, 'Delete all data on this phone')),

    h('p', { class: 'small muted center' }, `Seb's Symptoms ${APP_VERSION}`));
}

function openPassphraseSetup(afterSave) {
  const existing = setting('backupKey');
  const sheet = openSheet(existing ? 'Change passphrase' : 'Backup passphrase', { full: true });
  const p1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'At least 10 characters' });
  const p2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Type it again' });
  const status = h('p', { class: 'small muted' });
  sheet.add(
    h('p', {}, 'Your backups are locked with this passphrase. Without it, nobody can open them: not Google, not anyone who finds the file.'),
    h('div', { class: 'note-banner warn' }, h('span', {}, h('strong', {}, 'There is no "forgot passphrase". '), 'If you lose it, old backups can\'t be opened. Save it in the iPhone Passwords app or write it down somewhere safe.')),
    existing ? h('p', { class: 'small muted' }, 'Changing it only affects new backups. Old backup files still need the old passphrase.') : null,
    h('p', { class: 'small muted' }, 'Tip: four random words is strong and easy to remember, e.g. "otter lamp river cactus".'),
    field('Passphrase', p1),
    field('Confirm', p2),
    status);
  addFooter(sheet, {
    saveLabel: 'Save passphrase',
    onSave: async () => {
      if (p1.value.length < 10) { toast('Use at least 10 characters'); return; }
      if (p1.value !== p2.value) { toast("The two passphrases don't match"); return; }
      status.textContent = 'Securing… (takes a second)';
      const salt = bk.newSalt();
      const iterations = bk.DEFAULT_ITERATIONS;
      const keyRaw = await bk.deriveKeyRaw(p1.value, salt, iterations);
      await saveSetting('backupKey', { keyRaw, salt, iterations, setAt: Date.now() });
      sheet.close(); render(); toast('Passphrase saved');
      if (afterSave) afterSave(); else if (!existing && state.entries.length) openBackup();
    },
  });
}

async function openBackup() {
  const keyRec = setting('backupKey');
  if (!keyRec) { openPassphraseSetup(); return; }
  const sheet = openSheet('Back up', { backdropClose: false });
  const status = h('p', { class: 'center' }, 'Encrypting your diary…');
  const btn = h('button', { class: 'btn primary wide', disabled: true }, 'Save to Google Drive');
  sheet.add(
    status, btn,
    h('ol', { class: 'steps small' },
      h('li', {}, 'Tap the button above.'),
      h('li', {}, 'In the share menu choose Drive (or Save to Files, then Google Drive).'),
      h('li', {}, 'Pick your backup folder and tap Upload.')),
    h('p', { class: 'small muted' }, 'The file is locked with your passphrase before it leaves this phone.'));

  let file;
  try {
    const photos = await db.getAll('photos');
    const bytes = await bk.createBackup({ entries: state.entries, products: state.products, photos, keyRaw: keyRec.keyRaw, salt: keyRec.salt, iterations: keyRec.iterations, appVersion: APP_VERSION });
    file = new File([bytes], `SebsSymptoms-${dayKey()}-${timeKey().replace(':', '')}.ssbk`, { type: 'application/octet-stream' });
    status.textContent = `Ready: ${fmtBytes(file.size)} (${state.entries.length} entries, ${photos.length} photos)`;
  } catch (err) {
    console.error(err);
    status.textContent = 'Backup failed: ' + err.message;
    return;
  }

  const markDone = async () => { await saveSetting('lastBackup', Date.now()); sheet.close(); render(); toast('Backup saved'); };
  btn.disabled = false;
  if (navigator.canShare?.({ files: [file] })) {
    btn.addEventListener('click', guard(async () => {
      try { await navigator.share({ files: [file] }); await markDone(); }
      catch (err) { if (err.name !== 'AbortError') status.textContent = 'Sharing failed: ' + err.message; }
    }));
  } else {
    btn.textContent = 'Download backup file';
    btn.addEventListener('click', guard(async () => {
      const href = URL.createObjectURL(file);
      const a = h('a', { href, download: file.name, class: 'visually-hidden' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
      await markDone();
    }));
  }
}

function openRestore() {
  const sheet = openSheet('Restore from backup', { full: true });
  let file = null;
  const fileLabel = h('span', {}, 'Choose backup file');
  const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Backup passphrase' });
  const status = h('p', { class: 'small muted' });
  sheet.add(
    h('div', { class: 'note-banner warn' }, h('span', {}, 'Restoring ', h('strong', {}, 'replaces everything'), ' currently on this phone with the contents of the backup.')),
    h('button', { class: 'btn wide', onclick: async () => {
      const f = await pickFile('');
      if (f) { file = f; fileLabel.textContent = f.name; }
    } }, fileLabel),
    field('Passphrase', pass),
    status);
  addFooter(sheet, {
    saveLabel: 'Restore',
    onSave: async () => {
      if (!file) { toast('Choose a backup file first'); return; }
      if (!pass.value) { toast('Enter the passphrase'); return; }
      if (state.entries.length && !await confirmSheet('Replace all data?', `This phone has ${state.entries.length} entries. They will be replaced by the backup.`, 'Replace', true)) return;
      status.textContent = 'Unlocking…';
      let result;
      try { result = await bk.openBackup(await file.arrayBuffer(), pass.value); }
      catch (err) { status.textContent = err.message; return; }
      const { data } = result;
      await db.replaceAll({ entries: data.entries, products: data.products, photos: data.photos });
      await saveSetting('backupKey', { keyRaw: result.keyRaw, salt: result.salt, iterations: result.iterations, setAt: Date.now() });
      state.entries = data.entries;
      state.products = data.products;
      thumbURLs.clear();
      sheet.close(); render();
      toast(`Restored ${data.entries.length} entries and ${data.photos.length} photos`, 3500);
    },
  });
}

function openDeleteAll() {
  const sheet = openSheet('Delete everything?', { full: true });
  const confirmInput = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'DELETE' });
  sheet.add(
    h('p', {}, 'This permanently removes every entry, photo, product and your backup passphrase from this phone. Backup files you already saved are not affected.'),
    field('Type DELETE to confirm', confirmInput));
  sheet.footer.append(h('button', { class: 'btn danger grow', onclick: guard(async () => {
    if (confirmInput.value.trim().toUpperCase() !== 'DELETE') { toast('Type DELETE to confirm'); return; }
    await db.clearEverything();
    state.entries = []; state.products = []; state.settings = new Map();
    thumbURLs.clear();
    sheet.close(); go('today'); toast('All data deleted');
  }) }, 'Delete everything'));
}

// ================= startup =================

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    const offer = worker => { state.updateWorker = worker; if (state.tab === 'today') render(); };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  } catch (err) {
    console.warn('Offline support unavailable:', err);
  }
}

// If the app is left open overnight, roll "Today" over to the new day.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = dayKey();
  if (now !== state.lastToday) {
    if (state.day === state.lastToday) state.day = now;
    state.lastToday = now;
    render();
  }
});

window.addEventListener('unhandledrejection', e => { console.error(e.reason); toast('Error: ' + (e.reason?.message || e.reason), 4000); });

async function init() {
  try {
    const [entries, products, settings] = await Promise.all([db.getAll('entries'), db.getAll('products'), db.getAll('settings')]);
    state.entries = entries;
    state.products = products;
    state.settings = new Map(settings.map(s => [s.key, s.value]));
  } catch (err) {
    mainEl.replaceChildren(h('div', { class: 'view' }, banner('warn', "Couldn't open storage", err.message)));
    return;
  }
  render();
  navigator.storage?.persist?.().catch(() => {});
  registerServiceWorker();
}

init();
