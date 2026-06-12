import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildImagePrompt, MOTION_PROMPT } from './personPrompt.mjs';

const person = (over = {}) => ({
  sex: 'male',
  birth: { year: 1900, place: { ru: 'Минск', be: null, en: 'Minsk' } },
  vocation: 'teacher',
  ...over
});

test('maps sex to man / woman', () => {
  assert.match(buildImagePrompt(person({ sex: 'male' })), /adult man/);
  assert.match(buildImagePrompt(person({ sex: 'female' })), /adult woman/);
});

test('era buckets by birth year (boundaries)', () => {
  assert.match(buildImagePrompt(person({ birth: { year: 1800 } })), /18th-century/);
  assert.match(buildImagePrompt(person({ birth: { year: 1801 } })), /early-to-mid 19th-century/);
  assert.match(buildImagePrompt(person({ birth: { year: 1870 } })), /early-to-mid 19th-century/);
  assert.match(buildImagePrompt(person({ birth: { year: 1871 } })), /belle-époque/);
  assert.match(buildImagePrompt(person({ birth: { year: 1945 } })), /interwar/);
  assert.match(buildImagePrompt(person({ birth: { year: 1980 } })), /mid-20th-century/);
  assert.match(buildImagePrompt(person({ birth: { year: 1981 } })), /contemporary/);
});

test('maps vocation to styling, unknown falls to other', () => {
  assert.match(buildImagePrompt(person({ vocation: 'church' })), /devout/);
  assert.match(buildImagePrompt(person({ vocation: 'zzz' })), /plain, dignified period dress/);
});

test('includes birthplace when present, omits when absent', () => {
  assert.match(buildImagePrompt(person()), /evoking Minsk/);
  assert.doesNotMatch(buildImagePrompt(person({ birth: { year: 1900 } })), /evoking/);
});

test('falls back to ru place when en is null', () => {
  const p = person({ birth: { year: 1900, place: { ru: 'Гродно', be: null, en: null } } });
  assert.match(buildImagePrompt(p), /evoking Гродно/);
});

test('motion prompt is a non-empty constant', () => {
  assert.equal(typeof MOTION_PROMPT, 'string');
  assert.ok(MOTION_PROMPT.length > 20);
});
