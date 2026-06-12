import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './args.mjs';

test('defaults when no flags', () => {
  const o = parseArgs([]);
  assert.deepEqual(o, {
    only: null, withVideo: false, image: null, prompt: null,
    force: false, size: '720x1280', seconds: '4', dryRun: false, yes: false
  });
});

test('parses every flag', () => {
  const o = parseArgs([
    '--only', 'p-0016', '--with-video', '--image', 'a.jpg',
    '--prompt', 'a man', '--force', '--size', '1024x1792', '--seconds', '8',
    '--dry-run', '--yes'
  ]);
  assert.deepEqual(o.only, ['p-0016']);
  assert.equal(o.withVideo, true);
  assert.equal(o.image, 'a.jpg');
  assert.equal(o.prompt, 'a man');
  assert.equal(o.force, true);
  assert.equal(o.size, '1024x1792');
  assert.equal(o.seconds, '8');
  assert.equal(o.dryRun, true);
  assert.equal(o.yes, true);
});

test('--only trims and drops empty ids', () => {
  assert.deepEqual(parseArgs(['--only', ' p-1 , , p-2 ']).only, ['p-1', 'p-2']);
});

test('unknown flag throws', () => {
  assert.throws(() => parseArgs(['--nope']), /Unknown argument: --nope/);
});

test('missing value throws', () => {
  assert.throws(() => parseArgs(['--size']), /Missing value for --size/);
});

test('invalid size throws', () => {
  assert.throws(() => parseArgs(['--size', '800x800']), /--size must be one of/);
});

test('invalid seconds throws', () => {
  assert.throws(() => parseArgs(['--seconds', '5']), /--seconds must be one of/);
});

test('--image requires exactly one --only id', () => {
  assert.throws(() => parseArgs(['--image', 'a.jpg']), /--image requires exactly one --only/);
  assert.throws(() => parseArgs(['--image', 'a.jpg', '--only', 'p-1,p-2']), /--image requires exactly one --only/);
  assert.doesNotThrow(() => parseArgs(['--image', 'a.jpg', '--only', 'p-1']));
});
