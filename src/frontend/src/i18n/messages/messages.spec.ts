import { describe, it, expect } from 'vitest';
import { en } from './en';
import { ru } from './ru';
import { be } from './be';

function keyPaths(object: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(object).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'object' && value !== null
      ? keyPaths(value as Record<string, unknown>, path)
      : [path];
  });
}

describe('message catalogs', () => {
  it('define the same key paths across ru, be, and en', () => {
    const enKeys = keyPaths(en).sort();
    expect(keyPaths(ru).sort()).toEqual(enKeys);
    expect(keyPaths(be).sort()).toEqual(enKeys);
  });

  it('include the person popup labels', () => {
    for (const catalog of [en, ru, be]) {
      const keys = keyPaths(catalog);
      expect(keys).toContain('person.pageOf');
      expect(keys).toContain('person.prevPage');
      expect(keys).toContain('person.nextPage');
      expect(keys).toContain('person.residences');
      expect(keys).toContain('vocation.teacher');
      expect(keys).toContain('panel.minimize');
      expect(keys).toContain('panel.expand');
      expect(keys).toContain('panel.close');
      expect(keys).toContain('panel.biggerView');
      expect(keys).toContain('panel.expandPanels');
      expect(keys).toContain('panel.collapseToChips');
      expect(keys).toContain('panel.statsTitle');
      expect(keys).toContain('nav.menu');
      expect(keys).toContain('nav.views');
      expect(keys).toContain('nav.language');
      expect(keys).toContain('nav.layout');
      expect(keys).toContain('auth.signIn');
      expect(keys).toContain('auth.signOut');
      expect(keys).toContain('auth.signedInAs');
      expect(keys).toContain('auth.editorBadge');
      expect(keys).toContain('editor.edit');
      expect(keys).toContain('editor.add');
      expect(keys).toContain('editor.empty');
      expect(keys).toContain('editor.save');
      expect(keys).toContain('editor.cancel');
      expect(keys).toContain('editor.saving');
      expect(keys).toContain('editor.saveFailed');
      expect(keys).toContain('editor.requireOne');
      expect(keys).toContain('editor.confirmBlank');
      expect(keys).toContain('editor.confirmDiscard');
      expect(keys).toContain('editor.keepEditing');
      expect(keys).toContain('editor.saveAnyway');
      expect(keys).toContain('editor.discard');
    }
  });
});
