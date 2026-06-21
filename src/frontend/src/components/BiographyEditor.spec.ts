import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
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
  it('seeds the active (ru) textarea from the biography', () => {
    const w = mountEditor();
    expect((w.find('[data-test="bio-input"]').element as HTMLTextAreaElement).value).toBe('Русский текст');
  });

  it('switches the textarea content when another tab is selected', async () => {
    const w = mountEditor();
    await w.find('[data-test="bio-tab-en"]').trigger('click');
    expect((w.find('[data-test="bio-input"]').element as HTMLTextAreaElement).value).toBe('English text');
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
});
