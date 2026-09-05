import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { i18n } from '../i18n';
import PersonHeader from './PersonHeader.vue';
import { useLocaleStore } from '../stores/localeStore';
import { useFamilyStore } from '../stores/familyStore';
import type { PersonDetail, PersonSummary } from '../types/family';

const tadeusz: PersonDetail = {
  id: 'p-0016',
  givenName: { ru: 'Тадеуш', be: 'Тадэвуш', en: 'Tadeusz' },
  surname: { ru: 'Ковальский', be: 'Кавальскі', en: 'Kowalski' },
  maidenName: null, middleName: null, sex: 'male',
  birth: { year: 1962, month: 4, day: null, approx: false, place: { ru: 'Варшава', be: 'Варшава', en: 'Warsaw' } },
  death: null, vocation: 'teacher',
  summary: { ru: 'Учитель истории.', be: null, en: 'A history teacher.' },
  biography: { ru: 'Длинная биография.', be: null, en: 'A longer biography.' },
  portrait: null, portraitVideo: null, gallery: [],
  links: [], residences: [],
  parents: { motherId: 'p-0014', fatherId: 'p-0013' },
  marriedIntoFamily: false, isDefaultRoot: true
};

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/members/:slug?', name: 'members', component: { template: '<div />' } },
      { path: '/person/:slug', name: 'person', component: { template: '<div />' } }
    ]
  });
}

function summary(overrides: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id: 'p-0016', givenName: tadeusz.givenName, surname: tadeusz.surname,
    maidenName: null, middleName: null, sex: 'male', birthYear: 1962, deathYear: null, vocation: 'teacher',
    portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: true,
    ...overrides
  };
}

function mountWith(detail: PersonDetail, router: Router = makeRouter()) {
  return mount(PersonHeader, {
    props: { detail },
    attachTo: document.body,
    global: { plugins: [router, i18n], stubs: { teleport: true } }
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
});

describe('PersonHeader', () => {
  it('renders name, lifespan and vocation', () => {
    const w = mountWith(tadeusz);
    expect(w.text()).toContain('Tadeusz');
    expect(w.text()).toContain('1962–');
    expect(w.text()).toContain('Teacher');
  });

  it('shows the initial when there is no portrait', () => {
    const w = mountWith(tadeusz);
    expect(w.find('[data-test="portrait-fallback"]').text()).toBe('T');
  });

  it('renders the vocation motif with its data attribute', () => {
    const w = mountWith(tadeusz);
    expect(w.find('[data-test="vocation-icon"]').attributes('data-vocation')).toBe('teacher');
  });

  it('hides the vocation row when there is no vocation', () => {
    const w = mountWith({ ...tadeusz, vocation: '' });
    expect(w.find('.header__vocation').exists()).toBe(false);
  });

  it('re-localizes the name when the active locale changes', async () => {
    const w = mountWith(tadeusz);
    expect(w.text()).toContain('Tadeusz');
    useLocaleStore().setLocale('ru');
    await w.vm.$nextTick();
    expect(w.text()).toContain('Тадеуш');
  });

  it('plays the living portrait with the still as poster when both exist', () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg', portraitVideo: 'p-0016.mp4' });
    const video = w.find('[data-test="portrait-video"]');
    expect(video.attributes('src')).toBe('/media/portraits/p-0016.mp4');
    expect(video.attributes('poster')).toBe('/media/portraits/p-0016.jpg');
    expect(w.find('[data-test="portrait-image"]').exists()).toBe(false);
  });

  it('shows the still image when only a portrait exists', () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg' });
    expect(w.find('[data-test="portrait-image"]').attributes('src')).toBe('/media/portraits/p-0016.jpg');
    expect(w.find('[data-test="portrait-video"]').exists()).toBe(false);
  });

  it('falls back from a failing video to the still image', async () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg', portraitVideo: 'p-0016.mp4' });
    await w.find('[data-test="portrait-video"]').trigger('error');
    expect(w.find('[data-test="portrait-video"]').exists()).toBe(false);
    expect(w.find('[data-test="portrait-image"]').exists()).toBe(true);
  });

  it('falls back from a failing image to the initials', async () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg' });
    await w.find('[data-test="portrait-image"]').trigger('error');
    expect(w.find('[data-test="portrait-image"]').exists()).toBe(false);
    expect(w.find('[data-test="portrait-fallback"]').text()).toBe('T');
  });

  it('opens the lightbox with the clip first and closes it returning focus', async () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg', portraitVideo: 'p-0016.mp4' });
    await w.find('[data-test="portrait-trigger"]').trigger('click');
    const box = w.findComponent({ name: 'MediaLightbox' });
    expect(box.exists()).toBe(true);
    expect(box.props('items')).toEqual([
      { kind: 'video', src: '/media/portraits/p-0016.mp4', poster: '/media/portraits/p-0016.jpg' },
      { kind: 'image', src: '/media/portraits/p-0016.jpg' }
    ]);
    await box.vm.$emit('close');
    await w.vm.$nextTick();
    expect(w.findComponent({ name: 'MediaLightbox' }).exists()).toBe(false);
    expect(document.activeElement).toBe(w.find('[data-test="portrait-trigger"]').element);
    w.unmount();
  });

  it('closes the lightbox when a different person is shown', async () => {
    const w = mountWith({ ...tadeusz, portrait: 'p-0016.jpg', portraitVideo: 'p-0016.mp4' });
    await w.find('[data-test="portrait-trigger"]').trigger('click');
    expect(w.findComponent({ name: 'MediaLightbox' }).exists()).toBe(true);
    await w.setProps({ detail: { ...tadeusz, id: 'p-0099', portrait: 'p-0099.jpg', portraitVideo: null } });
    expect(w.findComponent({ name: 'MediaLightbox' }).exists()).toBe(false);
  });

  it('renders the maiden name when present on a female person', () => {
    const w = mountWith({ ...tadeusz, sex: 'female', maidenName: { ru: 'Новак', be: null, en: 'Nowak' } });
    expect(w.find('.header__maiden').text()).toContain('Nowak');
  });

  it('never renders a maiden name for a male person', () => {
    const w = mountWith({ ...tadeusz, sex: 'male', maidenName: { ru: 'Новак', be: null, en: 'Nowak' } });
    expect(w.find('.header__maiden').exists()).toBe(false);
  });

  it('falls back to the raw vocation label for an unknown vocation', () => {
    const w = mountWith({ ...tadeusz, vocation: 'astronaut' });
    expect(w.find('.header__vocation').text()).toContain('astronaut');
  });

  it('plays a video with no poster when there is no still image', () => {
    const w = mountWith({ ...tadeusz, portrait: null, portraitVideo: 'p-0016.mp4' });
    const video = w.find('[data-test="portrait-video"]');
    expect(video.attributes('src')).toBe('/media/portraits/p-0016.mp4');
    expect(video.attributes('poster')).toBeUndefined();
  });

  it('resolves an uploaded full-key portrait to /media/<key> without the portraits prefix', () => {
    const w = mountWith({ ...tadeusz, portrait: 'uploads/p-0001/h1.webp' });
    expect(w.find('[data-test="portrait-image"]').attributes('src')).toBe('/media/uploads/p-0001/h1.webp');
  });

  it('navigates to the members route with the friendly slug when "open in members" is clicked', async () => {
    const router = makeRouter();
    await router.push('/members');
    await router.isReady();
    useFamilyStore().$patch({ people: [summary()] });
    const push = vi.spyOn(router, 'push');
    const w = mountWith(tadeusz, router);
    await w.get('[data-test="open-in-members"]').trigger('click');
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ name: 'members' }));
    const arg = push.mock.calls[0][0] as { params: { slug: string } };
    expect(arg.params.slug).toContain('p-0016');
  });

  it('renders the "open in members" button on its own when there is no vocation', () => {
    const w = mountWith({ ...tadeusz, vocation: '' });
    expect(w.find('.header__vocation').exists()).toBe(false);
    expect(w.find('[data-test="open-in-members"]').exists()).toBe(true);
  });
});
