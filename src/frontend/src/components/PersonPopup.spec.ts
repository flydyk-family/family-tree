import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import PersonPopup from './PersonPopup.vue';
import { useSelectionStore } from '../stores/selectionStore';
import { useLocaleStore } from '../stores/localeStore';
import type { PersonDetail } from '../types/family';

const tadeusz: PersonDetail = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: 'Тадэвуш', en: 'Tadeusz' },
  surname: { ru: 'Ковальский', be: 'Кавальскі', en: 'Kowalski' },
  maidenName: null,
  sex: 'male',
  birth: { year: 1962, month: 4, day: null, approx: false, place: { ru: 'Варшава', be: 'Варшава', en: 'Warsaw' } },
  death: null,
  vocation: 'teacher',
  summary: { ru: 'Учитель истории.', be: null, en: 'A history teacher.' },
  biography: { ru: 'Длинная биография.', be: null, en: 'A longer biography.' },
  portrait: null,
  gallery: [],
  links: [{ type: 'facebook', url: 'https://facebook.com/example' }],
  residences: [{ place: { ru: 'Варшава', be: null, en: 'Warsaw' }, fromYear: 1962, toYear: null, mapUrl: 'https://maps.google.com/?q=Warszawa' }],
  parents: { motherId: 'p-0014', fatherId: 'p-0013' },
  marriedIntoFamily: false,
  isDefaultRoot: true
};

function mountWith(detail: PersonDetail) {
  const store = useSelectionStore();
  store.$patch({ selectedId: detail.id, detail, mode: 'normal', loading: false, error: null });
  return mount(PersonPopup, { global: { plugins: [i18n] } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
});

describe('PersonPopup (normal)', () => {
  it('renders the dialog with name, lifespan, and summary', () => {
    const wrapper = mountWith(tadeusz);

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Tadeusz');
    expect(wrapper.text()).toContain('Kowalski');
    expect(wrapper.text()).toContain('1962–');
    expect(wrapper.text()).toContain('A history teacher.');
  });

  it('renders the localized vocation label', () => {
    const wrapper = mountWith(tadeusz);
    expect(wrapper.text()).toContain('Teacher');
  });

  it('shows initials when there is no portrait', () => {
    const wrapper = mountWith(tadeusz);
    expect(wrapper.find('[data-test="portrait-fallback"]').text()).toBe('T');
  });

  it('expands when the More control is clicked', async () => {
    const wrapper = mountWith(tadeusz);
    const store = useSelectionStore();

    await wrapper.find('[data-test="expand"]').trigger('click');

    expect(store.mode).toBe('expanded');
  });

  it('emits close when the close control is clicked', async () => {
    const wrapper = mountWith(tadeusz);

    await wrapper.find('[data-test="close"]').trigger('click');

    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('emits close on Escape', async () => {
    const wrapper = mountWith(tadeusz);

    await wrapper.find('[data-test="dialog"]').trigger('keydown.esc');

    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('re-localizes the name when the active locale changes', async () => {
    const wrapper = mountWith(tadeusz);
    expect(wrapper.text()).toContain('Tadeusz');

    useLocaleStore().setLocale('ru');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Тадеуш');
  });

  it('shows the vocation motif next to the label', () => {
    const wrapper = mountWith(tadeusz);
    const icon = wrapper.find('[data-test="vocation-icon"]');

    expect(icon.exists()).toBe(true);
    expect(icon.attributes('data-vocation')).toBe('teacher');
  });
});

describe('PersonPopup (expanded)', () => {
  it('hides biography, residences, and links in normal mode', () => {
    const wrapper = mountWith(tadeusz);
    expect(wrapper.find('[data-test="biography"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="residences"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="links"]').exists()).toBe(false);
  });

  it('shows biography, residences with map links, and social links when expanded', async () => {
    const wrapper = mountWith(tadeusz);
    useSelectionStore().expand();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="biography"]').text()).toContain('A longer biography.');

    const residences = wrapper.find('[data-test="residences"]');
    expect(residences.text()).toContain('Warsaw');
    const mapLink = residences.find('a');
    expect(mapLink.attributes('href')).toBe('https://maps.google.com/?q=Warszawa');
    expect(mapLink.attributes('target')).toBe('_blank');

    const links = wrapper.find('[data-test="links"]');
    const social = links.find('a');
    expect(social.attributes('href')).toBe('https://facebook.com/example');
    expect(social.text()).toContain('Facebook');
  });

  it('localizes the residence place name with the active locale', async () => {
    const wrapper = mountWith(tadeusz);
    useLocaleStore().setLocale('ru');
    useSelectionStore().expand();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="residences"]').text()).toContain('Варшава');
  });
});
