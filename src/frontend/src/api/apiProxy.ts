/**
 * Builds the upstream API URL the Cloudflare Pages Function proxies to.
 * The incoming path already includes the `/api` prefix, which the .NET API
 * also serves under, so the whole path + query is forwarded verbatim.
 */
export function buildApiTargetUrl(requestUrl: string, apiOrigin: string): string {
  const incoming = new URL(requestUrl);
  // Trim stray whitespace (e.g. a trailing space accidentally saved into the
  // API_ORIGIN env var) *before* stripping trailing slashes — otherwise the
  // concatenated URL contains a space and is rejected as an invalid URL.
  const origin = (apiOrigin ?? '').trim().replace(/\/+$/, '');
  if (!origin) {
    throw new Error('API_ORIGIN is empty or unset.');
  }
  return `${origin}${incoming.pathname}${incoming.search}`;
}

// Headers the proxy must NOT forward verbatim to the API. Cookie and Authorization are
// deliberately absent — the API authenticates with them, so they are preserved.
const UNSAFE_UPSTREAM_HEADERS = [
  // Hop-by-hop headers (RFC 7230 §6.1) — a proxy terminates and must not relay these.
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  // Let the runtime derive Host from the target URL (Cloud Run does host-based routing).
  'host',
  // Client-supplied forwarding headers: drop them so a caller hitting this proxy directly
  // can't spoof the client IP/scheme the API trusts (e.g. for rate-limit partitioning).
  // Cloudflare re-adds the authoritative values on the outbound fetch.
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'forwarded',
];

/**
 * Removes hop-by-hop, Host, and client-supplied forwarding headers from an outbound
 * upstream request, in place. Everything else (Cookie, Authorization, Content-Type, …)
 * is preserved so the .NET API — the authoritative authz boundary — still authenticates.
 */
export function stripUnsafeUpstreamHeaders(headers: Headers): void {
  for (const name of UNSAFE_UPSTREAM_HEADERS) {
    headers.delete(name);
  }
}
