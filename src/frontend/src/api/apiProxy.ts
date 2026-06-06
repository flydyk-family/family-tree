/**
 * Builds the upstream API URL the Cloudflare Pages Function proxies to.
 * The incoming path already includes the `/api` prefix, which the .NET API
 * also serves under, so the whole path + query is forwarded verbatim.
 */
export function buildApiTargetUrl(requestUrl: string, apiOrigin: string): string {
  const incoming = new URL(requestUrl);
  const origin = apiOrigin.replace(/\/+$/, '');
  return `${origin}${incoming.pathname}${incoming.search}`;
}
