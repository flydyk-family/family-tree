import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import SettingsPanel from './SettingsPanel.vue';
import { i18n } from '../i18n';
import { useLocaleStore } from '../stores/localeStore';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  i18n.global.locale.value = 'en';
});

function mountPanel() {
  return mount(SettingsPanel, { global: { plugins: [i18n] } });
}

describe('SettingsPanel', () => {
  it('renders the three preference groups', () => {
    const w = mountPanel();
    expect(w.find('[data-test="settings-panel"]').exists()).toBe(true);
    expect(w.findComponent({ name: 'ThemeToggle' }).exists()).toBe(true);
    expect(w.findComponent({ name: 'OrientationToggle' }).exists()).toBe(true);
  });

  it('lists the three locales inline (no nested dropdown)', () => {
    const w = mountPanel();
    expect(w.findAll('[data-test="settings-language-option"]')).toHaveLength(3);
  });

  it('selecting a locale updates the store', async () => {
    const w = mountPanel();
    const store = useLocaleStore();
    // Options render in order en, ru, be → index 2 is Belarusian.
    await w.findAll('[data-test="settings-language-option"]')[2].trigger('click');
    expect(store.currentLocale).toBe('be');
  });

  it('marks the active locale as pressed', async () => {
    const w = mountPanel();
    const store = useLocaleStore();
    store.setLocale('ru');
    await w.vm.$nextTick();
    // Order en, ru, be → index 1 is Russian.
    const ruBtn = w.findAll('[data-test="settings-language-option"]')[1];
    expect(ruBtn.attributes('aria-pressed')).toBe('true');
  });
});
