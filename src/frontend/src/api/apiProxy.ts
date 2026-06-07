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
