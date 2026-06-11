// OpenAI REST calls. fetch/sleep/now are injectable so this unit-tests without
// the network. Both functions return Buffers; the caller writes the files.
const DEFAULT_BASE = 'https://api.openai.com/v1';
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// Retries a request on transient HTTP statuses and on network throws, with
// exponential backoff. Returns the final Response (the caller checks res.ok).
async function requestWithRetry(fetch, url, init, { retries = 3, sleep = defaultSleep }) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (RETRYABLE.has(res.status) && attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) {
        throw err;
      }
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export async function generateStill(prompt, {
  size, apiKey, baseUrl = DEFAULT_BASE, fetch = globalThis.fetch, model = 'gpt-image-2',
  retries = 3, sleep = defaultSleep
}) {
  const res = await requestWithRetry(fetch, `${baseUrl}/images/generations`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt, size, quality: 'high', output_format: 'jpeg', n: 1 })
  }, { retries, sleep });
  if (!res.ok) {
    throw new Error(`Image generation failed (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('Image response missing b64_json');
  }
  return Buffer.from(b64, 'base64');
}

export async function animateStill(imageBytes, {
  size, seconds, motionPrompt, apiKey, baseUrl = DEFAULT_BASE,
  fetch = globalThis.fetch, model = 'sora-2',
  pollIntervalMs = 5000, timeoutMs = 600_000, retries = 3,
  sleep = defaultSleep, now = () => Date.now()
}) {
  const auth = { authorization: `Bearer ${apiKey}` };
  const form = new FormData();
  form.set('model', model);
  form.set('prompt', motionPrompt);
  form.set('size', size);
  form.set('seconds', String(seconds));
  form.set('input_reference', new Blob([imageBytes], { type: 'image/jpeg' }), 'still.jpg');

  let res = await requestWithRetry(fetch, `${baseUrl}/videos`, {
    method: 'POST', headers: auth, body: form
  }, { retries, sleep });
  if (!res.ok) {
    throw new Error(`Video create failed (${res.status}): ${await res.text()}`);
  }
  let job = await res.json();

  const deadline = now() + timeoutMs;
  while (job.status === 'queued' || job.status === 'in_progress') {
    if (now() > deadline) {
      throw new Error(`Video job ${job.id} timed out`);
    }
    await sleep(pollIntervalMs);
    res = await requestWithRetry(fetch, `${baseUrl}/videos/${job.id}`, { headers: auth }, { retries, sleep });
    if (!res.ok) {
      throw new Error(`Video poll failed (${res.status}): ${await res.text()}`);
    }
    job = await res.json();
  }
  if (job.status !== 'completed') {
    throw new Error(`Video job ${job.id} ${job.status}`);
  }

  res = await requestWithRetry(fetch, `${baseUrl}/videos/${job.id}/content`, { headers: auth }, { retries, sleep });
  if (!res.ok) {
    throw new Error(`Video download failed (${res.status}): ${await res.text()}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
