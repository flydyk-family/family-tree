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
  givenName: null, surname: null, maidenName: null, middleName: null, sex: null, birthYear: null, birthMonth: null, birthDay: null, deathYear: null, deathMonth: null, deathDay: null, vocation: null
};

function detail(over: Partial<PersonDetail> = {}): PersonDetail {
  return {
    id: 'p-1',
    givenName: { ru: 'Анна', be: 'Ганна', en: 'Anna' },
    surname: { ru: 'Тест', be: 'Тэст', en: 'Test' },
    maidenName: null, middleName: null, sex: 'female',
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

  it('hides the maiden-name field for male persons and reveals it when sex changes', async () => {
    const male = await mountEditor(emptyProfile, detail({ sex: 'male' }));
    expect(male.find('[data-test="field-maidenName"]').exists()).toBe(false);

    const female = await mountEditor(emptyProfile, detail({ sex: 'female' }));
    expect(female.find('[data-test="field-maidenName"]').exists()).toBe(true);
    await female.get('[data-test="field-sex"]').setValue('male');
    expect(female.find('[data-test="field-maidenName"]').exists()).toBe(false);
  });

  it('navigates locale tabs with arrow keys (roving tabindex, wrapping)', async () => {
    const wrapper = await mountEditor();
    const tab = (l: string) => wrapper.get(`[data-test="name-tab-${l}"]`);
    expect(tab('ru').attributes('tabindex')).toBe('0');
    expect(tab('be').attributes('tabindex')).toBe('-1');

    await tab('ru').trigger('keydown', { key: 'ArrowRight' });
    expect(tab('be').attributes('aria-selected')).toBe('true');
    expect(tab('be').attributes('tabindex')).toBe('0');
    expect(tab('ru').attributes('tabindex')).toBe('-1');

    // ArrowLeft from the first tab wraps to the last.
    await tab('ru').trigger('keydown', { key: 'ArrowLeft' });
    expect(tab('en').attributes('aria-selected')).toBe('true');
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
    expect(overridden.find('[data-test="revert-birth"]').exists()).toBe(true);
    const plain = await mountEditor(emptyProfile);
    expect(plain.find('[data-test="revert-vocation"]').exists()).toBe(false);
  });

  it('reset marks the field to submit null', async () => {
    const wrapper = await mountEditor({ ...emptyProfile, birthYear: 1901 });
    vi.mocked(putProfile).mockResolvedValue(detail());
    await wrapper.get('[data-test="revert-birth"]').trigger('click');
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

  it('shows a distinct load-failure message and keeps Save disabled when the override fails to load', async () => {
    vi.mocked(getProfile).mockRejectedValue(new Error('network'));
    const d = detail();
    const wrapper = mount(MemberFieldsEditor, { props: { personId: d.id, detail: d }, global: { plugins: [i18n] } });
    await flushPromises();
    await wrapper.get('[data-test="field-birthYear"]').setValue('1902');
    expect(wrapper.get('[data-test="fields-error"]').text()).toBe(i18n.global.t('members.loadFailed'));
    expect((wrapper.get('[data-test="fields-save"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders a reset control for every overridden field', async () => {
    const all: PersonProfile = {
      givenName: { ru: 'Г', be: 'Г', en: 'G' }, surname: { ru: 'С', be: 'С', en: 'S' },
      maidenName: { ru: 'М', be: null, en: null }, middleName: { ru: 'О', be: null, en: null }, sex: 'male', birthYear: 1901, birthMonth: 5, birthDay: 3, deathYear: 1980, deathMonth: 6, deathDay: 12, vocation: 'writer'
    };
    const wrapper = await mountEditor(all);
    const scalarFields = ['givenName', 'surname', 'maidenName', 'middleName', 'sex', 'vocation'];
    for (const f of scalarFields) {
      expect(wrapper.find(`[data-test="revert-${f}"]`).exists()).toBe(true);
      expect((wrapper.get(`[data-test="field-${f}"]`).element as HTMLInputElement).disabled).toBe(false);
    }
    expect(wrapper.find('[data-test="revert-birth"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="revert-death"]').exists()).toBe(true);
    // Toggle each scalar reset → its input disables.
    for (const f of scalarFields) {
      await wrapper.get(`[data-test="revert-${f}"]`).trigger('click');
      expect((wrapper.get(`[data-test="field-${f}"]`).element as HTMLInputElement).disabled).toBe(true);
    }
    // Toggle the birth reset → all three birth inputs disable.
    await wrapper.get('[data-test="revert-birth"]').trigger('click');
    for (const p of ['birthYear', 'birthMonth', 'birthDay']) {
      expect((wrapper.get(`[data-test="field-${p}"]`).element as HTMLInputElement).disabled).toBe(true);
    }
  });

  it('toggling reset a second time re-enables the field', async () => {
    const wrapper = await mountEditor({ ...emptyProfile, birthYear: 1901 });
    const input = () => wrapper.get('[data-test="field-birthYear"]').element as HTMLInputElement;
    await wrapper.get('[data-test="revert-birth"]').trigger('click');
    expect(input().disabled).toBe(true);
    await wrapper.get('[data-test="revert-birth"]').trigger('click');
    expect(input().disabled).toBe(false);
  });

  it('edits a name locale via its tab and overrides only that locale', async () => {
    const wrapper = await mountEditor();
    vi.mocked(putProfile).mockResolvedValue(detail());
    await wrapper.get('[data-test="name-tab-en"]').trigger('click');
    await wrapper.get('[data-test="field-givenName"]').setValue('Annette');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(putProfile).toHaveBeenCalledWith('p-1', expect.objectContaining({
      givenName: { ru: null, be: null, en: 'Annette' }
    }));
  });

  it('edits every scalar field and submits them all as overrides', async () => {
    const wrapper = await mountEditor();
    vi.mocked(putProfile).mockResolvedValue(detail());
    await wrapper.get('[data-test="field-surname"]').setValue('Новая');
    await wrapper.get('[data-test="field-maidenName"]').setValue('Дев');
    await wrapper.get('[data-test="field-middleName"]').setValue('Отч');
    await wrapper.get('[data-test="field-sex"]').setValue('male');
    await wrapper.get('[data-test="field-vocation"]').setValue('writer');
    await wrapper.get('[data-test="field-deathYear"]').setValue('1985');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(putProfile).toHaveBeenCalledWith('p-1', expect.objectContaining({
      surname: { ru: 'Новая', be: null, en: null },
      maidenName: { ru: 'Дев', be: null, en: null },
      middleName: { ru: 'Отч', be: null, en: null },
      sex: 'male', vocation: 'writer', deathYear: 1985
    }));
  });

  it('clearing a year submits null (inherit seed)', async () => {
    const wrapper = await mountEditor();
    vi.mocked(putProfile).mockResolvedValue(detail());
    await wrapper.get('[data-test="field-birthYear"]').setValue('');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(putProfile).toHaveBeenCalledWith('p-1', expect.objectContaining({ birthYear: null }));
  });

  it('the discard-confirm flow: Keep editing dismisses, Discard emits cancel', async () => {
    const wrapper = await mountEditor();
    await wrapper.get('[data-test="field-birthYear"]').setValue('1902');
    // Cancel with unsaved changes shows the confirm rather than discarding.
    await wrapper.get('[data-test="fields-cancel"]').trigger('click');
    expect(wrapper.find('[data-test="fields-confirm"]').exists()).toBe(true);
    expect(wrapper.emitted('cancel')).toBeFalsy();
    // Keep editing dismisses the confirm.
    await wrapper.get('[data-test="fields-confirm-keep"]').trigger('click');
    expect(wrapper.find('[data-test="fields-confirm"]').exists()).toBe(false);
    // Cancel again, then Discard emits cancel.
    await wrapper.get('[data-test="fields-cancel"]').trigger('click');
    await wrapper.get('[data-test="fields-confirm-discard"]').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('renders per-field and form-level validation errors from a 400', async () => {
    const wrapper = await mountEditor();
    vi.mocked(putProfile).mockRejectedValue(new ProfileSaveError(400, [
      { propertyName: 'Profile.BirthYear', errorMessage: 'out of range' },
      { propertyName: 'Profile', errorMessage: 'Birth year must not be after death year.' }
    ]));
    await wrapper.get('[data-test="field-birthYear"]').setValue('9999');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-test="error-birthDate"]').text()).toBe('out of range');
    expect(wrapper.get('[data-test="error-form"]').text()).toContain('death year');
  });

  it('edits the full birth date and submits year, month, and day', async () => {
    const wrapper = await mountEditor();
    vi.mocked(putProfile).mockResolvedValue(detail());
    await wrapper.get('[data-test="field-birthYear"]').setValue('1902');
    await wrapper.get('[data-test="field-birthMonth"]').setValue('7');
    await wrapper.get('[data-test="field-birthDay"]').setValue('9');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(putProfile).toHaveBeenCalledWith('p-1', expect.objectContaining({
      birthYear: 1902, birthMonth: 7, birthDay: 9
    }));
  });

  it('month and day are disabled until the higher unit is present, and clearing the year cascades', async () => {
    const wrapper = await mountEditor(emptyProfile, detail({
      birth: { year: null, month: null, day: null, approx: false, place: null }
    }));
    expect((wrapper.get('[data-test="field-birthMonth"]').element as HTMLInputElement).disabled).toBe(true);
    await wrapper.get('[data-test="field-birthYear"]').setValue('1901');
    expect((wrapper.get('[data-test="field-birthMonth"]').element as HTMLInputElement).disabled).toBe(false);
    await wrapper.get('[data-test="field-birthMonth"]').setValue('5');
    expect((wrapper.get('[data-test="field-birthDay"]').element as HTMLInputElement).disabled).toBe(false);
    await wrapper.get('[data-test="field-birthDay"]').setValue('3');
    // Clearing the year cascades month + day back to empty.
    await wrapper.get('[data-test="field-birthYear"]').setValue('');
    expect((wrapper.get('[data-test="field-birthMonth"]').element as HTMLInputElement).value).toBe('');
    expect((wrapper.get('[data-test="field-birthDay"]').element as HTMLInputElement).value).toBe('');
  });

  it('clearing the month cascades to clear the day but leaves the year untouched', async () => {
    const wrapper = await mountEditor(emptyProfile, detail({
      birth: { year: null, month: null, day: null, approx: false, place: null }
    }));
    await wrapper.get('[data-test="field-birthYear"]').setValue('1901');
    await wrapper.get('[data-test="field-birthMonth"]').setValue('5');
    await wrapper.get('[data-test="field-birthDay"]').setValue('3');
    // Clearing the month cascades the day back to empty, but not the year.
    await wrapper.get('[data-test="field-birthMonth"]').setValue('');
    expect((wrapper.get('[data-test="field-birthDay"]').element as HTMLInputElement).value).toBe('');
    expect((wrapper.get('[data-test="field-birthYear"]').element as HTMLInputElement).value).toBe('1901');
  });

  it('editing only the month enables Save', async () => {
    const wrapper = await mountEditor();
    expect((wrapper.get('[data-test="fields-save"]').element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.get('[data-test="field-birthMonth"]').setValue('5');
    expect((wrapper.get('[data-test="fields-save"]').element as HTMLButtonElement).disabled).toBe(false);
  });

  it('per-event reset clears the whole birth date override', async () => {
    const wrapper = await mountEditor({ ...emptyProfile, birthYear: 1901, birthMonth: 5, birthDay: 3 });
    vi.mocked(putProfile).mockResolvedValue(detail());
    expect(wrapper.find('[data-test="revert-birth"]').exists()).toBe(true);
    await wrapper.get('[data-test="revert-birth"]').trigger('click');
    await wrapper.get('[data-test="fields-save"]').trigger('click');
    await flushPromises();
    expect(putProfile).toHaveBeenCalledWith('p-1', expect.objectContaining({
      birthYear: null, birthMonth: null, birthDay: null
    }));
  });
});
