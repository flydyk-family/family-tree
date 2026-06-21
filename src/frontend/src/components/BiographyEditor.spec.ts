import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import { useLocaleStore } from '../stores/localeStore';
import type { LocalizedText, PersonDetail } from '../types/family';

vi.mock('../api/biographyApi', () => ({ putBiography: vi.fn() }));
import { putBiography } from '../api/biographyApi';
import BiographyEditor from './BiographyEditor.vue';

const bio: LocalizedText = { ru: 'Русский текст', be: null, en: 'English text' };
const updated = { id: 'p-0016', biography: bio } as unknown as PersonDetail;

function mountEditor(biography: LocalizedText | null = bio) {
  return mount(BiographyEditor, {
    props: { personId: 'p-0016', biography },
    global: { plugins: [i18n] }
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  useLocaleStore().setLocale('en');
  vi.mocked(putBiography).mockReset();
});

describe('BiographyEditor', () => {
  it('preselects the active app-locale tab and seeds its textarea', () => {
    // beforeEach sets the app locale to 'en', so the editor opens on the en tab.
    const w = mountEditor();
    expect(w.find('[data-test="bio-tab-en"]').attributes('aria-selected')).toBe('true');
    expect((w.find('[data-test="bio-input"]').element as HTMLTextAreaElement).value).toBe('English text');
  });

  it('preselects the tab for a different app locale (be)', () => {
    useLocaleStore().setLocale('be');
    const w = mountEditor();
    expect(w.find('[data-test="bio-tab-be"]').attributes('aria-selected')).toBe('true');
  });

  it('switches the textarea content when another tab is selected', async () => {
    const w = mountEditor();
    await w.find('[data-test="bio-tab-ru"]').trigger('click');
    expect((w.find('[data-test="bio-input"]').element as HTMLTextAreaElement).value).toBe('Русский текст');
  });

  it('marks tabs that have text with a filled dot', () => {
    const w = mountEditor();
    expect(w.find('[data-test="bio-tab-ru"] .bio-editor__dot--filled').exists()).toBe(true);
    expect(w.find('[data-test="bio-tab-en"] .bio-editor__dot--filled').exists()).toBe(true);
    expect(w.find('[data-test="bio-tab-be"] .bio-editor__dot--filled').exists()).toBe(false);
  });

  it('disables Save and shows the require-one hint when every locale is empty', () => {
    const w = mountEditor({ ru: null, be: null, en: null });
    expect((w.find('[data-test="bio-save"]').element as HTMLButtonElement).disabled).toBe(true);
    expect(w.find('[data-test="bio-require"]').exists()).toBe(true);
  });

  it('saves all locales (trimmed; empty → null) and emits saved with the server detail', async () => {
    vi.mocked(putBiography).mockResolvedValue(updated);
    const w = mountEditor({ ru: 'Текст', be: null, en: null });

    await w.find('[data-test="bio-save"]').trigger('click');
    await Promise.resolve();

    expect(putBiography).toHaveBeenCalledWith('p-0016', { ru: 'Текст', be: null, en: null });
    expect(w.emitted('saved')?.[0]).toEqual([updated]);
  });

  it('keeps the buffer and shows an error when the save fails, then retries', async () => {
    vi.mocked(putBiography).mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce(updated);
    const w = mountEditor({ ru: 'Текст', be: null, en: null });

    await w.find('[data-test="bio-save"]').trigger('click');
    await Promise.resolve();
    await Promise.resolve();

    expect(w.find('[data-test="bio-error"]').exists()).toBe(true);
    // The text lives in the ru buffer; switch to it to confirm it survived the failure.
    await w.find('[data-test="bio-tab-ru"]').trigger('click');
    expect((w.find('[data-test="bio-input"]').element as HTMLTextAreaElement).value).toBe('Текст');
    expect(w.emitted('saved')).toBeUndefined();

    await w.find('[data-test="bio-save"]').trigger('click');
    await Promise.resolve();
    expect(w.emitted('saved')?.[0]).toEqual([updated]);
  });

  it('confirms before blanking a previously non-empty locale, then saves on accept', async () => {
    vi.mocked(putBiography).mockResolvedValue(updated);
    const w = mountEditor(); // ru + en have text
    // Clear the en buffer via its tab.
    await w.find('[data-test="bio-tab-en"]').trigger('click');
    await w.find('[data-test="bio-input"]').setValue('');

    await w.find('[data-test="bio-save"]').trigger('click');
    // Blank-confirm shown; no save yet.
    expect(w.find('[data-test="bio-confirm"]').exists()).toBe(true);
    expect(putBiography).not.toHaveBeenCalled();

    await w.find('[data-test="bio-confirm-accept"]').trigger('click');
    await Promise.resolve();
    expect(putBiography).toHaveBeenCalledWith('p-0016', { ru: 'Русский текст', be: null, en: null });
  });

  it('emits cancel immediately when nothing changed', async () => {
    const w = mountEditor();
    await w.find('[data-test="bio-cancel"]').trigger('click');
    expect(w.emitted('cancel')).toHaveLength(1);
  });

  it('confirms before discarding when the buffer is dirty', async () => {
    const w = mountEditor();
    await w.find('[data-test="bio-input"]').setValue('changed');

    await w.find('[data-test="bio-cancel"]').trigger('click');
    expect(w.find('[data-test="bio-confirm"]').exists()).toBe(true);
    expect(w.emitted('cancel')).toBeUndefined();

    await w.find('[data-test="bio-confirm-accept"]').trigger('click');
    expect(w.emitted('cancel')).toHaveLength(1);
  });

  it('compares dirtiness against the original biography even if the prop changes mid-edit', async () => {
    const w = mountEditor(bio); // ru + en have text; buffers seeded from these
    // Parent swaps in a different biography without unmounting the editor.
    await w.setProps({ biography: { ru: 'другое', be: 'іншае', en: 'other' } });
    // Buffers are unchanged from the original, so Cancel must treat the editor as
    // clean and emit immediately (no discard confirm) — proving "original" was snapshotted.
    await w.find('[data-test="bio-cancel"]').trigger('click');
    expect(w.find('[data-test="bio-confirm"]').exists()).toBe(false);
    expect(w.emitted('cancel')).toHaveLength(1);
  });

  it('exposes the ARIA tabs relationships (roving tabindex, aria-controls, tabpanel)', () => {
    // App locale is 'en' here, so en is the active (roving tabindex 0) tab.
    const w = mountEditor();
    expect(w.find('[data-test="bio-tab-en"]').attributes('tabindex')).toBe('0');
    expect(w.find('[data-test="bio-tab-ru"]').attributes('tabindex')).toBe('-1');
    expect(w.find('[data-test="bio-tab-ru"]').attributes('aria-controls')).toBe('bio-panel');
    expect(w.find('[role="tabpanel"]').attributes('id')).toBe('bio-panel');
    expect(w.find('[role="tabpanel"]').attributes('aria-labelledby')).toBe('bio-tab-en');
  });

  it('moves the active tab with arrow keys, wrapping at both ends', async () => {
    const w = mountEditor();
    await w.find('[data-test="bio-tab-ru"]').trigger('click'); // normalise to ru regardless of app locale
    await w.find('[data-test="bio-tab-ru"]').trigger('keydown.right');
    expect(w.find('[data-test="bio-tab-be"]').attributes('aria-selected')).toBe('true');
    await w.find('[data-test="bio-tab-be"]').trigger('keydown.right');
    expect(w.find('[data-test="bio-tab-en"]').attributes('aria-selected')).toBe('true');
    await w.find('[data-test="bio-tab-en"]').trigger('keydown.right'); // wrap to ru
    expect(w.find('[data-test="bio-tab-ru"]').attributes('aria-selected')).toBe('true');
    await w.find('[data-test="bio-tab-ru"]').trigger('keydown.left'); // wrap to en
    expect(w.find('[data-test="bio-tab-en"]').attributes('aria-selected')).toBe('true');
  });

  it('handles a null biography: empty buffers, Save disabled, requireOne shown', () => {
    const w = mountEditor(null);
    expect((w.find('[data-test="bio-input"]').element as HTMLTextAreaElement).value).toBe('');
    expect((w.find('[data-test="bio-save"]').element as HTMLButtonElement).disabled).toBe(true);
    expect(w.find('[data-test="bio-require"]').exists()).toBe(true);
  });

  it('shows a saving state and ignores re-clicks while a save is in flight', async () => {
    let resolveSave!: (value: PersonDetail) => void;
    vi.mocked(putBiography).mockReturnValue(new Promise(resolve => { resolveSave = resolve; }));
    const w = mountEditor({ ru: 'Текст', be: null, en: null });

    await w.find('[data-test="bio-save"]').trigger('click');
    const saveBtn = w.find('[data-test="bio-save"]');
    expect((saveBtn.element as HTMLButtonElement).disabled).toBe(true);
    expect(saveBtn.text()).toContain('Saving');

    await saveBtn.trigger('click'); // re-click is ignored while saving
    expect(putBiography).toHaveBeenCalledTimes(1);

    resolveSave(updated);
    await flushPromises();
    expect(w.emitted('saved')?.[0]).toEqual([updated]);
  });

  it('ignores a re-entrant save while one is already in flight', async () => {
    let resolveSave!: (value: PersonDetail) => void;
    vi.mocked(putBiography).mockReturnValue(new Promise(resolve => { resolveSave = resolve; }));
    const w = mountEditor(); // ru + en have text
    // Clear en so Save routes through the blank-confirm (whose accept button stays enabled).
    await w.find('[data-test="bio-tab-en"]').trigger('click');
    await w.find('[data-test="bio-input"]').setValue('');
    await w.find('[data-test="bio-save"]').trigger('click');
    expect(w.find('[data-test="bio-confirm"]').exists()).toBe(true);

    await w.find('[data-test="bio-confirm-accept"]').trigger('click'); // first save in flight
    expect(putBiography).toHaveBeenCalledTimes(1);
    await w.find('[data-test="bio-confirm-accept"]').trigger('click'); // re-entrant — guarded out
    expect(putBiography).toHaveBeenCalledTimes(1);

    resolveSave(updated);
    await flushPromises();
    expect(w.emitted('saved')?.[0]).toEqual([updated]);
  });

  it('replaces the save error with the requireOne hint once all locales are cleared', async () => {
    vi.mocked(putBiography).mockRejectedValue(new Error('500'));
    const w = mountEditor({ ru: 'Текст', be: null, en: null });

    await w.find('[data-test="bio-save"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-test="bio-error"]').exists()).toBe(true);

    // Clear the only non-empty locale (ru) so every buffer is empty.
    await w.find('[data-test="bio-tab-ru"]').trigger('click');
    await w.find('[data-test="bio-input"]').setValue('');
    expect(w.find('[data-test="bio-require"]').exists()).toBe(true);
    expect(w.find('[data-test="bio-error"]').exists()).toBe(false);
  });

  it('dismisses the confirm and keeps editing when "keep editing" is clicked', async () => {
    const w = mountEditor();
    await w.find('[data-test="bio-input"]').setValue('changed');
    await w.find('[data-test="bio-cancel"]').trigger('click');
    expect(w.find('[data-test="bio-confirm"]').exists()).toBe(true);

    await w.find('[data-test="bio-confirm-cancel"]').trigger('click');
    expect(w.find('[data-test="bio-confirm"]').exists()).toBe(false);
    expect(w.emitted('cancel')).toBeUndefined();
  });
});
