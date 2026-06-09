import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '../i18n';
import DockPanel from './DockPanel.vue';

function mountPanel(props: Record<string, unknown>) {
  return mount(DockPanel, {
    props: { icon: '👤', title: 'Anna', state: 'expanded', ...props },
    slots: { default: '<p class="body">content</p>' },
    global: { plugins: [i18n] }
  });
}

describe('DockPanel', () => {
  it('renders the icon and title', () => {
    const w = mountPanel({});
    expect(w.get('[data-test="panel-title"]').text()).toBe('Anna');
    expect(w.text()).toContain('👤');
  });

  it('shows the body when expanded and hides it when minimized', async () => {
    const w = mountPanel({ state: 'expanded' });
    expect(w.find('.body').exists()).toBe(true);
    await w.setProps({ state: 'minimized' });
    expect(w.find('.body').exists()).toBe(false);
  });

  it('renders a chip (icon only, no body) in chip state', () => {
    const w = mountPanel({ state: 'chip', chipGlyph: 'А' });
    expect(w.get('[data-test="panel-chip"]').text()).toContain('А');
    expect(w.find('.body').exists()).toBe(false);
  });

  it('emits expand when a minimized panel header is activated', async () => {
    const w = mountPanel({ state: 'minimized' });
    await w.get('[data-test="panel-expand"]').trigger('click');
    expect(w.emitted('expand')).toBeTruthy();
  });

  it('emits minimize, close and bigger from the controls', async () => {
    const w = mountPanel({ state: 'expanded', closable: true, biggerable: true });
    await w.get('[data-test="panel-minimize"]').trigger('click');
    await w.get('[data-test="panel-bigger"]').trigger('click');
    await w.get('[data-test="panel-close"]').trigger('click');
    expect(w.emitted('minimize')).toBeTruthy();
    expect(w.emitted('bigger')).toBeTruthy();
    expect(w.emitted('close')).toBeTruthy();
  });

  it('omits the close control when not closable (pinned stats)', () => {
    const w = mountPanel({ state: 'expanded', closable: false, pinned: true });
    expect(w.find('[data-test="panel-close"]').exists()).toBe(false);
  });

  it('emits chip-tap when a chip is clicked', async () => {
    const w = mountPanel({ state: 'chip', chipGlyph: 'А' });
    await w.get('[data-test="panel-chip"]').trigger('click');
    expect(w.emitted('chipTap')).toBeTruthy();
  });
});
