import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SignInControl from './SignInControl.vue';
import { useAuthStore } from '../stores/authStore';
import { i18n } from '../i18n';

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

  it('calls signOut when the sign-out button is clicked', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: true });
    const spy = vi.spyOn(store, 'signOut').mockResolvedValue();
    const w = mountControl();
    await w.vm.$nextTick();

    await w.get('[data-test="sign-out"]').trigger('click');

    expect(spy).toHaveBeenCalled();
  });

  it('renders nothing interactive when no client id is configured', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    const w = mountControl();
    expect(w.find('[data-test="gis-button"]').exists()).toBe(false);
    expect(w.find('[data-test="sign-out"]').exists()).toBe(false);
  });
});
