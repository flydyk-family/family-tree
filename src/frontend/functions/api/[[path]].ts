import { buildApiTargetUrl } from '../../src/api/apiProxy';

interface Env {
  API_ORIGIN: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const target = buildApiTargetUrl(request.url, env.API_ORIGIN);
  // Re-issue upstream, preserving method, headers, and body.
  return fetch(new Request(target, request));
};
