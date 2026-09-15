import { describe, it, expect } from 'vitest';
import { router } from './index';

describe('app router', () => {
  it('registers every view in both route shapes', () => {
    for (const view of ['tree', 'chronicle', 'members', 'person']) {
      expect(router.hasRoute(view)).toBe(true);
      expect(router.hasRoute(`family-${view}`)).toBe(true);
    }
  });
});
