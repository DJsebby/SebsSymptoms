// Importing a past paper diary from a spreadsheet: one row per day, saved as CSV (or the
// same text pasted in). Columns are matched by name, so they can be in any order and any
// not needed can be left out. No DOM in here, so it can be tested on its own.
//
// Each day becomes ordinary diary entries, marked source: 'notebook':
//   check-in (21:00, end of day), one food entry per meal (Breakfast 08:00, Lunch 12:30,
//   Snack 15:30, Dinner 19:00), meds (08:00), activities (17:00) and the day's note.
// Their ids are worked out from the date, so importing a corrected file again replaces
// those days instead of doubling them.

import { dayKey } from './ui.js';

export const TEMPLATE_HEADERS = ['Date', 'Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Drinks',
  'Face', 'Neck', 'Right arm', 'Left arm', 'Right inner elbow', 'Left inner elbow', 'Right hand & wrist', 'Left hand & wrist',
  'Chest & stomach', 'Legs', 'Other areas', 'Itch', 'Dry skin', 'Swelling', 'Sinus', 'Bad sleep', 'Stress',
  'Antihistamine', 'Other meds & creams', 'Activities', 'Note'];

const EXAMPLES = [
  ['e.g. 14/08/2026', 'Oats, banana, coffee', 'Chicken wrap', 'Pasta bolognese', 'Chocolate', 'Water, beer', '3', '', '', '',
    '4', '2', '5', '5', '', '', 'back 2', '4', '3', '', '2', '', '', 'yes', 'Moisturiser', 'BJJ', 'Hands itchy after training'],
  ['e.g. 15/08/2026', 'Toast, eggs', 'Sushi', 'Steak, salad', '', 'Water', '', '', '', '',
    'x', '', 'mild', 'mild', '', '', '', '0', '', '', '', '', '', 'no', '', '', 'Clear day: a 0 records that you checked'],
];

const csvCell = v => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function templateCsv() {
  return '\uFEFF' + [TEMPLATE_HEADERS, ...EXAMPLES].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ---------- reading the text ----------

export function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, '');
  // Comma, semicolon or tab: whichever the first line uses most (outside quotes).
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of text.split(/\r?\n/, 1)[0]) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  const delim = Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a));
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (c === '"' && !field.trim()) { quoted = true; field = ''; }
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const squash = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

// [what the column holds, names it may have]
const COLUMNS = [
  ['date', ['date', 'day', 'dates']],
  ['meal:Breakfast', ['breakfast', 'brekkie', 'brekky']],
  ['meal:Lunch', ['lunch']],
  ['meal:Dinner', ['dinner', 'supper']],
  ['meal:Snack', ['snack', 'snacks', 'dessert', 'desserts']],
  ['meal:Drink', ['drink', 'drinks']],
  ['meal:', ['food', 'foods', 'foodanddrink', 'foodsanddrinks', 'meals', 'ate', 'eaten', 'whatiate']],
  ['area:face', ['face']],
  ['area:neck', ['neck']],
  ['area:arm_r', ['rightarm', 'rarm', 'armright']],
  ['area:arm_l', ['leftarm', 'larm', 'armleft']],
  ['area:arm_r,arm_l', ['arm', 'arms']],
  ['area:elbow_r', ['rightinnerelbow', 'rightelbow', 'relbow', 'innerelbowright']],
  ['area:elbow_l', ['leftinnerelbow', 'leftelbow', 'lelbow', 'innerelbowleft']],
  ['area:elbow_r,elbow_l', ['elbow', 'elbows', 'innerelbow', 'innerelbows']],
  ['area:hand_r', ['righthandwrist', 'righthandandwrist', 'righthand', 'rhand', 'rightwrist']],
  ['area:hand_l', ['lefthandwrist', 'lefthandandwrist', 'lefthand', 'lhand', 'leftwrist']],
  ['area:hand_r,hand_l', ['hand', 'hands', 'handsandwrists', 'handswrists', 'wrists', 'handwrist']],
  ['area:torso', ['chestandstomach', 'cheststomach', 'chest', 'stomach', 'torso', 'tummy', 'belly']],
  ['area:legs', ['legs', 'leg']],
  ['other', ['otherareas', 'otherarea', 'other']],
  ['general:itch', ['itch', 'itchy', 'itching', 'itchiness']],
  ['general:dry', ['dryskin', 'dry', 'dryness']],
  ['general:swelling', ['swelling', 'swollen']],
  ['general:sinus', ['sinus', 'sinuses', 'congestion', 'blockednose']],
  ['factor:sleep', ['badsleep', 'sleep', 'poorsleep']],
  ['factor:stress', ['stress', 'stressed']],
  ['antihistamine', ['antihistamine', 'antihistamines', 'antihist', 'tookantihistamine', 'antihistaminetaken', 'antihistamineyesno']],
  ['meds', ['othermedscreams', 'othermedsandcreams', 'meds', 'medscreams', 'medsandcreams', 'medication', 'medications', 'medicine', 'medicines', 'creams']],
  ['activity', ['activities', 'activity', 'exercise', 'sport', 'sports']],
  ['note', ['note', 'notes', 'comment', 'comments', 'daynote', 'notefortheday']],
  ['time', ['checkintime', 'time']],
  ['mealtime:Breakfast', ['breakfasttime', 'brekkietime']],
  ['mealtime:Lunch', ['lunchtime']],
  ['mealtime:Dinner', ['dinnertime', 'suppertime']],
  ['mealtime:Snack', ['snacktime', 'snackstime', 'desserttime']],
  ['mealtime:Drink', ['drinktime', 'drinkstime']],
  ['mealtime:', ['foodtime', 'mealtime']],
];
const COLUMN_BY_NAME = new Map(COLUMNS.flatMap(([kind, names]) => names.map(n => [n, kind])));
// Symptom columns can belong to a start-of-day or end-of-day check-in: "Face (start)",
// "Start face", "Itch - end". Returns e.g. "area:face@start".
const SLOT_WORDS = { start: ['start', 'morning', 'am', 'wake', 'woke'], end: ['end', 'evening', 'night', 'pm', 'bed', 'bedtime'] };
const SLOTTED = new Set(['area', 'general', 'factor', 'other', 'time']);
export function columnFor(header) {
  const plain = COLUMN_BY_NAME.get(squash(header));
  if (plain) return plain;
  const words = String(header).toLowerCase().split(/[^\p{L}\p{N}]+/u).map(squash).filter(Boolean);
  for (const [slot, names] of Object.entries(SLOT_WORDS)) {
    const rest = words.filter(w => !names.includes(w));
    if (rest.length === words.length || !rest.length) continue;
    const kind = COLUMN_BY_NAME.get(rest.join(''));
    if (kind && SLOTTED.has(kind.split(':')[0])) return `${kind}@${slot}`;
  }
  return null;
}

// "7:30", "7.30pm", "2am", "12 pm", "19:30" → "19:30". Without am/pm it's read as 24-hour.
export function parseTime(raw) {
  const m = String(raw).trim().toLowerCase().replace(/\s+/g, '').match(/^(\d{1,2})(?:[:.](\d{2}))?(am|pm)?$/);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${pad(h)}:${pad(min)}`;
}

// ---------- reading single cells ----------

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');
const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/;

function validDay(y, m, d) {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dayKey(dt) : null;
}

// Australian order (day first) unless the file can only be month first.
export function parseDate(raw, { today = dayKey(), monthFirst = false } = {}) {
  const s = String(raw).trim().toLowerCase()
    .replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/, '')
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  let y, m, d, m2;
  if ((m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+m2[1], +m2[2], +m2[3]];
  else if ((m2 = s.match(NUMERIC_DATE))) {
    [d, m] = monthFirst ? [+m2[2], +m2[1]] : [+m2[1], +m2[2]];
    if (m2[3]) y = m2[3].length === 2 ? 2000 + +m2[3] : +m2[3];
  } else if ((m2 = s.match(/^(\d{1,2}) ([a-z]+)\.?(?: (\d{2,4}))?$/)) && MONTHS[m2[2].slice(0, 3)]) {
    [d, m] = [+m2[1], MONTHS[m2[2].slice(0, 3)]];
    if (m2[3]) y = m2[3].length === 2 ? 2000 + +m2[3] : +m2[3];
  } else if ((m2 = s.match(/^([a-z]+)\.? (\d{1,2})(?: (\d{2,4}))?$/)) && MONTHS[m2[1].slice(0, 3)]) {
    [d, m] = [+m2[2], MONTHS[m2[1].slice(0, 3)]];
    if (m2[3]) y = m2[3].length === 2 ? 2000 + +m2[3] : +m2[3];
  } else return null;
  if (!y) { // no year written: the most recent such date that isn't in the future
    y = +today.slice(0, 4);
    const guess = validDay(y, m, d);
    if (guess && guess > today) y--;
  }
  return validDay(y, m, d);
}

const WORDS = [
  [0, ['none', 'no', 'clear', 'nil', 'nothing', 'fine', 'ok', 'good']],
  [3, ['mild', 'light', 'slight', 'low', 'little', 'alittle', 'minor', 'abit']],
  [6, ['moderate', 'medium', 'mod', 'some', 'average', 'med']],
  [9, ['severe', 'bad', 'high', 'verybad', 'worst', 'terrible', 'awful', 'heavy']],
];
const WORD_SCORE = new Map(WORDS.flatMap(([v, ws]) => ws.map(w => [w, v])));
const MARKS = new Set(['x', 'yes', 'y', 'present', 'tick', 'ticked', 'marked']);
const MARK_SCORE = 5;

// 0–10 from a number, "7/10", a word, or a mark with no number. null = blank.
export function readScore(raw) {
  const s = String(raw).trim();
  if (!s || /^[-–—]$/.test(s)) return null;
  const num = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:(?:\/|out of)\s*10)?$/i);
  if (num) {
    const v = parseFloat(num[1].replace(',', '.'));
    return { value: Math.min(10, Math.max(0, Math.round(v))), clamped: v > 10 };
  }
  if (/^[✓✔✗✘x*]+$/i.test(s) || MARKS.has(squash(s))) return { value: MARK_SCORE, mark: true };
  if (WORD_SCORE.has(squash(s))) return { value: WORD_SCORE.get(squash(s)), word: true };
  return { error: true };
}

// Antihistamine: yes / no, or the name of the one taken (which counts as yes).
export function readYesNo(raw) {
  const s = String(raw).trim();
  const k = squash(s);
  if (!k && !/[✓✔]/.test(s)) return { taken: false };
  if (['no', 'n', '0', 'false', 'none', 'nil', 'not', 'didnt', 'didnot'].includes(k) || /^[-–—✗✘]$/.test(s)) return { taken: false };
  if (['yes', 'y', '1', 'true', 'x', 'taken', 'took', 'tick', 'ticked'].includes(k) || /^[✓✔]+$/.test(s)) return { taken: true };
  return { taken: true, name: s };
}

const splitList = raw => String(raw).split(/[,;\n]|\s\+\s/).map(x => x.trim().replace(/\s+/g, ' ')).filter(Boolean)
  .map(x => x.charAt(0).toUpperCase() + x.slice(1));

const MEAL_TIME = { Breakfast: '08:00', Lunch: '12:30', Snack: '15:30', Dinner: '19:00', Drink: '12:00', '': '12:00' };
const SLOT_TIME = { day: '21:00', start: '09:00', end: '23:30' };

// ---------- the whole file ----------

// existing: entries already in the app (to spot overlaps and earlier imports).
export function readNotebook(text, { today = dayKey(), existing = [], now = Date.now() } = {}) {
  const rows = parseCsv(text);
  if (!rows.length) return { error: 'There is nothing in it.' };
  const headerAt = rows.findIndex(r => r.some(c => columnFor(c) === 'date'));
  if (headerAt < 0) return { error: 'Couldn\'t find a "Date" column. The first row should hold the column names, as in the template.' };
  const header = rows[headerAt];
  const kinds = header.map(columnFor);
  const ignored = header.filter((h, i) => h.trim() && !kinds[i]).map(h => h.trim());
  const dateCol = kinds.indexOf('date');
  const warnings = [];
  const warn = text => warnings.push(text);

  // Day/month or month/day? Decided once for the whole file.
  let dayFirstOnly = false, monthFirstOnly = false;
  for (const r of rows.slice(headerAt + 1)) {
    const m = String(r[dateCol] || '').trim().match(NUMERIC_DATE);
    if (!m) continue;
    if (+m[1] > 12) dayFirstOnly = true;
    if (+m[2] > 12) monthFirstOnly = true;
  }
  const monthFirst = monthFirstOnly && !dayFirstOnly;

  // A day can take several rows (e.g. one per meal). Check-ins: "day" (no start/end in the
  // column name), or separate "start" and "end" of day ones.
  const days = new Map();
  let examples = 0, marks = 0, words = 0, slotted = false;
  rows.slice(headerAt + 1).forEach((r, i) => {
    const rowNo = headerAt + i + 2;
    const rawDate = String(r[dateCol] || '').trim();
    if (/^e\.?g\b/i.test(rawDate)) { examples++; return; }
    if (!rawDate) { if (r.some((c, j) => j !== dateCol && c.trim())) warn(`Row ${rowNo}: no date, so it was skipped.`); return; }
    const day = parseDate(rawDate, { today, monthFirst });
    if (!day) { warn(`Row ${rowNo}: couldn't read the date "${rawDate}", so it was skipped.`); return; }
    if (day > today) { warn(`Row ${rowNo}: ${rawDate} is in the future, so it was skipped.`); return; }
    let d = days.get(day);
    if (!d) days.set(day, d = { checks: {}, times: {}, meals: new Map(), other: [], antihistamine: null, meds: [], activities: [], notes: [] });
    const cellAt = j => String(r[j] ?? '').trim();

    const mealTimes = {}; // times written in this row, e.g. "Lunch time"
    kinds.forEach((kindAt, j) => {
      if (!kindAt?.startsWith('mealtime:') || !cellAt(j)) return;
      const t = parseTime(cellAt(j));
      if (t) mealTimes[kindAt.slice(9)] = t;
      else warn(`Row ${rowNo}, ${header[j].trim()}: couldn't read the time "${cellAt(j)}", so the usual time was used.`);
    });

    kinds.forEach((kindAt, j) => {
      const cell = cellAt(j);
      if (!kindAt || kindAt === 'date' || kindAt.startsWith('mealtime:') || !cell) return;
      const [kind, slot = 'day'] = kindAt.split('@');
      const [what, arg] = kind.split(':');
      const col = header[j].trim();
      if (what === 'meal') {
        const time = mealTimes[arg] || MEAL_TIME[arg];
        const key = `${arg}|${time}`;
        const m = d.meals.get(key) || { meal: arg, time, items: [] };
        m.items.push(...splitList(cell));
        d.meals.set(key, m);
      } else if (what === 'area' || what === 'general' || what === 'factor') {
        const sc = readScore(cell);
        if (!sc) return;
        if (sc.error) { warn(`Row ${rowNo}, ${col}: couldn't read "${cell}" as a score, so it was left out.`); return; }
        if (sc.clamped) warn(`Row ${rowNo}, ${col}: ${cell} is above 10, so it was counted as 10.`);
        if (sc.mark) marks++;
        if (sc.word) words++;
        if (slot !== 'day') slotted = true;
        const c = (d.checks[slot] ||= { areas: {}, general: {}, factors: {} });
        const target = what === 'area' ? c.areas : what === 'general' ? c.general : c.factors;
        for (const id of arg.split(',')) target[id] = Math.max(target[id] || 0, sc.value);
      } else if (what === 'other') d.other.push(slot === 'day' ? cell : `${slot}: ${cell}`);
      else if (what === 'antihistamine') {
        const yn = readYesNo(cell);
        if (yn.taken) d.antihistamine = yn.name || d.antihistamine || true;
      } else if (what === 'meds') d.meds.push(...splitList(cell));
      else if (what === 'activity') d.activities.push(...splitList(cell));
      else if (what === 'note') d.notes.push(cell);
      else if (what === 'time') {
        const t = parseTime(cell);
        if (t) d.times[slot] = t;
        else warn(`Row ${rowNo}, ${col}: couldn't read the time "${cell}", so the usual time was used.`);
      }
    });
  });

  // ----- turn each day into diary entries -----
  const entries = [];
  const base = { source: 'notebook', created: now, updated: now };
  const positive = obj => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v > 0));
  const dedupe = list => list.filter((x, i) => list.findIndex(y => y.toLowerCase() === x.toLowerCase()) === i);
  const stats = { days: 0, checkins: 0, clear: 0, meals: 0, antihistamine: 0, meds: 0, activities: 0, notes: 0, marks, words, examples, slotted };
  for (const day of [...days.keys()].sort()) {
    const d = days.get(day);
    const before = entries.length;
    // Start/end check-ins get the day's unslotted scores too (e.g. sinus written once).
    const slots = ['start', 'end'].filter(s => d.checks[s]);
    const plan = slots.length ? slots : d.checks.day ? ['day'] : [];
    plan.forEach((slot, i) => {
      const own = d.checks[slot], all = d.checks.day && slot !== 'day' ? d.checks.day : null;
      const pick = part => positive({ ...(all?.[part] || {}), ...own[part] });
      const areas = pick('areas'), general = pick('general');
      const last = i === plan.length - 1;
      entries.push({
        ...base, id: slot === 'day' ? `nb:${day}:checkin` : `nb:${day}:checkin:${slot}`, type: 'symptoms', day,
        time: d.times[slot] || SLOT_TIME[slot], areas, general, factors: pick('factors'),
        note: last && d.other.length ? 'Other areas: ' + d.other.join('; ') : '',
      });
      stats.checkins++;
      if (!Object.keys(areas).length && !Object.keys(general).length) stats.clear++;
    });
    for (const m of [...d.meals.values()].sort((a, b) => a.time.localeCompare(b.time))) {
      const items = dedupe(m.items);
      if (!items.length) continue;
      entries.push({ ...base, id: `nb:${day}:food:${m.meal || 'day'}:${m.time}`, type: 'food', day, time: m.time, ...(m.meal ? { meal: m.meal } : {}), items, note: '' });
      stats.meals++;
    }
    const meds = dedupe([...(d.antihistamine ? [d.antihistamine === true ? 'Antihistamine' : `Antihistamine (${d.antihistamine})`] : []), ...d.meds]);
    if (meds.length) {
      entries.push({ ...base, id: `nb:${day}:meds`, type: 'meds', day, time: '08:00', items: meds, note: '' });
      if (d.antihistamine) stats.antihistamine++;
      if (d.meds.length) stats.meds++;
    }
    if (d.activities.length) {
      entries.push({ ...base, id: `nb:${day}:activity`, type: 'activity', day, time: '17:00', items: dedupe(d.activities), note: '' });
      stats.activities++;
    }
    if (d.notes.length) {
      entries.push({ ...base, id: `nb:${day}:note`, type: 'note', day, time: '21:00', text: d.notes.join('\n') });
      stats.notes++;
    }
    if (entries.length > before) stats.days++;
  }
  const dates = new Set(entries.map(e => e.day));
  const own = new Set(existing.filter(e => e.source !== 'notebook' && dates.has(e.day)).map(e => e.day));
  const replaced = new Set(existing.filter(e => e.source === 'notebook' && dates.has(e.day)).map(e => e.day));
  const used = [...dates].sort();
  return {
    entries, warnings, ignored, stats, monthFirst,
    first: used[0] || null, last: used.at(-1) || null,
    overlap: [...own].sort(), replaced: replaced.size,
  };
}
