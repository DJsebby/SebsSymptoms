// POEM: Patient-Oriented Eczema Measure (Charman et al., 2004). A weekly, 7-question
// score from 0 to 28 that dermatologists widely recognise.

export const POEM_CREDIT = 'POEM (Patient-Oriented Eczema Measure) © The University of Nottingham.';

export const POEM_QUESTIONS = [
  'On how many days has your skin been itchy because of your eczema?',
  'On how many nights has your sleep been disturbed because of your eczema?',
  'On how many days has your skin been bleeding because of your eczema?',
  'On how many days has your skin been weeping or oozing clear fluid because of your eczema?',
  'On how many days has your skin been cracked because of your eczema?',
  'On how many days has your skin been flaking off because of your eczema?',
  'On how many days has your skin felt dry or rough because of your eczema?',
];

export const POEM_OPTIONS = ['No days', '1–2 days', '3–4 days', '5–6 days', 'Every day']; // scored 0–4

export function poemBand(score) {
  if (score <= 2) return 'Clear or almost clear';
  if (score <= 7) return 'Mild';
  if (score <= 16) return 'Moderate';
  if (score <= 24) return 'Severe';
  return 'Very severe';
}

// Maps 0–28 onto the app's 1–10 severity colours.
export const poemSev = score => Math.max(1, Math.min(10, Math.ceil(score / 2.8)));
