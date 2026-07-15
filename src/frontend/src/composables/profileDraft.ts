import type { LocalizedText, PersonDetail } from '../types/family';
import type { PersonProfile } from '../api/profileApi';

export type ProfileField =
  | 'givenName' | 'surname' | 'maidenName' | 'sex'
  | 'birthYear' | 'birthMonth' | 'birthDay'
  | 'deathYear' | 'deathMonth' | 'deathDay'
  | 'vocation';

export const NAME_FIELDS = ['givenName', 'surname', 'maidenName'] as const;
type NameField = (typeof NAME_FIELDS)[number];
const LOCALES = ['ru', 'be', 'en'] as const;

/** Editable buffer: name locales are '' (never null) so they bind cleanly to inputs. */
export interface ProfileDraft {
  givenName: LocalizedText;
  surname: LocalizedText;
  maidenName: LocalizedText;
  sex: string;
  birthYear: number | null;
  birthMonth: number | null;
  birthDay: number | null;
  deathYear: number | null;
  deathMonth: number | null;
  deathDay: number | null;
  vocation: string;
}

function seedName(text: LocalizedText | null): LocalizedText {
  return { ru: text?.ru ?? '', be: text?.be ?? '', en: text?.en ?? '' };
}

export function seedDraft(detail: PersonDetail): ProfileDraft {
  return {
    givenName: seedName(detail.givenName),
    surname: seedName(detail.surname),
    maidenName: seedName(detail.maidenName),
    sex: detail.sex,
    birthYear: detail.birth?.year ?? null,
    birthMonth: detail.birth?.month ?? null,
    birthDay: detail.birth?.day ?? null,
    deathYear: detail.death?.year ?? null,
    deathMonth: detail.death?.month ?? null,
    deathDay: detail.death?.day ?? null,
    vocation: detail.vocation
  };
}

function isNameField(field: ProfileField): field is NameField {
  return (NAME_FIELDS as readonly string[]).includes(field);
}

export function isOverridden(base: PersonProfile, field: ProfileField): boolean {
  const value = base[field];
  if (value === null || value === undefined) {
    return false;
  }
  if (isNameField(field)) {
    const text = value as LocalizedText;
    return LOCALES.some(l => (text[l] ?? '') !== '');
  }
  return true;
}

// Overlay the changed locales of a name field onto its current override base.
function buildName(
  baseText: LocalizedText | null,
  draft: LocalizedText,
  original: LocalizedText
): LocalizedText | null {
  const result: LocalizedText = {
    ru: baseText?.ru ?? null,
    be: baseText?.be ?? null,
    en: baseText?.en ?? null
  };
  let touched = false;
  for (const l of LOCALES) {
    if (draft[l] !== original[l]) {
      touched = true;
      result[l] = (draft[l] ?? '').trim() || null;
    }
  }
  if (!touched) {
    return baseText ?? null;
  }
  const anyValue = LOCALES.some(l => (result[l] ?? '') !== '');
  return anyValue ? result : null;
}

export function buildProfilePayload(
  base: PersonProfile,
  draft: ProfileDraft,
  original: ProfileDraft,
  reverted: ReadonlySet<ProfileField>
): PersonProfile {
  const scalar = <T>(field: ProfileField, draftValue: T, originalValue: T, baseValue: T | null): T | null => {
    if (reverted.has(field)) {
      return null;
    }
    if (draftValue === originalValue) {
      return baseValue ?? null;
    }
    return draftValue;
  };

  const name = (field: NameField): LocalizedText | null => {
    if (reverted.has(field)) {
      return null;
    }
    return buildName(base[field], draft[field], original[field]);
  };

  return {
    givenName: name('givenName'),
    surname: name('surname'),
    maidenName: name('maidenName'),
    sex: scalar('sex', draft.sex, original.sex, base.sex),
    birthYear: scalar('birthYear', draft.birthYear, original.birthYear, base.birthYear),
    birthMonth: scalar('birthMonth', draft.birthMonth, original.birthMonth, base.birthMonth),
    birthDay: scalar('birthDay', draft.birthDay, original.birthDay, base.birthDay),
    deathYear: scalar('deathYear', draft.deathYear, original.deathYear, base.deathYear),
    deathMonth: scalar('deathMonth', draft.deathMonth, original.deathMonth, base.deathMonth),
    deathDay: scalar('deathDay', draft.deathDay, original.deathDay, base.deathDay),
    vocation: scalar('vocation', draft.vocation, original.vocation, base.vocation)
  };
}
