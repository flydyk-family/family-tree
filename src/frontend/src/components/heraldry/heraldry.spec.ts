import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import CrestMark from './CrestMark.vue';
import CoatOfArms from './CoatOfArms.vue';
import BotanicalCorner from './BotanicalCorner.vue';
import OrnamentDivider from './OrnamentDivider.vue';

for (const [name, C] of [['CrestMark', CrestMark], ['CoatOfArms', CoatOfArms],
  ['BotanicalCorner', BotanicalCorner], ['OrnamentDivider', OrnamentDivider]] as const) {
  describe(name, () => {
    it('renders an aria-hidden svg', () => {
      const w = mount(C);
      const svg = w.find('svg');
      expect(svg.exists()).toBe(true);
      expect(w.element.getAttribute('aria-hidden')).toBe('true');
    });
  });
}
