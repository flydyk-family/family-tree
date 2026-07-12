import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { i18n } from '../i18n';
import type { PersonDetail, PersonSummary } from '../types/family';

vi.mock('../api/familyApi', () => ({ fetchFamilyGraph: vi.fn(), fetchPerson: vi.fn() }));
import { fetchPerson } from '../api/familyApi';
import MemberDetail from './MemberDetail.vue';
import { useFamilyStore } from '../stores/familyStore';

function detail(overrides: Partial<PersonDetail> = {}): PersonDetail {
  return {
    id: 'p-1',
    givenName: { ru: 'Анна', be: 'Ганна', en: 'Anna' },
    surname: { ru: 'Ковальская', be: 'Кавальская', en: 'Kowalska' },
    maidenName: { ru: 'Новак', be: null, en: 'Nowak' },
    sex: 'female',
    birth: { year: 1901, month: 5, day: 3, approx: false, place: { ru: 'Минск', be: null, en: 'Minsk' } },
    death: { year: 1980, month: null, day: null, approx: false, place: null },
    vocation: 'teacher', summary: null,
    biography: { ru: 'Био', be: null, en: 'A short life story.' },
    portrait: null, portraitVideo: null, gallery: [], links: [],
    residences: [{ place: { ru: 'Гродно', be: null, en: 'Hrodna' }, fromYear: 1920, toYear: 1950 }],
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false,
    ...overrides
  } as PersonDetail;
}

function summary(id: string): PersonSummary {
  return {
    id, givenName: { ru: 'Анна', be: 'Ганна', en: 'Anna' }, surname: { ru: 'Ковальская', be: 'Кавальская', en: 'Kowalska' },
    maidenName: null, sex: 'female', birthYear: 1901, deathYear: 1980, birthPlace: null, vocation: 'teacher',
    portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false
  };
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'members', component: { template: '<div />' } },
      { path: '/person/:slug', name: 'person', component: { template: '<div />' } }
    ]
  });
}

async function mountDetail(
  personId = 'p-1',
  props: Partial<{ editable: boolean }> = {}
): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const router = makeRouter();
  router.push('/');
  await router.isReady();
  const wrapper = mount(MemberDetail, {
    props: { personId, ...props },
    global: { plugins: [router, i18n] }
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(fetchPerson).mockReset().mockResolvedValue(detail());
});

describe('MemberDetail', () => {
  it('loads and renders the dossier for the given person', async () => {
    const { wrapper } = await mountDetail('p-1');
    expect(fetchPerson).toHaveBeenCalledWith('p-1');
    expect(wrapper.get('.member-detail__name').text()).toContain('Anna');
    expect(wrapper.get('[data-test="member-fields"]').text()).toContain('Kowalska');
  });

  it('shows the biography panel when a biography exists', async () => {
    const { wrapper } = await mountDetail();
    expect(wrapper.find('.member-detail__bio').exists()).toBe(true);
    expect(wrapper.get('.member-detail__bio-text').text()).toContain('short life story');
  });

  it('omits the biography panel when there is no biography', async () => {
    vi.mocked(fetchPerson).mockResolvedValue(detail({ biography: null }));
    const { wrapper } = await mountDetail();
    expect(wrapper.find('.member-detail__bio').exists()).toBe(false);
  });

  it('renders residences', async () => {
    const { wrapper } = await mountDetail();
    expect(wrapper.get('.member-detail__residences').text()).toContain('Hrodna');
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(fetchPerson).mockRejectedValue(new Error('boom'));
    const { wrapper } = await mountDetail();
    expect(wrapper.find('.member-detail__status--error').exists()).toBe(true);
  });

  it('reloads when the personId prop changes', async () => {
    const { wrapper } = await mountDetail('p-1');
    vi.mocked(fetchPerson).mockResolvedValue(detail({ id: 'p-2' }));
    await wrapper.setProps({ personId: 'p-2' });
    await flushPromises();
    expect(fetchPerson).toHaveBeenLastCalledWith('p-2');
  });

  it('navigates to the person route when Find on tree is clicked', async () => {
    const { wrapper, router } = await mountDetail('p-1');
    useFamilyStore().$patch({ people: [summary('p-1')] });
    const push = vi.spyOn(router, 'push');
    await wrapper.get('[data-test="find-on-tree"]').trigger('click');
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ name: 'person' }));
  });

  it('renders every field tablet label and value in the mockup grid', async () => {
    const { wrapper } = await mountDetail();
    const fields = wrapper.get('[data-test="member-fields"]').text();
    expect(fields).toContain('Given name');
    expect(fields).toContain('Anna');
    expect(fields).toContain('Surname');
    expect(fields).toContain('Kowalska');
    expect(fields).toContain('Maiden name');
    expect(fields).toContain('Nowak');
    expect(fields).toContain('Sex');
    expect(fields).toContain('Female');
    expect(fields).toContain('Vocation');
    expect(fields).toContain('Teacher');
    expect(fields).toContain('Born');
    expect(fields).toContain('Died');
  });

  it('does not render any field-edit seam when editable defaults to false', async () => {
    const { wrapper } = await mountDetail();
    expect(wrapper.findAll('[data-test="field-edit"]').length).toBe(0);
    expect(wrapper.find('.member-detail__edit').exists()).toBe(false);
  });

  it('reserves the field-edit seam once editable is true', async () => {
    const { wrapper } = await mountDetail('p-1', { editable: true });
    expect(wrapper.findAll('[data-test="field-edit"]').length).toBeGreaterThan(0);
  });

  it('renders no residence-edit seams when editable defaults to false', async () => {
    const { wrapper } = await mountDetail();
    expect(wrapper.findAll('[data-test="add-residence"]').length).toBe(0);
    expect(wrapper.findAll('[data-test="residence-edit"]').length).toBe(0);
    expect(wrapper.findAll('[data-test="residence-delete"]').length).toBe(0);
  });

  it('reserves the residence-edit seams once editable is true', async () => {
    const { wrapper } = await mountDetail('p-1', { editable: true });
    expect(wrapper.findAll('[data-test="add-residence"]').length).toBeGreaterThan(0);
    expect(wrapper.findAll('[data-test="residence-edit"]').length).toBeGreaterThan(0);
    expect(wrapper.findAll('[data-test="residence-delete"]').length).toBeGreaterThan(0);
  });

  it('renders a decorative, aria-hidden coat of arms in the fields area', async () => {
    const { wrapper } = await mountDetail();
    const crest = wrapper.get('[data-test="coat-of-arms"]');
    expect(crest.attributes('aria-hidden')).toBe('true');
  });
});
