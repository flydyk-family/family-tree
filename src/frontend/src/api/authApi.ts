import type { AuthUser } from '../types/auth';

// All auth calls send the session cookie and never an Authorization header; the
// session is an HttpOnly cookie the browser owns. This helper is the single place
// `credentials: 'include'` is set, so a future auth call can't accidentally omit it.
function authFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { credentials: 'include', ...init });
}

export async function postSession(idToken: string, baseUrl = ''): Promise<AuthUser> {
  const response = await authFetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!response.ok) {
    throw new Error(`Sign-in failed: ${response.status}`);
  }
  return (await response.json()) as AuthUser;
}

export async function getMe(baseUrl = ''): Promise<AuthUser | null> {
  const response = await authFetch(`${baseUrl}/api/auth/me`);
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load session: ${response.status}`);
  }
  return (await response.json()) as AuthUser;
}

export async function postLogout(baseUrl = ''): Promise<void> {
  const response = await authFetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Sign-out failed: ${response.status}`);
  }
}
