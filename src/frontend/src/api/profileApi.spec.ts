import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getProfile, putProfile, ProfileSaveError, type PersonProfile } from './profileApi';

const emptyProfile: PersonProfile = {
  givenName: null, surname: null, maidenName: null, middleName: null, sex: null, birthYear: null, birthMonth: null, birthDay: null, deathYear: null, deathMonth: null, deathDay: null, vocation: null
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('profileApi', () => {
  it('getProfile GETs the profile endpoint and returns the parsed body', async () => {
    const body: PersonProfile = { ...emptyProfile, birthYear: 1901 };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(body));
    const result = await getProfile('p-1');
    expect(fetch).toHaveBeenCalledWith('/api/people/p-1/profile', expect.objectContaining({ credentials: 'include' }));
    expect(result).toEqual(body);
  });

  it('getProfile throws on a non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false, 404));
    await expect(getProfile('p-9')).rejects.toThrow();
  });

  it('putProfile PUTs the payload as JSON and returns the updated detail', async () => {
    const detail = { id: 'p-1', birth: { year: 1902 } };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(detail));
    const payload: PersonProfile = { ...emptyProfile, birthYear: 1902 };
    const result = await putProfile('p-1', payload);
    expect(fetch).toHaveBeenCalledWith('/api/people/p-1/profile', expect.objectContaining({
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));
    expect(result).toEqual(detail);
  });

  it('putProfile throws a ProfileSaveError carrying parsed field errors on 400', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(
      { title: 'Validation failed', errors: [{ propertyName: 'Profile.BirthYear', errorMessage: 'out of range' }] },
      false, 400
    ));
    await expect(putProfile('p-1', emptyProfile)).rejects.toMatchObject({
      status: 400,
      fieldErrors: [{ propertyName: 'Profile.BirthYear', errorMessage: 'out of range' }]
    });
  });

  it('putProfile throws a ProfileSaveError with empty fieldErrors on non-400 failure', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, false, 403));
    await expect(putProfile('p-1', emptyProfile)).rejects.toBeInstanceOf(ProfileSaveError);
  });
});
