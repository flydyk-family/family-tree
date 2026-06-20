import { describe, it, expect, afterEach, vi } from 'vitest';
import { postSession, getMe, postLogout } from './authApi';
import type { AuthUser } from '../types/auth';

const user: AuthUser = { email: 'a@b.com', name: 'Ada', canEdit: true };

afterEach(() => { vi.restoreAllMocks(); });

describe('postSession', () => {
  it('posts the id token with credentials and returns the user', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => user });
    vi.stubGlobal('fetch', fetchMock);

    const result = await postSession('tok-123');

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ idToken: 'tok-123' })
    });
    expect(result).toEqual(user);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(postSession('bad')).rejects.toThrow('401');
  });
});

describe('getMe', () => {
  it('returns the user on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => user });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getMe();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' });
    expect(result).toEqual(user);
  });

  it('returns null on 401 (anonymous)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    expect(await getMe()).toBeNull();
  });

  it('throws on a non-401 error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(getMe()).rejects.toThrow('500');
  });
});

describe('postLogout', () => {
  it('posts logout with credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await postLogout();

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  });

  it('throws when logout fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(postLogout()).rejects.toThrow('500');
  });
});
