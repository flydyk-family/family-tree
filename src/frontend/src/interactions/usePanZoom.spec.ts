import { describe, it, expect, beforeEach } from 'vitest';
import { defineComponent, ref, h } from 'vue';
import { mount } from '@vue/test-utils';
import { usePanZoom } from './usePanZoom';
import type { Bounds } from './panZoom';

function host(bounds: Bounds | null) {
  const api: { current?: ReturnType<typeof usePanZoom> } = {};
  const Comp = defineComponent({
    setup() {
      const boundsRef = ref<Bounds | null>(bounds);
      const pz = usePanZoom({ boundsRef, padding: 40 });
      api.current = pz;
      return () => h('svg', { ref: pz.svgRef });
    }
  });
  const wrapper = mount(Comp);
  return { wrapper, pz: api.current! };
}

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

describe('usePanZoom', () => {
  it('starts at identity transform before any interaction or measurement', () => {
    const { pz } = host(null);
    expect(pz.transform.value).toBe('translate(0,0) scale(1)');
  });

  it('pans by pointer drag delta', () => {
    const { pz } = host(null);
    pz.onPointerDown({ clientX: 100, clientY: 100, button: 0, preventDefault() {} } as PointerEvent);
    pz.onPointerMove({ clientX: 130, clientY: 90, preventDefault() {} } as PointerEvent);
    pz.onPointerUp({} as PointerEvent);
    expect(pz.viewport.value.x).toBe(30);
    expect(pz.viewport.value.y).toBe(-10);
    expect(pz.dragMoved.value).toBe(true);
  });

  it('zooms toward the cursor on wheel', () => {
    const { pz } = host(null);
    const before = pz.viewport.value.k;
    pz.onWheel({ deltaY: -100, clientX: 400, clientY: 300, preventDefault() {} } as WheelEvent);
    expect(pz.viewport.value.k).toBeGreaterThan(before);
  });

  it('does not flag a drag for a click without movement', () => {
    const { pz } = host(null);
    pz.onPointerDown({ clientX: 50, clientY: 50, button: 0, preventDefault() {} } as PointerEvent);
    pz.onPointerUp({} as PointerEvent);
    expect(pz.dragMoved.value).toBe(false);
  });
});
