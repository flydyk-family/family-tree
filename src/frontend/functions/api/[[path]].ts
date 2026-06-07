import { buildApiTargetUrl } from '../../src/api/apiProxy';

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

  // Re-issue upstream, preserving method, headers, and body. Drop the inbound
  // Host header so the Workers runtime derives it from the Cloud Run target URL
  // (avoids a 404/421 from Cloud Run's host-based routing). `redirect: 'manual'`
  // keeps the proxy transparent if the upstream ever returns a redirect.
  // NOTE: all client headers are forwarded verbatim; revisit header filtering
  // (Cookie / Authorization) when authentication is added in a later phase.
  const upstream = new Request(target, request);
  upstream.headers.delete('host');
  try {
    return await fetch(upstream, { redirect: 'manual' });
  } catch (err) {
    console.error('API proxy upstream fetch failed:', err);
    return new Response('Bad gateway: upstream request failed.', { status: 502 });
  }
};
