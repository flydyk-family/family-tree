import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import SignInControl from './SignInControl.vue';
import { useAuthStore } from '../stores/authStore';
import { i18n } from '../i18n';
import { initGis, renderSignInButton, disableAutoSelect } from '../auth/googleIdentity';

// The GIS wrapper touches window.google + injects a script — mock it entirely.
vi.mock('../auth/googleIdentity', () => ({
  loadGisScript: vi.fn().mockResolvedValue(undefined),
  initGis: vi.fn(),
  renderSignInButton: vi.fn(),
  disableAutoSelect: vi.fn()
}));

function mountControl() {
  return mount(SignInControl, { global: { plugins: [i18n] } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
  i18n.global.locale.value = 'en';
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('SignInControl', () => {
  it('shows the GIS button mount point when signed out', () => {
    const w = mountControl();
    expect(w.find('[data-test="gis-button"]').exists()).toBe(true);
    expect(w.find('[data-test="sign-in-identity"]').exists()).toBe(false);
  });

  it('shows the identity and a sign-out button when signed in', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: false });
    const w = mountControl();
    await w.vm.$nextTick();

    expect(w.find('[data-test="sign-in-identity"]').text()).toContain('Ada');
    expect(w.find('[data-test="sign-out"]').exists()).toBe(true);
    expect(w.find('[data-test="gis-button"]').exists()).toBe(false);
    expect(w.find('[data-test="editor-badge"]').exists()).toBe(false);
  });

  it('shows the editor badge when canEdit', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: true });
    const w = mountControl();
    await w.vm.$nextTick();

    expect(w.find('[data-test="editor-badge"]').exists()).toBe(true);
  });

  it('calls signOut when the sign-out button is clicked and clears GIS auto-select', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: true });
    const spy = vi.spyOn(store, 'signOut').mockResolvedValue();
    const w = mountControl();
    await w.vm.$nextTick();

    await w.get('[data-test="sign-out"]').trigger('click');
    await flushPromises();

    expect(spy).toHaveBeenCalled();
    expect(disableAutoSelect).toHaveBeenCalled();
  });

  it('re-renders the GIS button after sign-out (flush:post regression)', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: false });
    mountControl();
    await nextTick();

    // Clear any calls from the initial mount (there should be none — signed in)
    vi.mocked(renderSignInButton).mockClear();

    // Simulate sign-out — the v-else GIS button div re-enters the DOM after the patch
    store.$patch({ signedIn: false, email: '', name: '', canEdit: false });

    // Wait for DOM patch (nextTick) then for async renderButton to resolve (flushPromises)
    await nextTick();
    await flushPromises();

    expect(renderSignInButton).toHaveBeenCalled();
  });

  it('signs in through the GIS credential callback', async () => {
    const store = useAuthStore();
    const signInSpy = vi.spyOn(store, 'signIn').mockResolvedValue();
    mountControl();
    await flushPromises(); // onMounted → renderButton → loadGisScript → initGis

    // GIS invokes the callback registered via initGis with the ID token.
    const callback = vi.mocked(initGis).mock.calls[0][1];
    await callback({ credential: 'id-token-xyz' });

    expect(signInSpy).toHaveBeenCalledWith('id-token-xyz');
  });

  it('shows a localized error message when sign-in failed', async () => {
    const store = useAuthStore();
    store.$patch({ error: 'Sign-in failed: 401' });
    const w = mountControl();
    await nextTick();

    const err = w.find('[data-test="sign-in-error"]');
    expect(err.exists()).toBe(true);
    expect(err.text()).toBe('Sign-in failed. Please try again.');
  });

  it('renders nothing interactive when no client id is configured', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    const w = mountControl();
    expect(w.find('[data-test="gis-button"]').exists()).toBe(false);
    expect(w.find('[data-test="sign-out"]').exists()).toBe(false);
  });
});
