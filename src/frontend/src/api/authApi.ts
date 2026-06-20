import type { AuthUser } from '../types/auth';

// All auth calls send the session cookie (`credentials: 'include'`) and never an
// Authorization header; the session is an HttpOnly cookie the browser owns.

export async function postSession(idToken: string, baseUrl = ''): Promise<AuthUser> {
  const response = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ idToken })
  });
  if (!response.ok) {
    throw new Error(`Sign-in failed: ${response.status}`);
  }
  return (await response.json()) as AuthUser;
}

export async function getMe(baseUrl = ''): Promise<AuthUser | null> {
  const response = await fetch(`${baseUrl}/api/auth/me`, { credentials: 'include' });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to load session: ${response.status}`);
  }
  return (await response.json()) as AuthUser;
}

export async function postLogout(baseUrl = ''): Promise<void> {
  const response = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error(`Sign-out failed: ${response.status}`);
  }
}
