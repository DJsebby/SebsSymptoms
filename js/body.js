// Tappable body map. The figure faces you, so the person's RIGHT side is on the
// screen's LEFT (the way a doctor looks at you). Arms are palms-forward so the
// inner elbows are visible.

export const REGIONS = [
  { id: 'face', label: 'Face', short: 'Face' },
  { id: 'neck', label: 'Neck', short: 'Neck' },
  { id: 'arm_r', label: 'Right arm', short: 'R arm' },
  { id: 'arm_l', label: 'Left arm', short: 'L arm' },
  { id: 'elbow_r', label: 'Right inner elbow', short: 'R elbow' },
  { id: 'elbow_l', label: 'Left inner elbow', short: 'L elbow' },
  { id: 'hand_r', label: 'Right hand & wrist', short: 'R hand' },
  { id: 'hand_l', label: 'Left hand & wrist', short: 'L hand' },
  { id: 'torso', label: 'Chest & stomach', short: 'Torso' },
  { id: 'legs', label: 'Legs', short: 'Legs' },
];

// Symptoms that aren't tied to one spot.
export const GENERAL = [
  { id: 'itch', label: 'Itch' },
  { id: 'dry', label: 'Dry skin' },
  { id: 'swelling', label: 'Swelling' },
  { id: 'sinus', label: 'Sinus' },
];

// Possible flare factors scored in the check-in. Higher = worse, like the symptoms.
export const FACTORS = [
  { id: 'sleep', label: 'Bad sleep', short: 'Bad sleep', hint: '1 = slept well · 10 = barely slept' },
  { id: 'stress', label: 'Stress', short: 'Stress', hint: '1 = calm · 10 = extremely stressed' },
];

const ALL = [...REGIONS, ...GENERAL, ...FACTORS];
export const labelFor = id => (ALL.find(r => r.id === id) || { label: id }).label;
export const shortLabel = id => { const r = ALL.find(x => x.id === id); return r ? (r.short || r.label) : id; };

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const W = 240;
const TORSO = 'M90 98H150Q166 98 166 114L158 214Q157 226 145 226H95Q83 226 82 214L74 114Q74 98 90 98Z';

// Coordinates for the screen-left arm (person's right); the other arm is mirrored.
function armGeometry(side) {
  const x = side === 'r' ? v => v : v => W - v;
  return {
    upper: [x(61), 118, x(55), 166],
    fore: [x(48.5), 216, x(43), 249],
    elbow: [x(51), 192],
    hand: [x(41), 280],
  };
}

const LABEL_AT = {
  face: [120, 51], neck: [120, 92], torso: [120, 166], legs: [102, 304],
  arm_r: [58, 146], arm_l: [182, 146], elbow_r: [51, 196], elbow_l: [189, 196],
  hand_r: [41, 284], hand_l: [199, 284],
};

export function bodyMap(scores, onTap) {
  const svg = s('svg', { viewBox: '0 0 240 370', class: 'bodymap', role: 'img', 'aria-label': 'Body map: tap an area to score it' });
  const regionEls = [];
  const add = (id, el) => { el.classList.add('region'); el.dataset.region = id; svg.append(el); regionEls.push(el); };
  const limb = (id, [x1, y1, x2, y2], width) => add(id, s('line', { x1, y1, x2, y2, 'stroke-width': width }));

  add('torso', s('path', { d: TORSO }));
  limb('legs', [104, 242, 101, 352], 26);
  limb('legs', [136, 242, 139, 352], 26);
  add('face', s('ellipse', { cx: 120, cy: 46, rx: 26, ry: 30 }));
  add('neck', s('rect', { x: 106, y: 79, width: 28, height: 17, rx: 6 }));
  for (const side of ['r', 'l']) {
    const a = armGeometry(side);
    limb('arm_' + side, a.upper, 20);
    limb('arm_' + side, a.fore, 18);
    add('elbow_' + side, s('circle', { cx: a.elbow[0], cy: a.elbow[1], r: 12 }));
    add('hand_' + side, s('ellipse', { cx: a.hand[0], cy: a.hand[1], rx: 11, ry: 17 }));
  }

  // Invisible, larger touch targets for the small areas (drawn on top).
  const hit = (id, el) => { el.classList.add('hit'); el.dataset.region = id; svg.append(el); };
  hit('neck', s('rect', { x: 94, y: 77, width: 52, height: 21 }));
  for (const side of ['r', 'l']) {
    const a = armGeometry(side);
    hit('elbow_' + side, s('circle', { cx: a.elbow[0], cy: a.elbow[1], r: 17 }));
  }

  const labels = {};
  for (const [id, [x, y]] of Object.entries(LABEL_AT)) {
    labels[id] = s('text', { x, y, 'text-anchor': 'middle', class: 'score-label' });
    svg.append(labels[id]);
  }

  svg.addEventListener('click', e => {
    const t = e.target.closest('[data-region]');
    if (t) onTap(t.dataset.region);
  });

  function update(sc) {
    for (const el of regionEls) el.dataset.score = sc[el.dataset.region] || 0;
    for (const [id, t] of Object.entries(labels)) {
      const v = sc[id] || 0;
      t.textContent = v ? String(v) : '';
      t.dataset.score = v;
    }
  }
  update(scores);
  return { el: svg, update };
}
