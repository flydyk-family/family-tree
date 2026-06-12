// Pure person -> English image prompt. Reads only family.json fields.
// These are imagined ancestors (no reference photos): the output is an
// era-appropriate portrait, not a real likeness.

export const MOTION_PROMPT =
  'Subtle living-portrait motion — gentle breathing, a soft blink, a faint head shift, ' +
  'a slow ambient light change. No camera movement. Calm, loop-friendly, minimal.';

function era(year) {
  if (year == null) return 'classic';
  if (year <= 1800) return '18th-century';
  if (year <= 1870) return 'early-to-mid 19th-century';
  if (year <= 1918) return 'late-19th-century belle-époque';
  if (year <= 1945) return 'interwar early-20th-century';
  if (year <= 1980) return 'mid-20th-century';
  return 'late-20th-century contemporary';
}

const VOCATION = {
  teacher: 'dressed as a scholarly educator, a book or papers at hand',
  church: 'in the modest attire of a devout churchgoer or clergy',
  writer: 'with the thoughtful air of a writer, pen and paper nearby',
  office: 'in the formal coat of a clerical office worker',
  other: 'in plain, dignified period dress'
};

function localized(text) {
  if (!text) return '';
  return text.en ?? text.ru ?? text.be ?? '';
}

export function buildImagePrompt(person) {
  const sex = person.sex === 'female' ? 'woman' : 'man';
  const period = era(person.birth?.year);
  const vocation = VOCATION[person.vocation] ?? VOCATION.other;
  const place = localized(person.birth?.place);
  const placeClause = place ? `, evoking ${place}` : '';
  return (
    `A dignified, photorealistic ${period} head-and-shoulders portrait of an adult ${sex} ` +
    `in mature middle age, ${vocation}${placeClause}. Warm muted tones, painterly studio ` +
    `light, the subject calmly regarding the viewer. Neutral period background.`
  );
}
