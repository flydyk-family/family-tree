import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from './authStore';
import * as authApi from '../api/authApi';

beforeEach(() => { setActivePinia(createPinia()); });
afterEach(() => { vi.restoreAllMocks(); });

describe('authStore', () => {
  it('starts signed out', () => {
    const store = useAuthStore();
    expect(store.signedIn).toBe(false);
    expect(store.canEdit).toBe(false);
  });

  it('signIn posts the token and stores the identity', async () => {
    vi.spyOn(authApi, 'postSession').mockResolvedValue({ email: 'a@b.com', name: 'Ada', canEdit: true });
    const store = useAuthStore();

    await store.signIn('tok');

    expect(authApi.postSession).toHaveBeenCalledWith('tok');
    expect(store.signedIn).toBe(true);
    expect(store.email).toBe('a@b.com');
    expect(store.name).toBe('Ada');
    expect(store.canEdit).toBe(true);
  });

  it('signIn records an error and stays signed out when the request fails', async () => {
    vi.spyOn(authApi, 'postSession').mockRejectedValue(new Error('Sign-in failed: 401'));
    const store = useAuthStore();

    // Must resolve, not reject — GIS calls signIn fire-and-forget.
    await expect(store.signIn('bad')).resolves.toBeUndefined();
    expect(store.signedIn).toBe(false);
    expect(store.error).toBe('Sign-in failed: 401');
  });

  it('signIn clears a prior error on success', async () => {
    vi.spyOn(authApi, 'postSession')
      .mockRejectedValueOnce(new Error('Sign-in failed: 500'))
      .mockResolvedValueOnce({ email: 'a@b.com', name: 'Ada', canEdit: true });
    const store = useAuthStore();

    await store.signIn('bad');
    expect(store.error).toBe('Sign-in failed: 500');

    await store.signIn('good');
    expect(store.error).toBeNull();
    expect(store.signedIn).toBe(true);
  });

  it('fetchMe populates state when a session exists', async () => {
    vi.spyOn(authApi, 'getMe').mockResolvedValue({ email: 'c@d.com', name: 'Cy', canEdit: false });
    const store = useAuthStore();

    await store.fetchMe();

    expect(store.signedIn).toBe(true);
    expect(store.name).toBe('Cy');
    expect(store.canEdit).toBe(false);
  });

  it('fetchMe leaves the store signed out when there is no session', async () => {
    vi.spyOn(authApi, 'getMe').mockResolvedValue(null);
    const store = useAuthStore();

    await store.fetchMe();

    expect(store.signedIn).toBe(false);
  });

  it('fetchMe swallows errors and stays signed out', async () => {
    vi.spyOn(authApi, 'getMe').mockRejectedValue(new Error('network'));
    const store = useAuthStore();

    await expect(store.fetchMe()).resolves.toBeUndefined();
    expect(store.signedIn).toBe(false);
  });

  it('signOut clears state and calls the api', async () => {
    vi.spyOn(authApi, 'postSession').mockResolvedValue({ email: 'a@b.com', name: 'Ada', canEdit: true });
    vi.spyOn(authApi, 'postLogout').mockResolvedValue();
    const store = useAuthStore();
    await store.signIn('tok');

    await store.signOut();

    expect(authApi.postLogout).toHaveBeenCalled();
    expect(store.signedIn).toBe(false);
    expect(store.email).toBe('');
    expect(store.name).toBe('');
    expect(store.canEdit).toBe(false);
  });

  it('signOut clears local state even when the logout request fails', async () => {
    vi.spyOn(authApi, 'postSession').mockResolvedValue({ email: 'a@b.com', name: 'Ada', canEdit: true });
    vi.spyOn(authApi, 'postLogout').mockRejectedValue(new Error('Sign-out failed: 500'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = useAuthStore();
    await store.signIn('tok');

    await expect(store.signOut()).resolves.toBeUndefined();
    expect(store.signedIn).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });
});
