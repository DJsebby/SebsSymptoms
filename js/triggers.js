// The Triggers tab: likely triggers found in the diary, as a guide to what to cut out and
// test. The statistics are in insights.js; this file only presents them.

import { h, appendKids, icon, openSheet, confirmSheet, toast, dayKey, shortDate, uid } from './ui.js';
import { analyze, trialStats, TARGETS, AUTO, TIERS, WINDOWS, MIN_DAYS, STRONG_DAYS, TEST_DAYS } from './insights.js';

const TIER_SHORT = { strong: 'Strong', possible: 'Possible', weak: 'Weak', unclear: 'Unclear', fine: 'Fine', few: 'Few days', common: 'Every day' };
const AFTER = ['on the same day as it', 'on the day of it or the day after', 'within 2 days of it'];
const LAG_LABEL = ['Same day', 'Next day', '2 days later', '3 days later'];

const r1 = v => (v == null || Number.isNaN(v) ? '–' : (Math.round(v * 10) / 10).toFixed(1));
const signed = v => (Math.abs(v) < 0.05 ? '0.0' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1));
const plural = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`;
const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
const sevClass = v => (v == null || Math.round(v) <= 0 ? 'zero' : 'sev-' + Math.min(10, Math.round(v)));

const named = x => (x.kind === 'group' ? `${x.label} (group)` : x.label);
const kindLabel = x => (x.kind === 'group' ? 'Food group' : x.kind === 'product' ? x.category || 'Product' : x.kind === 'activity' ? 'Activity' : 'Food or drink');
const kindTag = x => ({ group: 'group', activity: 'activity', product: 'product' })[x.kind] || null;
const whenShort = x => (x.kind === 'product' ? 'while using' : WINDOWS[x.best].short);
const whenLong = x => (x.kind === 'product' ? 'while you used it' : AFTER[x.best]);

const pill = (tier, short = false) => h('span', { class: 'pill t-' + tier }, h('i', { 'aria-hidden': 'true' }), short ? TIER_SHORT[tier] : TIERS[tier]);
const sectionTitle = (text, extra) => h('h3', { class: 'section' }, text, extra ? h('span', { class: 'section-count' }, extra) : null);

// ---------- small charts ----------

const scalePos = (v, s) => ((Math.min(s.max, Math.max(s.min, v)) - s.min) / (s.max - s.min)) * 100;

// Dot = best estimate, bar = likely range (90%), line = no change.
function forest(x, s) {
  const zero = h('i', { class: 'f-zero' }), ci = h('i', { class: 'f-ci' }), dot = h('i', { class: 'f-dot' });
  const lo = scalePos(x.lo, s), hi = scalePos(x.hi, s);
  zero.style.left = scalePos(0, s) + '%';
  ci.style.left = lo + '%';
  ci.style.width = Math.max(0.5, hi - lo) + '%';
  dot.style.left = scalePos(x.est, s) + '%';
  return h('span', { class: 'forest t-' + x.tier, 'aria-hidden': 'true' }, zero, ci, dot);
}

function axis(s) {
  const row = h('span', { class: 'forest-axis', 'aria-hidden': 'true' });
  for (let v = s.min; v <= s.max; v++) {
    const t = h('span', { class: 'tick' + (v === 0 ? ' zero' : '') }, v === 0 ? '0' : (v > 0 ? '+' : '−') + Math.abs(v));
    t.style.left = scalePos(v, s) + '%';
    row.append(t);
  }
  return h('div', { class: 'trig-axis' }, h('span', { class: 'trig-axis-cap' }, 'Change in score'), row, h('span'));
}

// Bars that grow left (better) or right (worse) from a centre line.
function dbars(rows, cls = '') {
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value ?? 0)));
  return h('div', { class: 'dbars ' + cls }, rows.map(r => {
    const bar = h('i', { class: r.value > 0 ? 'up' : 'down' });
    const w = r.value == null ? 0 : (Math.abs(r.value) / max) * 50;
    bar.style.width = w + '%';
    bar.style.left = r.value > 0 ? '50%' : 50 - w + '%';
    return h('div', { class: 'dbar' + (r.strong ? ' on' : '') },
      h('span', { class: 'dbar-label' }, r.label),
      h('span', { class: 'dbar-track' }, h('i', { class: 'mid' }), bar),
      h('span', { class: 'dbar-val' }, r.value == null ? '–' : signed(r.value)));
  }));
}

function avgBar(label, value, n, unit = 'days') {
  const bar = h('i', { class: sevClass(value) });
  bar.style.width = `${Math.max(2, ((value || 0) / 10) * 100)}%`;
  return h('div', { class: 'cmp' },
    h('span', { class: 'cmp-label' }, label),
    h('span', { class: 'cmp-track' }, bar),
    h('span', { class: 'cmp-val' }, r1(value)),
    h('span', { class: 'cmp-n' }, plural(n, unit === 'days' ? 'day' : unit)));
}

// The last few weeks: one square per day (that day's score), a dot where it was logged.
function timeline(points, symptomLabel, product) {
  const grid = h('div', { class: 'tl' });
  points.forEach((p, i) => {
    if (i % 14 === 0) grid.append(h('span', { class: 'tl-date' }, shortDate(p.day)));
    grid.append(h('span', {
      class: `tl-day ${p.y == null ? 'nodata' : sevClass(p.y)}${p.on ? (product ? ' use' : ' on') : ''}`,
      title: `${shortDate(p.day)}: ${p.y == null ? 'no check-in' : symptomLabel + ' ' + p.y}${p.on ? (product ? ', in use' : ', logged') : ''}`,
    }));
  });
  return grid;
}

function thirdsChart(e) {
  const max = Math.max(1, ...e.thirds.map(t => t.avg));
  return h('span', { class: 'thirds', 'aria-hidden': 'true' }, e.thirds.map(t => {
    const b = h('i', { class: sevClass(t.avg) });
    b.style.height = `${Math.max(12, (t.avg / max) * 100)}%`;
    return b;
  }));
}

// ---------- the tab ----------

// app: { state, setting, saveSetting, render, guard, go }
export function createTriggers(app) {
  const { state } = app;
  let cache = null;

  const target = () => state.trigTarget || 'auto';
  const exclusions = () => app.setting('groupExclusions') || {};
  const trials = () => app.setting('trials') || [];
  const activeTrial = () => trials().find(t => !t.end) || null;

  // Recalculate only when something the analysis uses has changed.
  function signature() {
    let e = 0, p = 0, w = 0;
    for (const x of state.entries) e = Math.max(e, x.updated || x.created || 0);
    for (const x of state.products) p = Math.max(p, x.updated || x.created || 0);
    for (const x of state.weather.values()) w = Math.max(w, x.fetched || 0);
    return [state.entries.length, e, state.products.length, p, state.weather.size, w, target(), JSON.stringify(exclusions()), dayKey()].join('|');
  }
  function results() {
    const sig = signature();
    if (cache?.sig !== sig) {
      cache = { sig, res: analyze({ entries: state.entries, products: state.products, weather: state.weather, target: target(), exclusions: exclusions() }) };
    }
    return cache.res;
  }

  function view() {
    const root = h('div', { class: 'view triggers' });
    const fill = () => {
      root.replaceChildren();
      try {
        appendKids(root, content(results()));
      } catch (err) {
        console.error(err);
        appendKids(root, [header(), h('p', { class: 'empty' }, "Couldn't work out patterns: " + err.message)]);
      }
    };
    if (cache?.sig === signature()) fill();
    else { // a big diary can take a moment: show the page first
      appendKids(root, [header(), h('p', { class: 'empty' }, 'Looking for patterns…')]);
      setTimeout(() => { if (root.isConnected) fill(); }, 30);
    }
    return root;
  }

  function header() {
    const sel = h('select', { class: 'target-select', 'aria-label': 'Symptom to look at', value: target() },
      h('option', { value: 'auto' }, AUTO.full),
      h('optgroup', { label: 'One symptom' }, TARGETS.filter(t => !t.body).map(t => h('option', { value: t.id }, t.full))),
      h('optgroup', { label: 'One body area' }, TARGETS.filter(t => t.body).map(t => h('option', { value: t.id }, t.label))));
    sel.addEventListener('change', () => { state.trigTarget = sel.value; app.render(); });
    return [
      h('div', { class: 'title-row' }, h('h1', {}, 'Triggers'),
        h('button', { class: 'btn small', onclick: openHow }, icon('info'), 'How it works')),
      h('label', { class: 'target-row' }, h('span', {}, 'Looking at'), sel),
    ];
  }

  function content(res) {
    if (!res.ready) return [header(), notReady(res), trialCard(), pastTests()];
    const by = tier => res.items.filter(x => x.tier === tier);
    const likely = [...by('strong'), ...by('possible')];
    const weak = by('weak'), fine = by('fine'), common = by('common'), few = by('few');
    const s = res.scale;
    return [
      header(),
      h('p', { class: 'small muted' }, `From ${plural(res.checkinDays, 'day')} of check-ins since ${shortDate(res.since)}. ${res.tested} things compared.`),
      res.noVariation ? h('p', { class: 'empty' }, `${res.target.label} scores have been the same every day so far, so there's nothing to compare yet.`) : [
        trialCard(),
        guideCard(likely, weak, common),
        likely.length ? [sectionTitle('Likely triggers'), h('div', { class: 'trig-list' }, axis(s), likely.map(x => itemRow(x, s)))] : null,
        weak.length ? h('details', { class: 'trig-more' },
          h('summary', {}, `Weak hints (${weak.length})`),
          h('p', { class: 'small muted' }, 'Unusual on their own, but with this many things compared a few are expected by chance. Keep an eye on them.'),
          h('div', { class: 'trig-list' }, axis(s), weak.map(x => itemRow(x, s)))) : null,
        envSection(res),
        fine.length ? [sectionTitle('No sign of a problem', String(fine.length)),
          h('p', { class: 'small muted' }, 'Logged often enough, and symptoms didn\'t rise afterwards. Probably fine to keep.'),
          chipList(fine, x => `${named(x)} · ${x.days}d`)] : null,
        common.length ? [sectionTitle('Too common to judge', String(common.length)),
          h('p', { class: 'small muted' }, 'Almost every day, so there are too few days without them to compare. Only a break can test these.'),
          chipList(common, x => `${named(x)} · ${Math.round(x.share * 100)}%`)] : null,
        few.length ? h('details', { class: 'trig-more' },
          h('summary', {}, `Not enough days yet (${few.length})`),
          h('p', { class: 'small muted' }, 'Each needs at least 3 days (with check-ins) before it can be compared.'),
          chipList(few, x => `${named(x)} · ${x.days}d`)) : null,
      ],
      pastTests(),
      res.items.length ? h('button', { class: 'btn wide', onclick: () => openAll(res) }, `See all ${res.items.length} results`) : null,
      h('p', { class: 'small muted trig-foot' }, 'Patterns, not proof. Meds & creams aren\'t included: they\'re used because of flares, so they would always look linked. Before cutting out a whole food group for more than a few weeks, check with your specialist or a dietitian.'),
    ];
  }

  function itemRow(x, s) {
    const tag = kindTag(x);
    return h('button', { class: 'trig-row', onclick: () => openItem(x.key), 'aria-label': `${x.label}. ${TIERS[x.tier]}: ${x.symptom.label} ${signed(x.est)} points, ${whenShort(x)}.` },
      h('span', { class: 'trig-name' }, h('span', { class: 'trig-label' }, x.label), tag ? h('span', { class: 'trig-kind' }, tag) : null),
      h('span', { class: 'trig-meta' }, pill(x.tier, true), h('span', {}, `${x.symptom.label} · ${whenShort(x)}`)),
      forest(x, s),
      h('span', { class: 'trig-eff' }, signed(x.est)));
  }

  function chipList(list, text) {
    return h('div', { class: 'chips trig-chips' }, list.map(x => h('button', { class: 'chip', onclick: () => openItem(x.key) }, text(x))));
  }

  function notReady(res) {
    const bar = h('i');
    bar.style.width = `${Math.min(100, (res.checkinDays / MIN_DAYS) * 100)}%`;
    const t = res.tracked;
    return h('section', { class: 'card' },
      h('h2', {}, 'Patterns need about 2 weeks'),
      h('p', { class: 'small' }, `${res.checkinDays} of ${MIN_DAYS} days with a check-in so far.`),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(MIN_DAYS), 'aria-valuenow': String(Math.min(MIN_DAYS, res.checkinDays)) }, bar),
      h('ul', { class: 'steps small' },
        h('li', {}, 'Check in every day, including good days. A clear day is as useful as a bad one.'),
        h('li', {}, 'Log everything you eat and drink, including snacks, sauces and drinks.'),
        h('li', {}, 'Add your soaps, detergents and creams under Products.')),
      h('p', { class: 'small muted' }, `Logged so far: ${plural(t.foods, 'food or drink', 'foods and drinks')}` +
        (t.groups.length ? ` (covering ${t.groups.slice(0, 6).join(', ')})` : '') + `, ${plural(t.activities, 'activity', 'activities')}, ${plural(t.products, 'product')}.`));
  }

  function guideCard(likely, weak, common) {
    const testing = activeTrial();
    const top = likely.filter(x => x.key !== testing?.key).slice(0, 3);
    const breakOnly = common.filter(x => x.kind === 'group');
    const title = !top.length ? 'Nothing else stands out yet' : testing ? 'Next to test' : 'Best to test first';
    return h('section', { class: 'card guide' },
      h('div', { class: 'card-row' }, icon('flask'), h('h2', {}, testing || top.length ? title : 'Nothing stands out yet')),
      top.length
        ? h('ol', { class: 'guide-list' }, top.map(x => h('li', {},
          h('button', { class: 'link', onclick: () => openItem(x.key) }, named(x)),
          h('span', { class: 'small muted' }, ` · ${lower(x.symptom.label)} ${signed(x.est)} ${whenShort(x)} · ${TIER_SHORT[x.tier].toLowerCase()} link`))))
        : h('p', { class: 'small' }, weak.length
          ? `Closest so far: ${weak.slice(0, 3).map(named).join(', ')}. Keep logging; patterns firm up with more days.`
          : 'Keep checking in and logging. Patterns firm up with more days.'),
      top.length ? h('p', { class: 'small muted' }, testing
        ? `Finish testing ${testing.label} first: one change at a time keeps the result clear.`
        : 'Cut out one thing at a time for 3 weeks while you keep checking in. If you improve, have it again once to confirm. Tap one to start a test.') : null,
      breakOnly.length ? h('p', { class: 'small muted' }, `${breakOnly.map(x => x.label).join(', ')}: in almost every day, so the diary can't judge ${breakOnly.length > 1 ? 'them' : 'it'}. Only a break can.`) : null);
  }

  function envSection(res) {
    if (!res.env.length) {
      return app.setting('weather')?.enabled ? null : [sectionTitle('Weather, sleep & stress'),
        h('p', { class: 'small muted' }, 'Record sleep and stress in check-ins, and turn on weather in Settings, to see whether humidity, heat, UV, pollen or bad nights line up with flares.')];
    }
    return [sectionTitle('Weather, sleep & stress'), h('div', { class: 'trig-list' },
      h('div', { class: 'trig-axis' }, h('span', { class: 'trig-axis-cap' }, 'Average score by level'), h('span', { class: 'thirds-axis', 'aria-hidden': 'true' }, 'low · high'), h('span')),
      res.env.map(e => envRow(e)))];
  }

  function envRow(e) {
    const clear = e.tier === 'unclear';
    const text = clear ? 'No clear pattern yet' : `${e.symptom.label} ${e.dir > 0 ? e.pos : e.neg}`;
    return h('button', { class: 'trig-row env' + (clear ? ' quiet' : ''), onclick: () => openEnv(e), 'aria-label': `${e.label}. ${TIERS[e.tier]}: ${text}.` },
      h('span', { class: 'trig-name' }, h('span', { class: 'trig-label' }, e.label)),
      h('span', { class: 'trig-meta' }, clear ? null : pill(e.tier, true), h('span', {}, text)),
      thirdsChart(e),
      h('span', { class: 'trig-eff' }, clear ? '' : signed(e.eff)));
  }

  // ---------- elimination tests ----------

  const startTest = app.guard(async (x, close) => {
    if (activeTrial()) { toast('Finish your current test first'); return; }
    const t = { id: uid(), key: x.key, label: x.label, symptom: x.symptom?.id && x.symptom.id !== 'auto' ? x.symptom.id : 'worst', start: dayKey(), days: TEST_DAYS, end: null };
    await app.saveSetting('trials', [...trials(), t]);
    close?.();
    app.render();
    toast(`Test started: 3 weeks without ${x.label}`, 3000);
  });

  const endTest = app.guard(async (t, s) => {
    if (!s.complete && !await confirmSheet('End the test early?', `It's day ${s.dayNum} of ${s.planned}. Results before 3 weeks are less reliable, but they're still saved.`, 'End test')) return;
    await app.saveSetting('trials', trials().map(x => (x.id === t.id ? { ...x, end: dayKey() } : x)));
    app.render();
    toast('Test saved');
  });

  const statsFor = t => trialStats({ entries: state.entries, trial: t, target: t.symptom || 'worst', exclusions: exclusions(), today: dayKey() });

  function verdict(s) {
    const { before, during } = s;
    if (before.n < 5) return 'There weren\'t enough check-ins in the 3 weeks before the test to compare against.';
    if (during.n < 5) return 'Too few check-ins during the test to tell.';
    const diff = during.avg - before.avg;
    if (diff <= -1) return 'Clearly better. To confirm, have it again once and watch the next 3 days. If symptoms come back, that\'s strong evidence: tell your specialist.';
    if (diff <= -0.4) return 'A little better. Confirm by having it again once and watching the next 3 days, or repeat the test.';
    return 'No real improvement, so it probably isn\'t the cause. You can bring it back.';
  }

  function trialCard() {
    const t = activeTrial();
    if (!t) return null;
    const s = statsFor(t);
    const bar = h('i');
    bar.style.width = `${Math.min(100, (s.dayNum / s.planned) * 100)}%`;
    const sym = s.symptom.label;
    return h('section', { class: 'card trial-card' },
      h('div', { class: 'card-row' }, icon('flask'), h('strong', {}, `Testing without ${t.label}`),
        h('span', { class: 'muted' }, s.complete ? 'Done' : `Day ${s.dayNum} of ${s.planned}`)),
      h('div', { class: 'progress' }, bar),
      h('div', { class: 'trial-cmp' },
        avgBar('3 weeks before', s.before.avg, s.before.n),
        avgBar('Since starting', s.during.avg, s.during.n),
        s.last7 ? avgBar('Last 7 days', s.last7.avg, s.last7.n) : null),
      h('p', { class: 'small muted' }, `${sym} score, average per day (highest of each day's check-ins).`),
      s.slips.length ? h('p', { class: 'small warn-text' }, `Logged during the test: ${s.slips.slice(0, 3).map(x => `${x.item} (${shortDate(x.day)})`).join(', ')}${s.slips.length > 3 ? ` and ${s.slips.length - 3} more` : ''}. Reactions can blur the result for a couple of days.`) : null,
      s.complete ? h('p', { class: 'small' }, verdict(s)) : h('p', { class: 'small muted' }, 'Keep checking in every day. Improvement can take 2–3 weeks to show.'),
      h('button', { class: 'btn small' + (s.complete ? ' primary' : ''), onclick: () => endTest(t, s) }, s.complete ? 'Finish and save the result' : 'End test early'));
  }

  function pastTests() {
    const done = trials().filter(t => t.end).sort((a, b) => b.start.localeCompare(a.start));
    if (!done.length) return null;
    return [sectionTitle('Your tests'), h('div', { class: 'list' }, done.map(t => {
      const s = statsFor(t);
      const change = s.before.avg != null && s.during.avg != null ? `${s.symptom.label} ${r1(s.before.avg)} → ${r1(s.during.avg)}` : 'not enough check-ins';
      return h('button', { class: 'list-row test-row', onclick: () => openTest(t) },
        h('span', {}, h('strong', {}, `Without ${t.label}`), h('span', { class: 'small muted block' }, `${shortDate(t.start)} – ${shortDate(t.end)} · ${change}`)),
        icon('right'));
    }))];
  }

  function openTest(t) {
    const s = statsFor(t);
    const sheet = openSheet(`Test: without ${t.label}`, { full: true });
    sheet.add(
      h('p', { class: 'small muted' }, `${shortDate(t.start)} – ${shortDate(t.end)} (${plural(s.dayNum, 'day')}). ${s.symptom.label} score, average per day.`),
      h('div', { class: 'card' },
        avgBar('3 weeks before', s.before.avg, s.before.n),
        avgBar('During the test', s.during.avg, s.during.n),
        s.last7 ? avgBar('Last 7 days', s.last7.avg, s.last7.n) : null),
      h('p', {}, verdict(s)),
      s.slips.length ? h('p', { class: 'small warn-text' }, `Logged during the test: ${s.slips.map(x => `${x.item} (${shortDate(x.day)})`).join(', ')}.`) : null);
    sheet.footer.append(h('button', { class: 'btn danger-ghost', onclick: app.guard(async () => {
      if (!await confirmSheet('Delete this test?', 'Only the test record is removed. Your diary is not changed.', 'Delete', true)) return;
      await app.saveSetting('trials', trials().filter(x => x.id !== t.id));
      sheet.close(); app.render(); toast('Test deleted');
    }) }, 'Delete test'), h('button', { class: 'btn grow', onclick: () => sheet.close() }, 'Close'));
  }

  // ---------- one item in detail ----------

  function headline(x, d) {
    const sym = d.symptom.label;
    if (x.status === 'dup') {
      const only = x.members.find(m => !m.excluded);
      return only ? `So far only one thing you've logged counts as ${lower(x.label)}: ${only.label}. The results for ${only.label} cover it.` : `Nothing you've logged counts as ${lower(x.label)} at the moment.`;
    }
    if (x.status === 'few') return `Logged on ${plural(x.days, 'day')} so far. It needs at least 3 days near a check-in, plus enough days without it, before it can be compared.`;
    if (x.status === 'common') {
      return x.kind === 'product'
        ? 'Used every day you\'ve tracked, so there\'s nothing to compare it with. To test it, switch to something else (fragrance-free is a good choice) for 3 weeks and mark this one Stopped.'
        : `You have this on ${Math.round(x.share * 100)}% of days, so there are too few days without it to compare. The only way to check it is a break.`;
    }
    const size = Math.abs(x.est) < 0.05 ? `${sym} was about the same as usual` : `${sym} was ${r1(Math.abs(x.est))} points ${x.est > 0 ? 'higher' : 'lower'} than usual`;
    const why = {
      strong: 'A strong link: it stands out even allowing for everything else that was compared.',
      possible: 'A possible link, worth testing. Some links at this level turn out to be chance.',
      weak: 'Only a weak hint so far. Chance could easily explain it.',
      unclear: 'No clear link: the difference is within what chance produces.',
      fine: 'No sign of a problem: there\'s enough data to say any effect is small.',
    }[x.tier];
    const period = x.kind === 'product' ? ' Products are compared period against period, so anything else that changed at the same time (season, treatments) could also explain a difference.' : '';
    return `${size} ${whenLong(x)}. ${why}${period}`;
  }

  function openItem(key) {
    const res = results();
    const x = res.lookup?.(key);
    if (!x) return;
    const d = res.detail(key);
    const sheet = openSheet(x.label, { full: true });
    const sym = d.symptom.label;
    const tested = x.status === 'tested';
    const isProd = x.kind === 'product';
    const p = d.plain;

    const blocks = [
      h('div', { class: 'trig-head' }, x.status === 'dup' ? null : pill(x.tier), h('span', { class: 'small muted' }, kindLabel(x) + (x.weekly ? ' · weekly routine' : ''))),
      h('p', { class: 'trig-headline' }, headline(x, d)),
    ];
    if (tested) {
      blocks.push(
        sectionTitle(`${sym}: plain averages`),
        h('div', { class: 'card' },
          avgBar(isProd ? 'While using' : 'With it', p.withAvg, p.withN),
          avgBar(isProd ? 'Other days' : 'Without', p.withoutAvg, p.withoutN),
          h('p', { class: 'small muted' }, `Bad days (${sym.toLowerCase()} ${p.bad} or more): ${Math.round((100 * p.withBad) / Math.max(1, p.withN))}% ${isProd ? 'while using it' : 'with it'}, ${Math.round((100 * p.withoutBad) / Math.max(1, p.withoutN))}% otherwise. "With it" means ${isProd ? 'days it was in use' : WINDOWS[x.best].label + ' after having it'}.`)));
      if (d.lags) {
        blocks.push(sectionTitle('When it shows'), h('div', { class: 'card' },
          dbars(d.lags.map(l => ({ label: LAG_LABEL[l.lag], value: l.beta }))),
          h('p', { class: 'small muted' }, `${sym}: points above or below usual on each day after having it. A delayed reaction peaks a day or two later.`)));
      }
      const areas = d.byTarget.filter(b => b.id !== 'worst' && b.id !== 'skin').sort((a, b) => b.beta - a.beta).slice(0, 8);
      if (areas.length > 1) {
        blocks.push(sectionTitle('Where it shows'), h('div', { class: 'card' },
          dbars(areas.map(b => ({ label: b.label, value: b.beta, strong: b.shown }))),
          h('p', { class: 'small muted' }, `Every symptom and area, ${isProd ? 'while using it' : WINDOWS[x.best].label}: points above or below usual.`)));
      }
    } else if (x.status === 'common' && !isProd && !activeTrial()) {
      blocks.push(h('div', { class: 'note-banner' }, h('span', {}, 'Testing a break is the only way to know. Cut it out for 3 weeks and the app compares before and after.')));
    }
    if (d.timeline.some(t => t.on)) {
      blocks.push(sectionTitle(`Last ${Math.ceil(d.timeline.length / 7)} weeks`), h('div', { class: 'card' },
        timeline(d.timeline, sym, isProd),
        h('p', { class: 'small muted' }, `Each square is a day, coloured like Trends: stronger colour = worse ${sym.toLowerCase()}, green = none, grey = no check-in. ${isProd ? 'Underlined: in use.' : 'Dot: logged that day. Look for strong colours soon after the dots.'}`)));
    }
    if (d.together.length) {
      blocks.push(sectionTitle('Often on the same days'), h('div', { class: 'list' }, d.together.map(o =>
        h('button', { class: 'list-row', onclick: () => { sheet.close(); openItem(o.key); } }, h('span', {}, o.label), h('span', { class: 'small muted' }, `${o.days} of ${o.of} days`)))),
      h('p', { class: 'small muted' }, 'Things that always come together can\'t be told apart by the diary. Test them separately.'));
    }
    if (d.members?.length) {
      const ex = exclusions()[x.name] || [];
      blocks.push(sectionTitle(`What counts as ${lower(x.label)}`), h('p', { class: 'small muted' }, `Guessed from the names of what you've logged (${x.about}). Tap one to leave it out if it doesn't belong.`),
        h('div', { class: 'chips' }, d.members.map(m => h('button', {
          class: 'chip' + (m.excluded ? ' off' : ' on'), 'aria-pressed': m.excluded ? 'false' : 'true',
          onclick: app.guard(async () => {
            const next = m.excluded ? ex.filter(k => k !== m.name) : [...ex, m.name];
            await app.saveSetting('groupExclusions', { ...exclusions(), [x.name]: next });
            sheet.close();
            openItem(key);
          }),
        }, `${m.label} · ${m.days}d`))));
    }
    if (d.partOf.length) {
      blocks.push(sectionTitle('Counted in'), h('div', { class: 'chips' }, d.partOf.map(g =>
        h('button', { class: 'chip' + (g.excluded ? ' off' : ''), onclick: () => { sheet.close(); openItem(g.key); } }, g.label + (g.excluded ? ' (left out)' : '')))));
    }
    if (tested) blocks.push(howSure(res, x));
    blocks.push(testBlock(x, sheet));
    sheet.add(blocks);
  }

  function howSure(res, x) {
    const isProd = x.kind === 'product';
    const family = isProd ? res.items.filter(i => i.status === 'tested' && i.kind === 'product').length : res.compared;
    const q = isProd ? x.q : x.qAll;
    const slid = x.weekly
      ? `It's a weekly routine, so instead of sliding its dates (which would land on the same weekdays), its runs of days were placed at random ${x.nShifts} times.`
      : `Its dates were slid to ${x.nShifts} other places in the diary and the same search was repeated each time.`;
    const beat = Math.round(x.pEmp * (x.nShifts + 1)) - 1;
    const chance = x.pZ >= 0.5 ? 'so chance could easily explain it' : `a pattern this strong turns up by chance about 1 time in ${Math.round(1 / x.pZ)}`;
    return h('details', { class: 'sure' },
      h('summary', {}, 'How sure is this?'),
      h('ul', { class: 'steps small' },
        h('li', {}, `${plural(x.nE, 'day')} ${x.kind === 'product' ? 'in use' : 'with it'} and ${plural(x.nU, 'day')} without, counting days with a check-in.`),
        h('li', {}, `Best estimate ${signed(x.est)} points; likely between ${signed(x.lo)} and ${signed(x.hi)} (90% range). Estimates from only a few days are pulled toward zero.`),
        h('li', {}, `${slid} ${beat <= 0 ? 'None' : beat} of them lined up with bad days as well as the real dates: ${chance}.`),
        h('li', {}, isProd
          ? `Allowing for the ${plural(family, 'product')} compared: q = ${q.toFixed(2)} (possible links need under 0.30). Products can't be strong links: one switch can't rule out other changes at the same time.`
          : q <= 0.1
            ? `It still stands out after allowing for all ${family} things compared, weather, sleep and stress included (false-discovery check passed, q = ${q.toFixed(2)}).`
            : `Allowing for all ${family} things compared, it doesn't fully stand out yet (q = ${q.toFixed(2)}; strong links need under 0.10${res.checkinDays < STRONG_DAYS ? ` and ${STRONG_DAYS} days of check-ins` : ''}).`),
        h('li', {}, x.kind === 'product'
          ? 'Compared period against period: days it was in use against days it wasn\'t.'
          : 'Compared with days around the same time: a smooth trend takes out slow changes like a bad month or a new treatment.'),
        h('li', {}, `The best of 3 timings${res.auto ? ` and ${TARGETS.length} symptoms` : ''} was kept, and the chance check repeats that whole search, so picking the best doesn't fool it.`)));
  }

  function testBlock(x, sheet) {
    if (x.kind === 'product') {
      return h('div', { class: 'test-block' },
        h('p', { class: 'small muted' }, 'To test a product, switch to another (fragrance-free if you can) for 3 weeks and mark this one Stopped on the Products tab. This screen then compares the two periods.'),
        h('button', { class: 'btn wide', onclick: () => { sheet.close(); app.go('products'); } }, 'Open Products'));
    }
    const t = activeTrial();
    if (t?.key === x.key) {
      const s = statsFor(t);
      return h('div', { class: 'test-block' }, h('p', { class: 'small' }, `Testing since ${shortDate(t.start)} (day ${s.dayNum} of ${s.planned}).`),
        h('button', { class: 'btn wide', onclick: () => { sheet.close(); endTest(t, s); } }, s.complete ? 'Finish and save the result' : 'End test early'));
    }
    if (t) return h('p', { class: 'small muted test-block' }, `You're testing ${t.label} right now. Finish that first: one change at a time keeps the result clear.`);
    return h('div', { class: 'test-block' },
      h('button', { class: 'btn primary wide', onclick: () => startTest(x, sheet.close) }, icon('flask'), `Test 3 weeks without it`),
      h('p', { class: 'small muted' }, 'Avoid it completely for 3 weeks and keep checking in. The app compares the 3 weeks before with the weeks without it and warns you if it gets logged.'));
  }

  // ---------- weather & lifestyle in detail ----------

  function openEnv(e) {
    const sheet = openSheet(e.label, { full: true });
    const unit = v => `${Math.round(v)}${e.unit}`;
    const names = [e.low, 'Middle third', e.high];
    const third = (t, i) => {
      const row = avgBar(names[i], t.avg, t.n);
      row.firstChild.append(h('small', {}, `${unit(t.from)} to ${unit(t.to)}`));
      return row;
    };
    sheet.add(
      h('div', { class: 'trig-head' }, pill(e.tier)),
      h('p', { class: 'trig-headline' }, e.tier === 'unclear'
        ? `No clear pattern between ${lower(e.label)} and your symptoms so far.`
        : `${e.symptom.label} ${e.dir > 0 ? e.pos : e.neg} (${e.lag ? 'the day after' : 'on the day'}): ${r1(Math.abs(e.eff))} points between the two extremes, compared with days around the same time.`),
      sectionTitle(`${e.symptom.label}: average by ${lower(e.label)}`),
      h('div', { class: 'card' }, e.thirds.map(third)),
      e.note ? h('p', { class: 'small muted' }, e.note) : null,
      h('details', { class: 'sure' }, h('summary', {}, 'How sure is this?'), h('ul', { class: 'steps small' },
        h('li', {}, `${plural(e.n, 'day')} with both a check-in and a ${lower(e.label)} reading.`),
        h('li', {}, `The readings were slid to ${e.nShifts} other places in the diary and compared again: ${e.pZ >= 0.5 ? 'chance could easily explain this' : `a pattern this strong turns up by chance about 1 time in ${Math.round(1 / e.pZ)}`}.`),
        h('li', {}, 'Weather changes slowly, so a few weeks only hold a few really different spells. Patterns firm up over seasons.'))));
  }

  // ---------- everything, and the explanation ----------

  function openAll(res) {
    const sheet = openSheet('All results', { full: true });
    const s = res.scale;
    for (const tier of ['strong', 'possible', 'weak', 'unclear', 'fine']) {
      const list = res.items.filter(x => x.tier === tier);
      if (!list.length) continue;
      sheet.add(sectionTitle(TIERS[tier], String(list.length)), h('div', { class: 'trig-list' }, axis(s), list.map(x => {
        const row = itemRow(x, s);
        row.addEventListener('click', () => sheet.close());
        return row;
      })));
    }
    for (const tier of ['common', 'few']) {
      const list = res.items.filter(x => x.tier === tier);
      if (!list.length) continue;
      sheet.add(sectionTitle(TIERS[tier], String(list.length)), h('div', { class: 'chips trig-chips' }, list.map(x =>
        h('button', { class: 'chip', onclick: () => { sheet.close(); openItem(x.key); } }, tier === 'common' ? `${named(x)} · ${Math.round(x.share * 100)}%` : `${named(x)} · ${x.days}d`))));
    }
  }

  function openHow() {
    const sheet = openSheet('How it works', { full: true, backdropClose: true });
    const p = text => h('p', {}, text);
    sheet.add(
      p('For every food, food group, activity and product, the app compares your symptom scores on the days after it with your other days.'),
      h('h3', { class: 'section' }, 'What it allows for'),
      h('ul', { class: 'steps' },
        h('li', {}, 'Delayed reactions: it checks the same day, by the next day and within 2 days, and keeps the timing that fits best.'),
        h('li', {}, 'Where it shows: with "Any symptom", each thing is matched with the symptom or body area it lines up with best (a reaction might only show on your hands).'),
        h('li', {}, 'Slow ups and downs: each day is compared with days around the same time, so a bad month or a new cream doesn\'t make everything you ate then look guilty.'),
        h('li', {}, 'Chance: each thing\'s dates are slid along your diary to many other places (weekly routines are shuffled instead) and the whole search is repeated. A real trigger lines up with bad days better than nearly all of those copies. This respects the way flares last several days.'),
        h('li', {}, 'Small numbers: something logged on 3 days is pulled toward "no effect". One bad day after a curry isn\'t proof.'),
        h('li', {}, 'Testing lots of things: with 100 foods some will look linked by luck, so the labels take the number of things compared into account.')),
      h('h3', { class: 'section' }, 'The labels'),
      h('ul', { class: 'steps' },
        h('li', {}, h('strong', {}, 'Strong link: '), 'stands out even after allowing for everything compared (needs 4 weeks of check-ins). In tests on simulated diaries with no triggers, this almost never appeared.'),
        h('li', {}, h('strong', {}, 'Possible link: '), 'worth testing. Some will turn out to be chance.'),
        h('li', {}, h('strong', {}, 'Weak hint: '), 'unusual, but expected now and then by chance. Keep an eye on it.'),
        h('li', {}, h('strong', {}, 'No sign of a problem: '), 'logged often enough to say any effect is small.'),
        h('li', {}, h('strong', {}, 'Products '), 'can only reach "possible": one switch can\'t separate the product from anything else that changed at the same time. Switching back and forth makes it clearer.')),
      h('h3', { class: 'section' }, 'Then test it'),
      p('A pattern is a lead, not proof. The reliable way to know is to cut one thing out for 3 weeks while you keep checking in, then have it again once and watch for 3 days. Tap any item to start a test; the app compares before and after and warns you if it gets logged.'),
      p('Food groups (dairy, wheat, eggs …) are guessed from what you type. Open a group to see what was counted and leave out anything wrong.'),
      p('Meds & creams aren\'t included: they\'re used because of flares, so they would always look linked. If you suspect a cream, add it under Products with the dates you use it.'),
      h('p', { class: 'small muted' }, 'Everything is worked out on this phone. Before cutting out a whole food group for longer than a few weeks, check with your specialist or a dietitian.'));
  }

  return { view, results };
}
