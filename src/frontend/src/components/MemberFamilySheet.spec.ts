import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import MemberFamilySheet from './MemberFamilySheet.vue';
import type { PersonSummary, Union } from '../types/family';

function p(id: string): PersonSummary {
  return {
    id, givenName: { ru: id, be: id, en: id }, surname: { ru: '', be: '', en: '' },
    maidenName: null, sex: 'unknown', birthYear: 1950, deathYear: null, vocation: 'unknown',
    portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false
  };
}

const i18n = createI18n({
  legacy: false,
  locale: 'ru',
  messages: { ru: { members: { parents: 'Родители', siblings: 'Братья и сёстры', spouse: 'Супруг(а)', children: 'Дети', familyLabel: 'Семья', showMore: 'показать', showLess: 'скрыть', noFamily: 'нет родственников' } } }
});

describe('MemberFamilySheet', () => {
  const father = { ...p('p-f'), birthYear: 1900 };
  const self = { ...p('p-1'), parents: { fatherId: 'p-f', motherId: null } };
  const child = { ...p('p-c'), birthYear: 1975 };
  const people = [father, self, child];
  const unions: Union[] = [{ id: 'u-1', partnerIds: ['p-1'], marriageYear: null, childIds: ['p-c'] }];

  it('is collapsed by default and reveals relatives when the handle is toggled', async () => {
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people, unions },
      global: { plugins: [i18n] }
    });
    // Collapsed: handle only, no chips shown.
    expect(wrapper.findAll('[data-test="relative-chip"]')).toHaveLength(0);
    await wrapper.get('[data-test="family-sheet-handle"]').trigger('click');
    expect(wrapper.findAll('[data-test="relative-chip"]')).toHaveLength(2); // father + child
  });

  it('emits select when a relative is clicked', async () => {
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people, unions },
      global: { plugins: [i18n] }
    });
    await wrapper.get('[data-test="family-sheet-handle"]').trigger('click');
    await wrapper.get('[data-test="relative-chip"]').trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
  });

  it('disables the handle and shows a no-family note when the person has no relatives', () => {
    const lone = { ...p('p-lonely') };
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-lonely', people: [lone], unions: [] },
      global: { plugins: [i18n] }
    });
    const handle = wrapper.get('[data-test="family-sheet-handle"]');
    expect((handle.element as HTMLButtonElement).disabled).toBe(true);
    expect(wrapper.find('.family-sheet__handle-note').text()).toContain('нет родственников');
    expect(wrapper.findAll('[data-test="relative-chip"]')).toHaveLength(0);
  });

  it('renders no inert add-slot placeholders in cut 1', () => {
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people, unions },
      global: { plugins: [i18n] }
    });
    expect(wrapper.find('[data-test="add-slot"]').exists()).toBe(false);
  });
});
