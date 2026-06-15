/**
 * Vitest global setup — patches jsdom so that vue-test-utils trigger() can pass
 * coordinate properties (clientX/Y, screenX/Y, etc.) to PointerEvent/MouseEvent.
 *
 * Problem: These properties live on MouseEvent.prototype as getter-only accessors.
 * PointerEvent.prototype does NOT redeclare them, so Object.getOwnPropertyDescriptor
 * on PointerEvent.prototype returns undefined, making vue-test-utils think they're
 * writable — but the strict-mode assignment then throws because the getter-only
 * accessor is inherited from MouseEvent.prototype.
 *
 * Fix: add a setter that shadows the value on the instance via defineProperty,
 * preserving the original getter for reads.
 */

const COORDINATE_PROPS: ReadonlyArray<string> = [
  'screenX', 'screenY', 'clientX', 'clientY',
  'pageX', 'pageY', 'x', 'y',
  'offsetX', 'offsetY', 'movementX', 'movementY',
  'button', 'buttons',
  'ctrlKey', 'shiftKey', 'altKey', 'metaKey',
];

for (const prop of COORDINATE_PROPS) {
  const desc = Object.getOwnPropertyDescriptor(MouseEvent.prototype, prop);
  if (desc && desc.get && !desc.set) {
    Object.defineProperty(MouseEvent.prototype, prop, {
      get: desc.get,
      set(this: MouseEvent, value: unknown) {
        Object.defineProperty(this, prop, { value, writable: true, configurable: true });
      },
      configurable: true,
      enumerable: desc.enumerable,
    });
  }
}
