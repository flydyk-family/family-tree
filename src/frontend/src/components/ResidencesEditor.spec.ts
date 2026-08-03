import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ResidencesEditor from './ResidencesEditor.vue';
import type { PersonDetail } from '../types/family';
import { ProfileSaveError } from '../api/profileApi';

const getProfile = vi.fn();
const putProfile = vi.fn();
vi.mock('../api/profileApi', () => ({
  getProfile: (...a: unknown[]) => getProfile(...a),
  putProfile: (...a: unknown[]) => putProfile(...a),
  ProfileSaveError: class extends Error {
    status: number;
    fieldErrors: unknown[];
    constructor(status: number, fieldErrors: unknown[]) {
      super();
      this.status = status;
      this.fieldErrors = fieldErrors;
    }
  }
}));
vi.mock('./MapPicker.vue', () => ({ default: { name: 'MapPicker', template: '<div data-test="map-picker-stub" />', props: ['modelValue'] } }));

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false });

function detail(residences: PersonDetail['residences'] = []): PersonDetail {
  return {
    id: 'p-1', givenName: { ru: '', be: '', en: 'A' }, surname: { ru: '', be: '', en: 'B' },
    maidenName: null, middleName: null, sex: 'female',
    birth: { year: 1900, month: null, day: null, approx: false, place: null }, death: null,
    vocation: 'other', summary: null, biography: null, portrait: null, portraitVideo: null,
    gallery: [], links: [], residences, parents: { motherId: null, fatherId: null },
    marriedIntoFamily: false, isDefaultRoot: false
  } as PersonDetail;
}

const emptyOverride = { givenName: null, surname: null, maidenName: null, middleName: null, sex: null, birthYear: null, birthMonth: null, birthDay: null, deathYear: null, deathMonth: null, deathDay: null, vocation: null, residences: null };

beforeEach(() => { getProfile.mockReset(); putProfile.mockReset(); });

describe('ResidencesEditor', () => {
  it('PUTs residences merged onto the current override base, preserving scalar overrides', async () => {
    getProfile.mockResolvedValue({ ...emptyOverride, birthYear: 1901 });
    putProfile.mockResolvedValue(detail());
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail() }, global: { plugins: [i18n] } });
    await Promise.resolve(); await Promise.resolve();

    await w.find('[data-test="add-residence"]').trigger('click');
    await w.find('[data-test="place-en-0"]').setValue('Kraków');
    await w.find('[data-test="residences-save"]').trigger('click');
    await Promise.resolve();

    expect(putProfile).toHaveBeenCalledTimes(1);
    const payload = putProfile.mock.calls[0][1];
    expect(payload.birthYear).toBe(1901);
    expect(payload.residences).toHaveLength(1);
    expect(payload.residences[0].place.en).toBe('Kraków');
  });

  it('reverts to seed by sending residences: null', async () => {
    getProfile.mockResolvedValue({ ...emptyOverride, residences: [{ place: { ru: null, be: null, en: 'Old' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null }] });
    putProfile.mockResolvedValue(detail());
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail([{ place: { ru: null, be: null, en: 'Old' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null }]) }, global: { plugins: [i18n] } });
    await Promise.resolve(); await Promise.resolve();

    await w.find('[data-test="residences-revert"]').trigger('click');
    await w.find('[data-test="residences-save"]').trigger('click');
    await Promise.resolve();

    expect(putProfile.mock.calls[0][1].residences).toBeNull();
  });

  it('keeps the rows on screen when a revert is queued, rather than blanking the list', async () => {
    // The seed list isn't fetchable client-side, so an emptied list would read as
    // "the seed is empty". The rows stay visible, marked as about to be discarded.
    const residences = [{ place: { ru: null, be: null, en: 'Old' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null }];
    getProfile.mockResolvedValue({ ...emptyOverride, residences });
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail(residences) }, global: { plugins: [i18n] } });
    await flushPromises();

    await w.find('[data-test="residences-revert"]').trigger('click');

    expect(w.find('[data-test="residences-revert-notice"]').exists()).toBe(true);
    expect((w.find('[data-test="place-en-0"]').element as HTMLInputElement).value).toBe('Old');
    expect(w.find('[data-test="add-residence"]').exists()).toBe(false);
    expect(w.find('[data-test="residences-revert"]').exists()).toBe(false);
  });

  it('undoes a queued revert, restoring the normal editing controls and saving the rows again', async () => {
    const residences = [{ place: { ru: null, be: null, en: 'Old' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null }];
    getProfile.mockResolvedValue({ ...emptyOverride, residences });
    putProfile.mockResolvedValue(detail());
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail(residences) }, global: { plugins: [i18n] } });
    await flushPromises();

    await w.find('[data-test="residences-revert"]').trigger('click');
    await w.find('[data-test="residences-revert-undo"]').trigger('click');

    expect(w.find('[data-test="residences-revert-notice"]').exists()).toBe(false);
    expect(w.find('[data-test="add-residence"]').exists()).toBe(true);

    await w.find('[data-test="residences-save"]').trigger('click');
    await flushPromises();

    // Undo must clear the queued null, so the visible rows are what gets saved.
    expect(putProfile.mock.calls[0][1].residences).toHaveLength(1);
  });

  it('keeps the open map picker bound to its own row when an earlier row is removed', async () => {
    const residences = [
      { place: { ru: null, be: null, en: 'First' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null },
      { place: { ru: null, be: null, en: 'Second' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null },
      { place: { ru: null, be: null, en: 'Third' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null },
      { place: { ru: null, be: null, en: 'Fourth' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null }
    ];
    getProfile.mockResolvedValue({ ...emptyOverride, residences });
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail(residences) }, global: { plugins: [i18n] } });
    await Promise.resolve(); await Promise.resolve();

    // Open the picker on row 2 ("Third"), then remove row 0 ("First") which
    // shifts every later row down by one.
    await w.find('[data-test="pick-2"]').trigger('click');
    await w.find('[data-test="remove-0"]').trigger('click');

    const stubs = w.findAll('[data-test="map-picker-stub"]');
    expect(stubs).toHaveLength(1);
    const row = stubs[0].element.closest('.res-editor__row');
    if (row === null) {
      throw new Error('expected the open picker to be nested inside a residence row');
    }
    const placeInput = row.querySelector('input[data-test^="place-en-"]');
    if (!(placeInput instanceof HTMLInputElement)) {
      throw new Error('expected the residence row to contain its English place input');
    }
    // The picker must still target "Third" (now shifted to index 1), not
    // "Fourth" (which drifted into the stale index 2).
    expect(placeInput.value).toBe('Third');
  });

  it('sends fromYear as null (not "") when a typed year is cleared before saving', async () => {
    getProfile.mockResolvedValue({ ...emptyOverride });
    putProfile.mockResolvedValue(detail());
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail() }, global: { plugins: [i18n] } });
    await Promise.resolve(); await Promise.resolve();

    await w.find('[data-test="add-residence"]').trigger('click');
    await w.find('[data-test="place-en-0"]').setValue('Kraków');
    const fromInput = w.find('[data-test="from-0"]');
    await fromInput.setValue('1900');
    await fromInput.setValue('');
    await w.find('[data-test="residences-save"]').trigger('click');
    await Promise.resolve();

    expect(putProfile).toHaveBeenCalledTimes(1);
    const payload = putProfile.mock.calls[0][1];
    expect(payload.residences[0].fromYear).toBeNull();
  });

  it('cancels immediately when there are no unsaved changes', async () => {
    getProfile.mockResolvedValue({ ...emptyOverride });
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail() }, global: { plugins: [i18n] } });
    await Promise.resolve(); await Promise.resolve();

    await w.find('[data-test="residences-cancel"]').trigger('click');

    expect(w.emitted('cancel')).toBeTruthy();
    expect(w.find('[data-test="residences-confirm"]').exists()).toBe(false);
  });

  it('cancels immediately when the person already has residences and nothing was edited', async () => {
    // seedRows() mints a fresh client-side id per call, and rows/originalRows are seeded
    // by two separate calls — so an id-sensitive dirty check reports every such person as
    // dirty the moment the editor mounts, and Cancel wrongly prompts to discard.
    getProfile.mockResolvedValue({ ...emptyOverride });
    const existing = [
      { place: { ru: 'Мінск', be: 'Мінск', en: 'Minsk' }, fromYear: 1920, toYear: 1930, lat: 53.9, lng: 27.56, mapUrl: null }
    ] as PersonDetail['residences'];
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail(existing) }, global: { plugins: [i18n] } });
    await flushPromises();

    await w.find('[data-test="residences-cancel"]').trigger('click');

    expect(w.find('[data-test="residences-confirm"]').exists()).toBe(false);
    expect(w.emitted('cancel')).toBeTruthy();
  });

  it('confirms before discarding unsaved changes, and keeps editing if declined', async () => {
    getProfile.mockResolvedValue({ ...emptyOverride });
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail() }, global: { plugins: [i18n] } });
    await Promise.resolve(); await Promise.resolve();

    await w.find('[data-test="add-residence"]').trigger('click');
    await w.find('[data-test="place-en-0"]').setValue('Kraków');
    await w.find('[data-test="residences-cancel"]').trigger('click');

    expect(w.emitted('cancel')).toBeFalsy();
    expect(w.find('[data-test="residences-confirm"]').exists()).toBe(true);

    await w.find('[data-test="residences-confirm-keep"]').trigger('click');
    expect(w.emitted('cancel')).toBeFalsy();
    expect(w.find('[data-test="residences-confirm"]').exists()).toBe(false);
    expect(w.find('[data-test="place-en-0"]').element).toBeTruthy(); // row survives

    await w.find('[data-test="residences-cancel"]').trigger('click');
    await w.find('[data-test="residences-confirm-discard"]').trigger('click');
    expect(w.emitted('cancel')).toBeTruthy();
  });

  describe('focus management', () => {
    it('moves focus to "Keep editing" on opening the discard dialog, back to Cancel on dismiss, and to Add residence after row removal', async () => {
      getProfile.mockResolvedValue({ ...emptyOverride });
      const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail() }, global: { plugins: [i18n] }, attachTo: document.body });
      await Promise.resolve(); await Promise.resolve();

      await w.find('[data-test="add-residence"]').trigger('click');
      await w.find('[data-test="place-en-0"]').setValue('Kraków');

      await w.find('[data-test="residences-cancel"]').trigger('click');
      await Promise.resolve(); await Promise.resolve();
      expect(document.activeElement).toBe(w.find('[data-test="residences-confirm-keep"]').element);

      await w.find('[data-test="residences-confirm-keep"]').trigger('click');
      await Promise.resolve(); await Promise.resolve();
      expect(document.activeElement).toBe(w.find('[data-test="residences-cancel"]').element);

      await w.find('[data-test="remove-0"]').trigger('click');
      await Promise.resolve(); await Promise.resolve();
      expect(document.activeElement).toBe(w.find('[data-test="add-residence"]').element);

      w.unmount();
    });
  });

  it('applies a picked place onto the row, only overwriting locales the picker actually resolved', async () => {
    getProfile.mockResolvedValue({ ...emptyOverride });
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail() }, global: { plugins: [i18n] } });
    await Promise.resolve(); await Promise.resolve();

    await w.find('[data-test="add-residence"]').trigger('click');
    await w.find('[data-test="place-ru-0"]').setValue('Старое');
    await w.find('[data-test="pick-0"]').trigger('click');

    const picker = w.findComponent({ name: 'MapPicker' });
    expect(picker.exists()).toBe(true);
    await picker.vm.$emit('update:modelValue', {
      lat: 48.8566, lng: 2.3522,
      place: { ru: '', be: 'Парыж', en: 'Paris' }, // ru left unresolved by the picker
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=48.8566,2.3522'
    });

    expect((w.find('[data-test="place-ru-0"]').element as HTMLInputElement).value).toBe('Старое'); // untouched
    expect((w.find('[data-test="place-be-0"]').element as HTMLInputElement).value).toBe('Парыж');
    expect((w.find('[data-test="place-en-0"]').element as HTMLInputElement).value).toBe('Paris');
  });

  it('closes the picker if the row whose picker is open is removed', async () => {
    const residences = [{ place: { ru: null, be: null, en: 'Only' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null }];
    getProfile.mockResolvedValue({ ...emptyOverride, residences });
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail(residences) }, global: { plugins: [i18n] } });
    await Promise.resolve(); await Promise.resolve();

    await w.find('[data-test="pick-0"]').trigger('click');
    expect(w.find('[data-test="map-picker-stub"]').exists()).toBe(true);

    await w.find('[data-test="remove-0"]').trigger('click');

    expect(w.find('[data-test="map-picker-stub"]').exists()).toBe(false);
  });

  it('shows a rejected row’s message against that row, not as a detached form error', async () => {
    getProfile.mockResolvedValue({ ...emptyOverride });
    const err = new ProfileSaveError(400, [
      { propertyName: 'Profile.Residences[0].Place', errorMessage: 'A residence must have a place name in at least one locale.' }
    ]);
    putProfile.mockRejectedValue(err);
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail() }, global: { plugins: [i18n] } });
    await flushPromises();

    await w.find('[data-test="add-residence"]').trigger('click');
    await w.find('[data-test="residences-save"]').trigger('click');
    await flushPromises();

    expect(w.find('[data-test="row-error-0"]').exists()).toBe(true);
    expect(w.find('[data-test="row-error-0"]').text()).toContain('at least one locale');
    // A row-scoped message is not repeated as a form-level one, and the generic
    // fallback must not pile on underneath it either.
    expect(w.find('[data-test="residences-form-error"]').exists()).toBe(false);
    expect(w.find('[data-test="residences-error"]').exists()).toBe(false);
  });

  it('routes each message to its own row when several rows are rejected at once', async () => {
    const residences = [
      { place: { ru: null, be: null, en: 'A' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null },
      { place: { ru: null, be: null, en: 'B' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null },
      { place: { ru: null, be: null, en: 'C' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null }
    ];
    getProfile.mockResolvedValue({ ...emptyOverride, residences });
    putProfile.mockRejectedValue(new ProfileSaveError(400, [
      { propertyName: 'Profile.Residences[0].Lat', errorMessage: 'Latitude out of range.' },
      { propertyName: 'Profile.Residences[2]', errorMessage: 'From year must not be after to year.' }
    ]));
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail(residences) }, global: { plugins: [i18n] } });
    await flushPromises();

    await w.find('[data-test="residences-save"]').trigger('click');
    await flushPromises();

    expect(w.find('[data-test="row-error-0"]').text()).toContain('Latitude out of range.');
    expect(w.find('[data-test="row-error-1"]').exists()).toBe(false);
    expect(w.find('[data-test="row-error-2"]').text()).toContain('From year must not be after to year.');
  });

  it('keeps a non-residence rejection at form level rather than pinning it to a row', async () => {
    getProfile.mockResolvedValue({ ...emptyOverride });
    putProfile.mockRejectedValue(new ProfileSaveError(400, [
      { propertyName: 'Profile.BirthYear', errorMessage: 'Birth year is out of range.' }
    ]));
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail() }, global: { plugins: [i18n] } });
    await flushPromises();

    await w.find('[data-test="add-residence"]').trigger('click');
    await w.find('[data-test="residences-save"]').trigger('click');
    await flushPromises();

    expect(w.find('[data-test="residences-form-error"]').text()).toContain('Birth year is out of range.');
    expect(w.find('[data-test="row-error-0"]').exists()).toBe(false);
  });

  it('drops stale row errors when a row is removed, so no message points at the wrong row', async () => {
    const residences = [
      { place: { ru: null, be: null, en: 'A' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null },
      { place: { ru: null, be: null, en: 'B' }, fromYear: null, toYear: null, lat: null, lng: null, mapUrl: null }
    ];
    getProfile.mockResolvedValue({ ...emptyOverride, residences });
    putProfile.mockRejectedValue(new ProfileSaveError(400, [
      { propertyName: 'Profile.Residences[1].Lat', errorMessage: 'Latitude out of range.' }
    ]));
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail(residences) }, global: { plugins: [i18n] } });
    await flushPromises();

    await w.find('[data-test="residences-save"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-test="row-error-1"]').exists()).toBe(true);

    // Removing row 0 shifts the offending row to index 0; the old key would now
    // label the wrong row, so every row error is cleared instead.
    await w.find('[data-test="remove-0"]').trigger('click');

    expect(w.find('[data-test="row-error-0"]').exists()).toBe(false);
    expect(w.find('[data-test="row-error-1"]').exists()).toBe(false);
  });

  it('shows the generic error (no field error) when the save fails for a non-validation reason', async () => {
    getProfile.mockResolvedValue({ ...emptyOverride });
    putProfile.mockRejectedValue(new Error('network down'));
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail() }, global: { plugins: [i18n] } });
    await Promise.resolve(); await Promise.resolve();

    await w.find('[data-test="add-residence"]').trigger('click');
    await w.find('[data-test="residences-save"]').trigger('click');
    await Promise.resolve();

    expect(w.find('[data-test="residences-error"]').exists()).toBe(true);
    expect(w.find('[data-test="residences-form-error"]').exists()).toBe(false);
  });

  it('shows a load error and keeps Save disabled when the initial profile fetch fails', async () => {
    getProfile.mockRejectedValue(new Error('network down'));
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail() }, global: { plugins: [i18n] } });
    await flushPromises();

    expect(w.find('[data-test="residences-error"]').text()).toBeTruthy();
    expect((w.find('[data-test="residences-save"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('binds every place locale and both year fields to the row', async () => {
    getProfile.mockResolvedValue({ ...emptyOverride });
    putProfile.mockResolvedValue(detail());
    const w = mount(ResidencesEditor, { props: { personId: 'p-1', detail: detail() }, global: { plugins: [i18n] } });
    await Promise.resolve(); await Promise.resolve();

    await w.find('[data-test="add-residence"]').trigger('click');
    await w.find('[data-test="place-be-0"]').setValue('Кракаў');
    await w.find('[data-test="to-0"]').setValue('1910');
    await w.find('[data-test="residences-save"]').trigger('click');
    await Promise.resolve();

    const payload = putProfile.mock.calls[0][1];
    expect(payload.residences[0].place.be).toBe('Кракаў');
    expect(payload.residences[0].toYear).toBe(1910);
  });
});
