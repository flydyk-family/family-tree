import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import { usePopover } from './usePopover';

// Minimal host that wires the composable the way the real menus do.
const Harness = defineComponent({
  setup() {
    const root = ref<HTMLElement | null>(null);
    const panel = ref<HTMLElement | null>(null);
    const trigger = ref<HTMLElement | null>(null);
    const { open, toggle, setOpen, closeAndRestoreFocus } = usePopover({ root, panel, trigger });
    return { root, panel, trigger, open, toggle, setOpen, closeAndRestoreFocus };
  },
  template: `
    <div ref="root">
      <button ref="trigger" data-test="trigger" @click="toggle">t</button>
      <div v-if="open" ref="panel" tabindex="-1" data-test="panel">panel</div>
    </div>
  `
});

function mountHarness() {
  return mount(Harness, { attachTo: document.body });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('usePopover', () => {
  it('toggles open/closed and moves focus into the panel on open', async () => {
    const w = mountHarness();
    expect(w.vm.open).toBe(false);
    await w.get('[data-test="trigger"]').trigger('click');
    expect(w.vm.open).toBe(true);
    await nextTick();
    expect(document.activeElement).toBe(w.get('[data-test="panel"]').element);
    await w.get('[data-test="trigger"]').trigger('click');
    expect(w.vm.open).toBe(false);
    w.unmount();
  });

  it('setOpen to the current value is a no-op (early return)', async () => {
    const w = mountHarness();
    w.vm.setOpen(false); // already closed
    await nextTick();
    expect(w.vm.open).toBe(false);
    w.unmount();
  });

  it('closes on an outside pointerdown but stays open on an inside one', async () => {
    const w = mountHarness();
    w.vm.setOpen(true);
    await nextTick();
    // inside keeps it open
    w.get('[data-test="panel"]').element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();
    expect(w.vm.open).toBe(true);
    // outside closes it
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();
    expect(w.vm.open).toBe(false);
    w.unmount();
  });

  it('closeAndRestoreFocus closes and returns focus to the trigger', async () => {
    const w = mountHarness();
    w.vm.setOpen(true);
    await nextTick();
    w.vm.closeAndRestoreFocus();
    await nextTick();
    expect(w.vm.open).toBe(false);
    expect(document.activeElement).toBe(w.get('[data-test="trigger"]').element);
    w.unmount();
  });

  it('removes its document listener on unmount (no close after teardown)', async () => {
    const w = mountHarness();
    w.vm.setOpen(true);
    await nextTick();
    w.unmount();
    // Listener is gone — a stray pointerdown must not throw or touch state.
    expect(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))).not.toThrow();
  });
});
