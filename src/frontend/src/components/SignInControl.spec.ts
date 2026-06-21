import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import SignInControl from './SignInControl.vue';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { i18n } from '../i18n';
import { loadGisScript, initGis, renderSignInButton, disableAutoSelect } from '../auth/googleIdentity';

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

  it('renders the standard Google button by default and the compact icon when compact', async () => {
    mountControl();
    await flushPromises();
    expect(renderSignInButton).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ compact: false })
    );

    vi.mocked(renderSignInButton).mockClear();
    mount(SignInControl, { props: { compact: true }, global: { plugins: [i18n] } });
    await flushPromises();
    expect(renderSignInButton).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ compact: true })
    );
  });

  it('themes the standard button per app theme (filled_black on Film, outline on Classic)', async () => {
    // Default theme is the Film (eighties) dark band → filled_black.
    mountControl();
    await flushPromises();
    expect(renderSignInButton).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ theme: 'filled_black' })
    );

    // Classic parchment → outline.
    vi.mocked(renderSignInButton).mockClear();
    useUiStore().theme = 'classic';
    mountControl();
    await flushPromises();
    expect(renderSignInButton).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ theme: 'outline' })
    );
  });

  it('passes the active locale and re-renders when it changes', async () => {
    mountControl();
    await flushPromises();
    expect(renderSignInButton).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locale: 'en' })
    );
    // The GIS script must be (re)loaded with the locale so its UI language (hl)
    // matches the app — the per-button locale alone is overridden by the Google
    // session locale.
    expect(loadGisScript).toHaveBeenCalledWith('en');

    vi.mocked(renderSignInButton).mockClear();
    i18n.global.locale.value = 'ru';
    await flushPromises();
    expect(renderSignInButton).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locale: 'ru' })
    );
    expect(loadGisScript).toHaveBeenCalledWith('ru');
  });

  it('re-renders the button when the theme switches', async () => {
    const ui = useUiStore();
    mountControl();
    await flushPromises();

    vi.mocked(renderSignInButton).mockClear();
    ui.theme = 'classic';
    await flushPromises();
    expect(renderSignInButton).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ theme: 'outline' })
    );
  });

  it('shows an initials avatar when signed in (identity hidden until opened)', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada Lovelace', canEdit: false });
    const w = mountControl();
    await w.vm.$nextTick();

    const avatar = w.find('[data-test="account-avatar"]');
    expect(avatar.exists()).toBe(true);
    expect(avatar.text()).toContain('AL');
    expect(w.find('[data-test="gis-button"]').exists()).toBe(false);
    // Identity is behind the menu, not shown until the avatar is clicked.
    expect(w.find('[data-test="sign-in-identity"]').exists()).toBe(false);
  });

  it('opens the account menu with identity and sign-out when the avatar is clicked', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: false });
    const w = mountControl();
    await w.vm.$nextTick();

    await w.get('[data-test="account-avatar"]').trigger('click');
    expect(w.find('[data-test="sign-in-identity"]').text()).toContain('Ada');
    expect(w.find('[data-test="sign-out"]').exists()).toBe(true);
    expect(w.find('[data-test="editor-badge"]').exists()).toBe(false);
  });

  it('shows the editor badge in the menu when canEdit', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: true });
    const w = mountControl();
    await w.vm.$nextTick();

    await w.get('[data-test="account-avatar"]').trigger('click');
    expect(w.find('[data-test="editor-badge"]').exists()).toBe(true);
  });

  it('calls signOut from the menu and clears GIS auto-select', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: true });
    const spy = vi.spyOn(store, 'signOut').mockResolvedValue();
    const w = mountControl();
    await w.vm.$nextTick();

    await w.get('[data-test="account-avatar"]').trigger('click');
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

  it('closes the account menu on outside pointerdown, stays open on inside pointerdown', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: false });
    const w = mount(SignInControl, { global: { plugins: [i18n] }, attachTo: document.body });
    await nextTick();
    await w.get('[data-test="account-avatar"]').trigger('click');
    expect(w.find('[data-test="account-menu"]').exists()).toBe(true);

    // A pointerdown inside the account keeps the menu open.
    w.get('[data-test="account-menu"]').element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();
    expect(w.find('[data-test="account-menu"]').exists()).toBe(true);

    // A pointerdown outside closes it.
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();
    expect(w.find('[data-test="account-menu"]').exists()).toBe(false);
    w.unmount();
  });

  it('closes the account menu on Esc', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: 'a@b.com', name: 'Ada', canEdit: false });
    const w = mountControl();
    await nextTick();
    await w.get('[data-test="account-avatar"]').trigger('click');
    expect(w.find('[data-test="account-menu"]').exists()).toBe(true);
    await w.get('.signin__account').trigger('keydown', { key: 'Escape' });
    expect(w.find('[data-test="account-menu"]').exists()).toBe(false);
  });

  it('does not throw when the GIS script fails to load (warns instead)', async () => {
    vi.mocked(loadGisScript).mockRejectedValueOnce(new Error('load failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mountControl(); // signed out + configured → onMounted runs renderButton
    await flushPromises();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back to "?" initials when there is no name or email', async () => {
    const store = useAuthStore();
    store.$patch({ signedIn: true, email: '', name: '', canEdit: false });
    const w = mountControl();
    await nextTick();
    expect(w.get('[data-test="account-avatar"]').text()).toBe('?');
  });
});
