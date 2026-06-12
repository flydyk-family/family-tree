import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planActions, estimateCost } from './plan.mjs';

const opts = (over = {}) => ({
  withVideo: false, image: null, force: false, ...over
});

test('still: provided when --image given', () => {
  assert.equal(planActions(opts({ image: 'a.jpg' }), { stillExists: true, videoExists: false }).still, 'provided');
});

test('still: reuse when it exists and not forced, generate otherwise', () => {
  assert.equal(planActions(opts(), { stillExists: true, videoExists: false }).still, 'reuse');
  assert.equal(planActions(opts(), { stillExists: false, videoExists: false }).still, 'generate');
  assert.equal(planActions(opts({ force: true }), { stillExists: true, videoExists: false }).still, 'generate');
});

test('video: none without --with-video', () => {
  assert.equal(planActions(opts(), { stillExists: false, videoExists: false }).video, 'none');
});

test('video: skip when it exists and not forced, generate otherwise', () => {
  assert.equal(planActions(opts({ withVideo: true }), { stillExists: true, videoExists: true }).video, 'skip');
  assert.equal(planActions(opts({ withVideo: true }), { stillExists: true, videoExists: false }).video, 'generate');
  assert.equal(planActions(opts({ withVideo: true, force: true }), { stillExists: true, videoExists: true }).video, 'generate');
});

test('estimateCost sums stills and videos at the size tier', () => {
  const plan = [
    { still: 'generate', video: 'generate' },
    { still: 'generate', video: 'generate' },
    { still: 'reuse', video: 'skip' }
  ];
  // 2 stills * 0.04 + 2 videos * 4s * 0.10 = 0.08 + 0.80 = 0.88
  assert.ok(Math.abs(estimateCost(plan, { seconds: '4', size: '720x1280' }) - 0.88) < 1e-9);
  // pro size: 2 * 4 * 0.30 = 2.40 + 0.08 = 2.48
  assert.ok(Math.abs(estimateCost(plan, { seconds: '4', size: '1024x1792' }) - 2.48) < 1e-9);
});
