// Small DOM + date helpers. User text is only ever inserted as text nodes (never innerHTML).

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  let pendingValue;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') pendingValue = v;
      else if (v === true) { if (k in el) el[k] = true; else el.setAttribute(k, ''); }
      else el.setAttribute(k, v);
    }
  }
  appendKids(el, children);
  if (pendingValue !== undefined) el.value = pendingValue; // after <option>s exist
  return el;
}

// Appends children, skipping null/false (so optional pieces can be written inline).
export function appendKids(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

// ---------- icons (simple stroke icons, drawn for this app) ----------
const ICONS = {
  calendar: ['M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z', 'M4 10h16', 'M8.5 3v4', 'M15.5 3v4'],
  image: ['M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z', 'M7.5 10a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0', 'M20 16l-4.5-4.5L7 19'],
  grid: ['M4 4h4v4H4z', 'M10 4h4v4h-4z', 'M16 4h4v4h-4z', 'M4 10h4v4H4z', 'M10 10h4v4h-4z', 'M16 10h4v4h-4z', 'M4 16h4v4H4z', 'M10 16h4v4h-4z', 'M16 16h4v4h-4z'],
  bottle: ['M10 3h4v3.5l2.5 3V19a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V9.5L10 6.5z', 'M7.5 13h9'],
  sliders: ['M4 7h4', 'M12 7h8', 'M8 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'M4 17h10', 'M18 17h2', 'M14 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0'],
  person: ['M12 3.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5', 'M12 9.5v6', 'M6.5 11.5l5.5-1.2 5.5 1.2', 'M12 15.5l-3 5', 'M12 15.5l3 5'],
  bowl: ['M3.5 11h17a8.5 8.5 0 0 1-17 0z', 'M9 3.5c-.8 1 .8 2 0 3.5', 'M14.5 3.5c-.8 1 .8 2 0 3.5'],
  pulse: ['M3 12h4l2.5-6 5 12 2.5-6h4'],
  pill: ['M8 8.5h8a3.5 3.5 0 0 1 0 7H8a3.5 3.5 0 0 1 0-7z', 'M12 8.5v7'],
  camera: ['M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z', 'M8.5 13a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0'],
  pencil: ['M5 19l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L9 17.5z', 'M13.5 7l3 3'],
  left: ['M14.5 5.5L8 12l6.5 6.5'],
  right: ['M9.5 5.5L16 12l-6.5 6.5'],
  close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  plus: ['M12 5v14', 'M5 12h14'],
  cloud: ['M7 18.5a4 4 0 0 1-.6-7.95A6 6 0 0 1 17.9 9.6a4.5 4.5 0 0 1-.4 8.9z', 'M12 16v-5', 'M9.5 13.5L12 11l2.5 2.5'],
  lock: ['M6.5 11h11v9h-11z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  clipboard: ['M9 3.5h6v3H9z', 'M9 5H6.5A1.5 1.5 0 0 0 5 6.5v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 5H15', 'M8.5 11.5h7', 'M8.5 15.5h5'],
  sun: ['M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8', 'M12 2.5v2', 'M12 19.5v2', 'M5.3 5.3l1.4 1.4', 'M17.3 17.3l1.4 1.4', 'M2.5 12h2', 'M19.5 12h2', 'M5.3 18.7l1.4-1.4', 'M17.3 6.7l1.4-1.4'],
  doc: ['M7 3.5h7l4 4V20.5H7z', 'M14 3.5v4h4', 'M10 12h5', 'M10 15.5h5'],
  share: ['M12 15V4', 'M8.5 7.5L12 4l3.5 3.5', 'M6 11v8.5h12V11'],
  printer: ['M7 9V4h10v5', 'M7 17H4.5v-6.5A1.5 1.5 0 0 1 6 9h12a1.5 1.5 0 0 1 1.5 1.5V17H17', 'M7 14h10v6.5H7z'],
};

export function icon(name, cls = 'ic') {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] || []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

// ---------- sheets (bottom panels) ----------
let openSheets = 0;

export function openSheet(title, { full = false, backdropClose = false, onClose } = {}) {
  const backdrop = h('div', { class: 'backdrop' });
  const body = h('div', { class: 'sheet-body' });
  const footer = h('div', { class: 'sheet-foot' });
  const sheet = h('div', { class: 'sheet' + (full ? ' full' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' },
      h('h2', {}, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => close() }, icon('close'))),
    body, footer);
  if (backdropClose) backdrop.addEventListener('click', () => close());
  document.body.append(backdrop, sheet);
  openSheets++;
  document.documentElement.classList.add('sheet-open');
  requestAnimationFrame(() => { backdrop.classList.add('in'); sheet.classList.add('in'); });
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    openSheets--;
    if (!openSheets) document.documentElement.classList.remove('sheet-open');
    backdrop.remove();
    sheet.remove();
    onClose?.();
  }
  return { body, footer, close, el: sheet, add: (...kids) => appendKids(body, kids) };
}

export function confirmSheet(title, message, confirmLabel = 'OK', danger = false) {
  return new Promise(resolve => {
    let answered = false;
    const s = openSheet(title, { backdropClose: true, onClose: () => { if (!answered) resolve(false); } });
    s.body.append(h('p', {}, message));
    s.footer.append(
      h('button', { class: 'btn', onclick: () => s.close() }, 'Cancel'),
      h('button', { class: 'btn grow ' + (danger ? 'danger' : 'primary'), onclick: () => { answered = true; resolve(true); s.close(); } }, confirmLabel));
  });
}

export function toast(message, ms = 2400) {
  for (const old of document.querySelectorAll('.toast')) old.remove();
  const t = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- dates (always local time, never UTC) ----------
export const pad = n => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeKey = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export function parseDay(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(key, n) { const d = parseDay(key); d.setDate(d.getDate() + n); return dayKey(d); }
export const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5);

export function prettyDay(key) {
  const today = dayKey();
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  return parseDay(key).toLocaleDateString(undefined, { weekday: 'long' });
}
export const prettyDate = key => parseDay(key).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
export const shortDate = key => parseDay(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function whenText(ms) {
  if (!ms) return 'never';
  const d = new Date(ms);
  const key = dayKey(d);
  // Weekday names are only clear within the last week; older than that, show the date.
  const label = addDays(dayKey(), -6) <= key ? prettyDay(key) : shortDate(key);
  return `${label} ${timeKey(d)}`;
}

export const uid = () => crypto.randomUUID();

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
