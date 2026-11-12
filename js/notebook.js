// Settings → "Copy in your paper notebook": the guide, the template, and importing a
// filled-in spreadsheet (file or pasted text) with a check before anything is saved.
// The reading itself is in importer.js.

import { h, icon, openSheet, confirmSheet, toast, dayKey, shortDate, prettyDate } from './ui.js';
import { shortLabel, GENERAL } from './body.js';
import { readNotebook, templateCsv, TEMPLATE_HEADERS } from './importer.js';
import * as db from './db.js';

const plural = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`;

function describe(e) {
  switch (e.type) {
    case 'symptoms': {
      const parts = [...Object.entries(e.areas || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${shortLabel(k)} ${v}`),
        ...GENERAL.filter(g => e.general?.[g.id]).map(g => `${g.label} ${e.general[g.id]}`)];
      return `Check-in: ${parts.length ? parts.join(' · ') : 'clear'}${e.note ? ` (${e.note})` : ''}`;
    }
    case 'food': return `${e.meal || 'Food'}: ${e.items.join(', ')}`;
    case 'meds': return `Meds: ${e.items.join(', ')}`;
    case 'activity': return `Activities: ${e.items.join(', ')}`;
    case 'note': return `Note: ${e.text}`;
    default: return '';
  }
}

// app: { state, render, guard, pickFile, shareFile }
export function createNotebookImport(app) {
  const { state } = app;
  const imported = () => state.entries.filter(e => e.source === 'notebook');

  function card() {
    const days = [...new Set(imported().map(e => e.day))].sort();
    return h('section', { class: 'card' },
      h('div', { class: 'card-row' }, icon('book'), h('h2', {}, 'Copy in your paper notebook')),
      h('p', { class: 'small' }, 'Put your notebook into a spreadsheet, one row per day, and import it here. Those days then count in Trends, Triggers and the report.'),
      days.length ? h('p', { class: 'small muted' }, `Imported so far: ${plural(days.length, 'day')} (${shortDate(days[0])} – ${shortDate(days.at(-1))}).`) : null,
      h('div', { class: 'stack' },
        h('button', { class: 'btn wide', onclick: openGuide }, 'How to fill in the spreadsheet'),
        h('button', { class: 'btn wide primary', onclick: app.guard(chooseFile) }, 'Import a spreadsheet (CSV)'),
        h('button', { class: 'btn wide', onclick: openPaste }, 'Paste the text instead'),
        days.length ? h('button', { class: 'btn wide danger-ghost', onclick: app.guard(removeAll) }, 'Remove the notebook import') : null));
  }

  function openGuide() {
    const sheet = openSheet('Notebook spreadsheet', { full: true, backdropClose: true });
    const item = (name, text) => h('li', {}, h('strong', {}, name + ': '), text);
    sheet.add(
      h('p', {}, 'One row per day, with the column names in the first row. Leave out any columns you don\'t need; the order doesn\'t matter.'),
      h('ul', { class: 'steps small' },
        item('Date', 'like 14/08/2026 (day first). Without a year, the most recent past date is used.'),
        item('Breakfast, Lunch, Dinner, Snacks, Drinks', 'what you had, separated by commas. Or put the whole day in one "Food" column.'),
        item('Body areas, Itch, Dry skin, Swelling, Sinus', 'a score from 0 to 10, or mild / moderate / severe, or x for an area you marked without a number (counted as 5). Blank means not recorded. For a clear day, put 0 in any symptom column.'),
        item('Other areas', 'anything outside the body map, such as "back 4".'),
        item('Antihistamine', 'yes or no, or the name of the one you took.'),
        item('Other meds & creams, Activities', 'separated by commas.'),
        item('Note', 'the day\'s note.'),
        item('Optional extras', 'for separate start- and end-of-day scores, add "(start)" or "(end)" to a symptom column, e.g. "Face (start)" and "Face (end)", plus "Start time" / "End time". For meal times, add "Breakfast time", "Lunch time" and so on (e.g. 7:30pm). A day can take several rows, e.g. one per snack.')),
      h('p', { class: 'small muted' }, 'Fill it in with Google Sheets, Numbers or Excel and save or download it as CSV. The example rows (dates starting with "e.g.") are skipped. Importing the same days again replaces them, so you can fix a mistake and re-import.'),
      h('p', { class: 'small muted' }, `Columns: ${TEMPLATE_HEADERS.join(', ')}.`));
    sheet.footer.append(h('button', { class: 'btn primary grow', onclick: app.guard(() => app.shareFile(new File([templateCsv()], 'Notebook-template.csv', { type: 'text/csv' }))) }, 'Get the template'));
  }

  async function chooseFile() {
    const file = await app.pickFile('');
    if (!file) return;
    if (file.size > 5e6) { toast('That file is too big for a notebook spreadsheet', 3500); return; }
    check(await file.text());
  }

  function openPaste() {
    const sheet = openSheet('Paste notebook text', { full: true });
    const box = h('textarea', { rows: 12, class: 'paste-box', placeholder: 'Date,Breakfast,Lunch,Dinner,Face,Itch,Antihistamine,Note\n14/08/2026,"Oats, banana",Chicken wrap,Pasta,3,4,yes,Itchy after BJJ', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
    sheet.add(h('p', { class: 'small muted' }, 'Paste rows copied from a spreadsheet, or text in the same layout as the template, with the column names in the first line.'), box);
    sheet.footer.append(h('button', { class: 'btn primary grow', onclick: () => {
      if (!box.value.trim()) { toast('Paste something first'); return; }
      check(box.value, () => sheet.close());
    } }, 'Check it'));
  }

  // Shows what would be imported; nothing is saved until "Import" is tapped.
  function check(text, onImported) {
    const res = readNotebook(text, { today: dayKey(), existing: state.entries });
    const sheet = openSheet('Check before importing', { full: true });
    if (res.error || !res.entries.length) {
      sheet.add(
        h('p', {}, res.error ? `Couldn't import this: ${res.error}` : 'Nothing to import: no rows with both a date and something recorded.'),
        res.warnings?.length ? warningList(res.warnings) : null,
        h('p', { class: 'small muted' }, 'Tip: start from the template (Settings → How to fill in the spreadsheet → Get the template).'));
      sheet.footer.append(h('button', { class: 'btn grow', onclick: () => sheet.close() }, 'Close'));
      return;
    }
    const s = res.stats;
    const byDay = new Map();
    for (const e of res.entries) byDay.set(e.day, [...(byDay.get(e.day) || []), e]);
    const sample = [...byDay.keys()].slice(0, 3);
    const line = (n, text) => (n ? h('li', {}, text) : null);
    sheet.add(
      h('div', { class: 'card' },
        h('h2', {}, plural(s.days, 'day')),
        h('p', { class: 'small muted' }, `${shortDate(res.first)} – ${prettyDate(res.last)}. Dates read as ${res.monthFirst ? 'month/day/year' : 'day/month/year'}.`),
        h('ul', { class: 'steps small' },
          line(s.checkins, `${plural(s.checkins, 'check-in')}${s.clear ? ` (${s.clear} clear)` : ''}${s.slotted ? ', at the start and end of the day' : ', at 9 pm'}`),
          line(s.meals, plural(s.meals, 'meal')),
          line(s.antihistamine, `Antihistamine on ${plural(s.antihistamine, 'day')}`),
          line(s.meds, `Other meds & creams on ${plural(s.meds, 'day')}`),
          line(s.activities, `Activities on ${plural(s.activities, 'day')}`),
          line(s.notes, plural(s.notes, 'note')))),
      s.marks ? h('p', { class: 'small' }, `${plural(s.marks, 'mark')} without a number ${s.marks === 1 ? 'was' : 'were'} counted as 5 (moderate).`) : null,
      s.words ? h('p', { class: 'small' }, `${plural(s.words, 'score')} written as words: mild = 3, moderate = 6, severe = 9.`) : null,
      res.replaced ? h('p', { class: 'small' }, `${plural(res.replaced, 'day')} imported before will be replaced by this version.`) : null,
      res.overlap.length ? h('p', { class: 'small warn-text' }, `${plural(res.overlap.length, 'day')} already ${res.overlap.length === 1 ? 'has' : 'have'} entries made in the app (${res.overlap.slice(0, 4).map(shortDate).join(', ')}${res.overlap.length > 4 ? ' …' : ''}). The notebook's entries are added alongside them.`) : null,
      res.ignored.length ? h('p', { class: 'small muted' }, `Columns not used: ${res.ignored.join(', ')}.`) : null,
      res.warnings.length ? warningList(res.warnings) : null,
      h('h3', { class: 'section' }, 'First days, as they\'ll appear'),
      h('div', { class: 'day-items' }, sample.map(day => h('div', { class: 'day-item' },
        h('span', { class: 'entry-main' },
          h('span', { class: 'entry-title' }, prettyDate(day)),
          byDay.get(day).map(e => h('span', { class: 'entry-sub wrap' }, describe(e))))))));
    sheet.footer.append(
      h('button', { class: 'btn', onclick: () => sheet.close() }, 'Cancel'),
      h('button', { class: 'btn primary grow', onclick: app.guard(async () => {
        const dates = new Set(res.entries.map(e => e.day));
        const stale = state.entries.filter(e => e.source === 'notebook' && dates.has(e.day));
        await db.write([...stale.map(e => ['delete', 'entries', e.id]), ...res.entries.map(e => ['put', 'entries', e])]);
        state.entries = [...state.entries.filter(e => !(e.source === 'notebook' && dates.has(e.day))), ...res.entries];
        sheet.close();
        onImported?.();
        app.render();
        toast(`Imported ${plural(s.days, 'day')} from your notebook`, 3000);
      }) }, `Import ${plural(s.days, 'day')}`));
  }

  function warningList(warnings) {
    return h('details', { class: 'sure', open: warnings.length <= 5 },
      h('summary', {}, `${plural(warnings.length, 'thing')} to check`),
      h('ul', { class: 'steps small' }, warnings.slice(0, 40).map(w => h('li', {}, w)),
        warnings.length > 40 ? h('li', {}, `… and ${warnings.length - 40} more.`) : null));
  }

  async function removeAll() {
    const mine = imported();
    const days = new Set(mine.map(e => e.day)).size;
    if (!await confirmSheet('Remove the notebook import?', `This deletes the ${plural(mine.length, 'entry', 'entries')} copied from your notebook (${plural(days, 'day')}). Entries you made in the app aren't touched.`, 'Remove', true)) return;
    await db.write(mine.map(e => ['delete', 'entries', e.id]));
    state.entries = state.entries.filter(e => e.source !== 'notebook');
    app.render();
    toast('Notebook import removed');
  }

  return { card };
}
