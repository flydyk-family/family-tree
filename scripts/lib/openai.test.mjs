import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateStill, animateStill } from './openai.mjs';

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test('generateStill posts the right request and decodes b64_json', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ data: [{ b64_json: Buffer.from('hello').toString('base64') }] });
  };
  const bytes = await generateStill('a man', {
    size: '720x1280', apiKey: 'k', baseUrl: 'https://api.test/v1', fetch: fakeFetch
  });
  assert.equal(bytes.toString(), 'hello');
  assert.equal(calls[0].url, 'https://api.test/v1/images/generations');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer k');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'gpt-image-2');
  assert.equal(body.prompt, 'a man');
  assert.equal(body.size, '720x1280');
  assert.equal(body.output_format, 'jpeg');
});

test('generateStill throws on a non-ok response', async () => {
  const fakeFetch = async () => jsonResponse({ error: 'no' }, false, 400);
  await assert.rejects(
    () => generateStill('x', { size: '720x1280', apiKey: 'k', fetch: fakeFetch }),
    /Image generation failed \(400\)/
  );
});

test('generateStill retries on a 503 then succeeds', async () => {
  let n = 0;
  const fakeFetch = async () => {
    n += 1;
    if (n < 3) {
      return { ok: false, status: 503, text: async () => 'busy' };
    }
    return jsonResponse({ data: [{ b64_json: Buffer.from('ok').toString('base64') }] });
  };
  const bytes = await generateStill('x', {
    size: '720x1280', apiKey: 'k', fetch: fakeFetch, sleep: async () => {}
  });
  assert.equal(bytes.toString(), 'ok');
  assert.equal(n, 3);
});

test('animateStill creates, polls until completed, and downloads bytes', async () => {
  const statuses = ['queued', 'in_progress', 'completed'];
  let pollIndex = 0;
  const seen = [];
  const fakeFetch = async (url, init) => {
    seen.push({ url, method: init?.method ?? 'GET' });
    if (url.endsWith('/videos') && init?.method === 'POST') {
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.get('model'), 'sora-2');
      assert.equal(init.body.get('size'), '720x1280');
      assert.equal(init.body.get('seconds'), '4');
      assert.ok(init.body.get('input_reference'));
      return jsonResponse({ id: 'vid_1', status: 'queued' });
    }
    if (url.endsWith('/videos/vid_1/content')) {
      return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('MP4').buffer };
    }
    if (url.endsWith('/videos/vid_1')) {
      return jsonResponse({ id: 'vid_1', status: statuses[Math.min(++pollIndex, statuses.length - 1)] });
    }
    throw new Error(`unexpected url ${url}`);
  };
  const bytes = await animateStill(Buffer.from('still'), {
    size: '720x1280', seconds: '4', motionPrompt: 'move', model: 'sora-2',
    apiKey: 'k', baseUrl: 'https://api.test/v1', fetch: fakeFetch,
    sleep: async () => {}, now: () => 0
  });
  assert.equal(bytes.toString(), 'MP4');
  assert.ok(seen.some((c) => c.url.endsWith('/videos/vid_1')), 'polled status');
});

test('animateStill throws when the job fails', async () => {
  const fakeFetch = async (url, init) => {
    if (init?.method === 'POST') return jsonResponse({ id: 'v', status: 'queued' });
    return jsonResponse({ id: 'v', status: 'failed' });
  };
  await assert.rejects(
    () => animateStill(Buffer.from('s'), {
      size: '720x1280', seconds: '4', motionPrompt: 'm', apiKey: 'k',
      fetch: fakeFetch, sleep: async () => {}, now: () => 0
    }),
    /video job v failed/i
  );
});

test('animateStill times out', async () => {
  const fakeFetch = async (url, init) =>
    init?.method === 'POST'
      ? jsonResponse({ id: 'v', status: 'queued' })
      : jsonResponse({ id: 'v', status: 'in_progress' });
  let t = 0;
  await assert.rejects(
    () => animateStill(Buffer.from('s'), {
      size: '720x1280', seconds: '4', motionPrompt: 'm', apiKey: 'k',
      fetch: fakeFetch, sleep: async () => {}, now: () => (t += 10_000), timeoutMs: 5_000
    }),
    /timed out/
  );
});
