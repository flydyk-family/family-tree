import type { LocalizedText, PersonDetail } from '../types/family';

/** Wire shape of PersonProfileDto: the editable scalar override, each field nullable
 *  (null = inherit the family.json seed). */
export interface PersonProfile {
  givenName: LocalizedText | null;
  surname: LocalizedText | null;
  maidenName: LocalizedText | null;
  sex: string | null;
  birthYear: number | null;
  deathYear: number | null;
  vocation: string | null;
}

export interface ProfileFieldError {
  propertyName: string;
  errorMessage: string;
}

/** Thrown by putProfile on a non-OK response. On a 400 it carries the handler's
 *  per-field validation messages so the editor can show them inline. */
export class ProfileSaveError extends Error {
  constructor(readonly status: number, readonly fieldErrors: ProfileFieldError[]) {
    super(`Failed to save profile: ${status}`);
    this.name = 'ProfileSaveError';
  }
}

export async function getProfile(personId: string, baseUrl = ''): Promise<PersonProfile> {
  const response = await fetch(`${baseUrl}/api/people/${personId}/profile`, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Failed to load profile: ${response.status}`);
  }
  return (await response.json()) as PersonProfile;
}

export async function putProfile(personId: string, profile: PersonProfile, baseUrl = ''): Promise<PersonDetail> {
  const response = await fetch(`${baseUrl}/api/people/${personId}/profile`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile)
  });
  if (!response.ok) {
    let fieldErrors: ProfileFieldError[] = [];
    if (response.status === 400) {
      try {
        const body = await response.json();
        if (Array.isArray(body?.errors)) {
          fieldErrors = body.errors as ProfileFieldError[];
        }
      } catch {
        // body not JSON — leave fieldErrors empty
      }
    }
    throw new ProfileSaveError(response.status, fieldErrors);
  }
  return (await response.json()) as PersonDetail;
}
