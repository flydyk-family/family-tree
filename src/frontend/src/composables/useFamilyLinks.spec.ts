import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { defineComponent, ref, type Ref } from 'vue';
import { i18n } from '../i18n';
import { buildRoutes } from '../router/familyRoutes';
import { useFamiliesStore } from '../stores/familiesStore';
import { useLocaleStore } from '../stores/localeStore';
import { useFamilyLinks, type FamilyLinks } from './useFamilyLinks';
import type { PersonDetail } from '../types/family';

function familyRouter(): Router {
  const stub = { template: '<div />' };
  return createRouter({ history: createMemoryHistory(), routes: buildRoutes({ tree: stub, chronicle: stub, members: stub }) });
}

function person(overrides: Partial<PersonDetail> = {}): PersonDetail {
  return {
    id: 'p-0001', givenName: { ru: null, be: null, en: 'Anna' }, surname: { ru: null, be: null, en: 'Nowak' },
    maidenName: null, middleName: null, sex: 'female', birth: null, death: null, vocation: '', summary: null,
    biography: null, portrait: null, portraitVideo: null, gallery: [], links: [], residences: [],
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false,
    ...overrides
  } as PersonDetail;
}

async function useWith(detail: Ref<PersonDetail | null>, path = '/'): Promise<FamilyLinks> {
  const router = familyRouter();
  await router.push(path);
  let result: FamilyLinks | undefined;
  mount(defineComponent({ setup() { result = useFamilyLinks(() => detail.value); return () => null; } }), {
    global: { plugins: [router, i18n] }
  });
  return result as FamilyLinks;
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  const families = useFamiliesStore();
  families.families = [
    { id: 'kowalski', name: { ru: null, be: null, en: 'Kowalski' }, isDefault: true },
    { id: 'lesnicki', name: { ru: null, be: null, en: 'Lesnicki' }, isDefault: false }
  ];
  families.loaded = true;
});

describe('useFamilyLinks', () => {
  it('has no links while the detail is still null, and picks them up once it loads', async () => {
    const detail = ref<PersonDetail | null>(null);
    const links = await useWith(detail);
    expect(links.links.value).toEqual([]);

    detail.value = person({ familyLinks: [{ family: 'lesnicki', personId: 'p-0003', relation: 'origin' }] });

    expect(links.links.value).toHaveLength(1);
  });

  it('filters out the active family and unregistered families', async () => {
    const detail = ref<PersonDetail | null>(person({
      familyLinks: [
        { family: 'kowalski', personId: 'p-0008', relation: 'joined' },
        { family: 'nowak', personId: null, relation: 'origin' },
        { family: 'lesnicki', personId: null, relation: 'origin' }
      ]
    }));
    const links = await useWith(detail, '/f/lesnicki/members');

    expect(links.links.value.map(link => link.family)).toEqual(['kowalski']);
  });

  it('labels a joined link with the sex-specific wording', async () => {
    const links = await useWith(ref(person()));

    expect(links.label({ family: 'lesnicki', personId: null, relation: 'joined' })).toBe('Family she joined: Lesnicki');
  });

  it('targets the counterpart person, or the other family tree when there is none', async () => {
    const links = await useWith(ref(person()));

    expect(links.target({ family: 'lesnicki', personId: 'p-0003', relation: 'origin' }))
      .toEqual({ name: 'family-person', params: { slug: 'p-0003', familyId: 'lesnicki' } });
    expect(links.target({ family: 'kowalski', personId: null, relation: 'joined' })).toEqual({ name: 'tree', params: {} });
  });
});
