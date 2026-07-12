import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import MemberFamilySheet from './MemberFamilySheet.vue';
import type { PersonSummary, Union } from '../types/family';

function p(id: string): PersonSummary {
  return {
    id, givenName: { ru: id, be: id, en: id }, surname: { ru: '', be: '', en: '' },
    maidenName: null, sex: 'unknown', birthYear: 1950, deathYear: null, birthPlace: null, vocation: 'unknown',
    portrait: null, portraitVideo: null, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false
  };
}

const i18n = createI18n({
  legacy: false,
  locale: 'ru',
  messages: {
    ru: {
      members: {
        parents: 'Родители', siblings: 'Братья и сёстры', spouse: 'Супруг(а)', children: 'Дети',
        familyLabel: 'Семья', showMore: 'показать', showLess: 'скрыть', noFamily: 'нет родственников',
        dragForDetails: 'Потяните вверх за подробностями', married: 'В браке: {year}',
        viewAllChildren: 'Показать всех детей ({n})'
      }
    }
  }
});

async function expandSheet(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="family-sheet-handle"]').trigger('click');
}

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
    // Collapsed: handle only, no cards shown.
    expect(wrapper.findAll('[data-test="relative-chip"]')).toHaveLength(0);
    await expandSheet(wrapper);
    expect(wrapper.findAll('[data-test="relative-chip"]')).toHaveLength(2); // father + child
  });

  it('emits select when a relative is clicked', async () => {
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people, unions },
      global: { plugins: [i18n] }
    });
    await expandSheet(wrapper);
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

  it('labels the handle "drag up for more details" when family exists', () => {
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people, unions },
      global: { plugins: [i18n] }
    });
    expect(wrapper.get('[data-test="family-sheet-handle"]').text()).toContain('Потяните вверх за подробностями');
  });

  it('shows "Married {year}" under the spouse card when the union has a marriage year', async () => {
    const spouse = { ...p('p-s'), birthYear: 1955 };
    const marriedUnion: Union = { id: 'u-2', partnerIds: ['p-1', 'p-s'], marriageYear: 1975, childIds: [] };
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people: [...people, spouse], unions: [...unions, marriedUnion] },
      global: { plugins: [i18n] }
    });
    await expandSheet(wrapper);
    expect(wrapper.text()).toContain('В браке: 1975');
  });

  it('omits the married line when the union has no marriage year', async () => {
    const spouse = { ...p('p-s'), birthYear: 1955 };
    const noYearUnion: Union = { id: 'u-3', partnerIds: ['p-1', 'p-s'], marriageYear: null, childIds: [] };
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people: [...people, spouse], unions: [...unions, noYearUnion] },
      global: { plugins: [i18n] }
    });
    await expandSheet(wrapper);
    expect(wrapper.text()).not.toContain('В браке:');
  });

  it('truncates children beyond 5 with a "View all children" control that reveals the rest', async () => {
    const manyChildren = Array.from({ length: 7 }, (_, i) => ({ ...p(`p-c${i}`), birthYear: 1970 + i }));
    const bigUnion: Union = {
      id: 'u-4', partnerIds: ['p-1'], marriageYear: null, childIds: manyChildren.map(c => c.id)
    };
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people: [self, ...manyChildren], unions: [bigUnion] },
      global: { plugins: [i18n] }
    });
    await expandSheet(wrapper);

    const childrenColumn = wrapper.get('[data-test="family-column-children"]');
    expect(childrenColumn.findAll('[data-test="relative-chip"]')).toHaveLength(5);

    const viewAll = wrapper.get('[data-test="view-all-children"]');
    expect(viewAll.text()).toContain('Показать всех детей (7)');

    await viewAll.trigger('click');
    expect(childrenColumn.findAll('[data-test="relative-chip"]')).toHaveLength(7);
    expect(wrapper.find('[data-test="view-all-children"]').exists()).toBe(false);
  });

  it('shows all children with no "view all" control when there are 5 or fewer', async () => {
    const fewChildren = Array.from({ length: 3 }, (_, i) => ({ ...p(`p-c${i}`), birthYear: 1970 + i }));
    const union: Union = { id: 'u-5', partnerIds: ['p-1'], marriageYear: null, childIds: fewChildren.map(c => c.id) };
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people: [self, ...fewChildren], unions: [union] },
      global: { plugins: [i18n] }
    });
    await expandSheet(wrapper);
    const childrenColumn = wrapper.get('[data-test="family-column-children"]');
    expect(childrenColumn.findAll('[data-test="relative-chip"]')).toHaveLength(3);
    expect(wrapper.find('[data-test="view-all-children"]').exists()).toBe(false);
  });

  it('renders a siblings section only when the person has siblings', async () => {
    const brother = { ...p('p-b'), birthYear: 1902, parents: { fatherId: 'p-f', motherId: null } };
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people: [...people, brother], unions },
      global: { plugins: [i18n] }
    });
    await expandSheet(wrapper);
    expect(wrapper.find('[data-test="family-siblings"]').exists()).toBe(true);
  });

  it('omits the siblings section when the person has no siblings', async () => {
    const wrapper = mount(MemberFamilySheet, {
      props: { personId: 'p-1', people, unions },
      global: { plugins: [i18n] }
    });
    await expandSheet(wrapper);
    expect(wrapper.find('[data-test="family-siblings"]').exists()).toBe(false);
  });
});
