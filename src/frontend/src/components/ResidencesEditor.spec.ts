import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import ResidencesEditor from './ResidencesEditor.vue';
import type { PersonDetail } from '../types/family';

const getProfile = vi.fn();
const putProfile = vi.fn();
vi.mock('../api/profileApi', () => ({
  getProfile: (...a: unknown[]) => getProfile(...a),
  putProfile: (...a: unknown[]) => putProfile(...a),
  ProfileSaveError: class extends Error { fieldErrors: unknown[] = []; status = 400; }
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
});
