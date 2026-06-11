import { resolveMediaKey, parseRange } from '../../src/media/mediaServing';

// Minimal structural slice of the Workers R2Bucket API this function uses
// (the functions/ dir is outside the app tsconfig, so no @cloudflare/workers-types).
interface R2ObjectHead {
  size: number;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
}
interface R2ObjectBody extends R2ObjectHead {
  body: ReadableStream | null;
}
interface MediaBucket {
  head(key: string): Promise<R2ObjectHead | null>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<R2ObjectBody | null>;
}

interface Env {
  MEDIA?: MediaBucket;
}

// Filenames are immutable by convention (a changed image gets a new name),
// so far-future caching is safe.
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed.', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  if (!env.MEDIA) {
    // Missing R2 binding — a project misconfiguration, not a client error.
    // Log it clearly instead of throwing an opaque 1101 exception page.
    console.error('Media misconfiguration: the MEDIA R2 bucket binding is missing.');
    return new Response('Bad gateway: media storage is misconfigured.', { status: 502 });
  }

  const key = resolveMediaKey(new URL(request.url).pathname);
  if (!key) {
    return new Response('Bad request.', { status: 400 });
  }

  let head: R2ObjectHead | null;
  try {
    head = await env.MEDIA.head(key);
  } catch (err) {
    console.error('Media storage head request failed:', err);
    return new Response('Bad gateway: media storage request failed.', { status: 502 });
  }
  if (!head) {
    return new Response('Not found.', { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    'content-type': head.httpMetadata?.contentType ?? 'application/octet-stream',
    etag: head.httpEtag,
    'accept-ranges': 'bytes',
    'cache-control': CACHE_CONTROL
  };

  if (request.method === 'HEAD') {
    return new Response(null, { headers: { ...baseHeaders, 'content-length': String(head.size) } });
  }

  const range = parseRange(request.headers.get('range'), head.size);
  if (range === 'unsatisfiable') {
    return new Response('Range not satisfiable.', {
      status: 416,
      headers: { 'content-range': `bytes */${head.size}` }
    });
  }

  let object: R2ObjectBody | null;
  try {
    object = await env.MEDIA.get(key, range ? { range } : undefined);
  } catch (err) {
    console.error('Media storage get request failed:', err);
    return new Response('Bad gateway: media storage request failed.', { status: 502 });
  }
  if (!object?.body) {
    return new Response('Not found.', { status: 404 });
  }

  if (range) {
    const lastByte = range.offset + range.length - 1;
    return new Response(object.body, {
      status: 206,
      headers: {
        ...baseHeaders,
        'content-length': String(range.length),
        'content-range': `bytes ${range.offset}-${lastByte}/${head.size}`
      }
    });
  }
  return new Response(object.body, {
    headers: { ...baseHeaders, 'content-length': String(head.size) }
  });
};
