import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import StatsPanel from './StatsPanel.vue';
import { usePanelStore } from '../stores/panelStore';
import { i18n } from '../i18n';
import type { PersonSummary } from '../types/family';

function person(id: string, birthYear: number | null, portrait: string | null, deathYear: number | null): PersonSummary {
  return { id, givenName: { ru: id, be: null, en: id }, surname: { ru: 'X', be: null, en: 'X' },
    maidenName: null, sex: 'male', birthYear, deathYear, vocation: 'other', portrait,
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false };
}

beforeEach(() => setActivePinia(createPinia()));

function mountStats(people: PersonSummary[], state: 'expanded' | 'minimized' | 'chip' = 'expanded') {
  return mount(StatsPanel, { props: { people, state }, global: { plugins: [i18n] } });
}

describe('StatsPanel', () => {
  it('computes counts from the people list when expanded', () => {
    const w = mountStats([person('a', 1900, 'a.jpg', 1970), person('b', 1880, null, null), person('c', null, 'c.jpg', null)]);
    expect(w.get('[data-test="stat-members"]').text()).toContain('3');
    expect(w.get('[data-test="stat-earliest"]').text()).toContain('1880');
    expect(w.get('[data-test="stat-withPortraits"]').text()).toContain('2');
    expect(w.get('[data-test="stat-living"]').text()).toContain('2');
  });

  it('shows zeros and an em dash with no people', () => {
    const w = mountStats([]);
    expect(w.get('[data-test="stat-members"]').text()).toContain('0');
    expect(w.get('[data-test="stat-earliest"]').text()).toContain('—');
  });

  it('hides the figures when minimized', () => {
    const w = mountStats([person('a', 1900, null, null)], 'minimized');
    expect(w.find('[data-test="stat-members"]').exists()).toBe(false);
  });

  it('toggles stats minimized in the store when the control is used', async () => {
    const w = mountStats([person('a', 1900, null, null)], 'expanded');
    await w.get('[data-test="panel-minimize"]').trigger('click');
    expect(usePanelStore().statsMinimized).toBe(true);
  });

  it('is not closable', () => {
    const w = mountStats([person('a', 1900, null, null)], 'expanded');
    expect(w.find('[data-test="panel-close"]').exists()).toBe(false);
  });
});
