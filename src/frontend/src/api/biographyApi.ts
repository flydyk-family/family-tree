import type { LocalizedText, PersonDetail } from '../types/family';

// Sends the session cookie (HttpOnly, browser-owned) and no Authorization header —
// the same convention as authApi. Throwing on a non-OK response is what lets the
// editor keep the user's text and offer a retry rather than losing it.
export async function putBiography(
  personId: string,
  biography: LocalizedText,
  baseUrl = ''
): Promise<PersonDetail> {
  const response = await fetch(`${baseUrl}/api/people/${personId}/biography`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(biography)
  });
  if (!response.ok) {
    throw new Error(`Failed to save biography: ${response.status}`);
  }
  return (await response.json()) as PersonDetail;
}
