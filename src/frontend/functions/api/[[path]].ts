import { buildApiTargetUrl, stripUnsafeUpstreamHeaders } from '../../src/api/apiProxy';

interface Env {
  API_ORIGIN: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  let target: string;
  try {
    target = buildApiTargetUrl(request.url, env.API_ORIGIN);
  } catch (err) {
    // Misconfiguration (e.g. a malformed/whitespace API_ORIGIN). Surface it as a
    // clear 502 + log line instead of an opaque Cloudflare 1101 "Worker threw
    // exception" page, so the cause is visible in the function logs.
    console.error('API proxy misconfiguration:', err);
    return new Response('Bad gateway: API proxy is misconfigured.', { status: 502 });
  }

  // Re-issue upstream, preserving method and body. Headers are forwarded with a filter:
  // hop-by-hop, Host, and client-supplied X-Forwarded-*/Forwarded headers are stripped
  // (the last group is anti-spoof — see stripUnsafeUpstreamHeaders), while Cookie and
  // Authorization are preserved because the .NET API — the authoritative authz boundary —
  // authenticates with them. `redirect: 'manual'` keeps the proxy transparent if the
  // upstream ever returns a redirect.
  const upstream = new Request(target, request);
  stripUnsafeUpstreamHeaders(upstream.headers);
  try {
    return await fetch(upstream, { redirect: 'manual' });
  } catch (err) {
    console.error('API proxy upstream fetch failed:', err);
    return new Response('Bad gateway: upstream request failed.', { status: 502 });
  }
};
