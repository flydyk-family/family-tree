import { buildApiTargetUrl } from '../../src/api/apiProxy';

interface Env {
  API_ORIGIN: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const target = buildApiTargetUrl(request.url, env.API_ORIGIN);
  // Re-issue upstream, preserving method, headers, and body. Drop the inbound
  // Host header so the Workers runtime derives it from the Cloud Run target URL
  // (avoids a 404/421 from Cloud Run's host-based routing). `redirect: 'manual'`
  // keeps the proxy transparent if the upstream ever returns a redirect.
  // NOTE: all client headers are forwarded verbatim; revisit header filtering
  // (Cookie / Authorization) when authentication is added in a later phase.
  const upstream = new Request(target, request);
  upstream.headers.delete('host');
  return fetch(upstream, { redirect: 'manual' });
};
