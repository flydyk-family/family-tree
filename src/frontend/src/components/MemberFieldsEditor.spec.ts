import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { i18n } from '../i18n';
import type { PersonDetail } from '../types/family';

vi.mock('../api/profileApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/profileApi')>();
  return { ...actual, getProfile: vi.fn(), putProfile: vi.fn() };
});
import { getProfile, putProfile, ProfileSaveError, type PersonProfile } from '../api/profileApi';
import MemberFieldsEditor from './MemberFieldsEditor.vue';

const emptyProfile: PersonProfile = {
  givenName: null, surname: null, maidenName: null, sex: null, birthYear: null, deathYear: null, vocation: null
};

function detail(over: Partial<PersonDetail> = {}): PersonDetail {
  return {
    id: 'p-1',
    givenName: { ru: 'Анна', be: 'Ганна', en: 'Anna' },
    surname: { ru: 'Тест', be: 'Тэст', en: 'Test' },
    maidenName: null, sex: 'female',
    birth: { year: 1901, month: null, day: null, approx: false, place: null },
    death: { year: 1980, month: null, day: null, approx: false, place: null },
    vocation: 'teacher', summary: null, biography: null,
    portrait: null, portraitVideo: null, gallery: [], links: [], residences: [],
    parents: { motherId: null, fatherId: null }, marriedIntoFamily: false, isDefaultRoot: false,
    ...over
  } as PersonDetail;
}

async function mountEditor(base: PersonProfile = emptyProfile, d = detail()) {
  vi.mocked(getProfile).mockResolvedValue(base);
  const wrapper = mount(MemberFieldsEditor, {
    props: { personId: d.id, detail: d },
    global: { plugins: [i18n] }
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(getProfile).mockReset();
  vi.mocked(putProfile).mockReset();
});

describe('MemberFieldsEditor', () => {
  it('seeds inputs from the effective detail', async () => {
    const wrapper = await mountEditor();
    expect((wrapper.get('[data-test="field-birthYear"]').element as HTMLInputElement).value).toBe('1901');
    expect((wrapper.get('[data-test="field-sex"]').element as HTMLSelectElement).value).toBe('female');
  });

  it('Save is disabled until a field is dirty', async () => {
    const wrapper = await mountEditor();
    expect((wrapper.get('[data-test="fields-save"]').element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.get('[data-test="field-birthYear"]').setValue('1902');
    expect((wrapper.get('[data-test="fields-save"]').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('builds the payload from override ∪ edits and emits saved on success', async () => {
    const wrapper = await mountEditor();
    vi.mocked(putProfile).mockResolvedValue(detail({ birth: { year: 1902, month: null, day: null, approx: false, place: null } }));
    await wrapper.get('[data-test="field-birthYear"]').setValue('1902');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(putProfile).toHaveBeenCalledWith('p-1', expect.objectContaining({ birthYear: 1902, surname: null }));
    expect(wrapper.emitted('saved')).toBeTruthy();
  });

  it('shows the reset control only for a currently-overridden field', async () => {
    const overridden = await mountEditor({ ...emptyProfile, birthYear: 1901 });
    expect(overridden.find('[data-test="revert-birthYear"]').exists()).toBe(true);
    const plain = await mountEditor(emptyProfile);
    expect(plain.find('[data-test="revert-vocation"]').exists()).toBe(false);
  });

  it('reset marks the field to submit null', async () => {
    const wrapper = await mountEditor({ ...emptyProfile, birthYear: 1901 });
    vi.mocked(putProfile).mockResolvedValue(detail());
    await wrapper.get('[data-test="revert-birthYear"]').trigger('click');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(putProfile).toHaveBeenCalledWith('p-1', expect.objectContaining({ birthYear: null }));
  });

  it('keeps buffers and shows an error when the save fails', async () => {
    const wrapper = await mountEditor();
    vi.mocked(putProfile).mockRejectedValue(new ProfileSaveError(400, [{ propertyName: 'Profile.BirthYear', errorMessage: 'bad' }]));
    await wrapper.get('[data-test="field-birthYear"]').setValue('9999');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('saved')).toBeFalsy();
    expect(wrapper.find('[data-test="fields-error"]').exists()).toBe(true);
    expect((wrapper.get('[data-test="field-birthYear"]').element as HTMLInputElement).value).toBe('9999');
  });

  it('cancel with no changes emits cancel immediately', async () => {
    const wrapper = await mountEditor();
    await wrapper.get('[data-test="fields-cancel"]').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('Save stays disabled while the override is still loading, even with a dirty field', async () => {
    let resolveProfile!: (p: PersonProfile) => void;
    vi.mocked(getProfile).mockReturnValue(new Promise(resolve => { resolveProfile = resolve; }));
    const d = detail();
    const wrapper = mount(MemberFieldsEditor, {
      props: { personId: d.id, detail: d },
      global: { plugins: [i18n] }
    });
    await wrapper.get('[data-test="field-birthYear"]').setValue('1902');
    expect((wrapper.get('[data-test="fields-save"]').element as HTMLButtonElement).disabled).toBe(true);

    resolveProfile(emptyProfile);
    await flushPromises();
    expect((wrapper.get('[data-test="fields-save"]').element as HTMLButtonElement).disabled).toBe(false);
  });
});
