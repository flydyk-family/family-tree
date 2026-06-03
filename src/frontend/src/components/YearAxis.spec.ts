import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import YearAxis from './YearAxis.vue';
import { createTimeScale } from '../layout/timeScale';

describe('YearAxis', () => {
  it('renders a labelled tick for each step year', () => {
    const scale = createTimeScale([1800, 2000], 8, 0);
    const wrapper = mount(YearAxis, { props: { scale, step: 50 } });

    const labels = wrapper.findAll('[data-test="tick-label"]');
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.map(label => label.text())).toContain('1900');
  });
});
