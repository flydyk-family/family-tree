import type { LocalizedText, PersonSummary } from '../types/family';

// Latin renderings of the Cyrillic alphabets (ru + be), lowercase. Used only as a
// fallback when a person has no English name; need not be reversible, only stable.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
  з: 'z', і: 'i', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ў: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  '\'': '', '’': ''
};

// Latin letters with strokes/ligatures that Unicode NFD does not decompose.
const SPECIAL_LATIN: Record<string, string> = {
  ł: 'l', đ: 'd', ø: 'o', ß: 'ss', æ: 'ae', œ: 'oe'
};

function asciiFold(text: string): string {
  // NFD splits accented letters into base char + combining marks; drop the marks.
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function slugifyText(raw: string): string {
  const mapped = [...raw.toLowerCase()]
    .map(ch => SPECIAL_LATIN[ch] ?? CYRILLIC_TO_LATIN[ch] ?? ch)
    .join('');
  return asciiFold(mapped)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugifyName(name: LocalizedText): string {
  const source = (name.en ?? name.ru ?? name.be ?? '').trim();
  return slugifyText(source);
}

/** Build the canonical friendly slug: `<given>-<middle>-<surname>-<birthYear>-<id>`
 *  (the middle-name/patronymic segment is omitted when the person has none). */
export function personSlug(person: PersonSummary): string {
  const name = [
    slugifyName(person.givenName),
    person.middleName ? slugifyName(person.middleName) : '',
    slugifyName(person.surname)
  ]
    .filter(Boolean)
    .join('-');
  const year = person.birthYear != null ? String(person.birthYear) : '';
  return [name, year, person.id].filter(Boolean).join('-');
}

/**
 * Recover the person id (`p-<digits>`) from a slug, or null if absent.
 * Case-insensitive and normalised to lowercase so a hand-edited or
 * copy-paste-mangled URL (`…-P-0003`) still resolves to the stored id.
 */
export function extractPersonId(slug: string | null | undefined): string | null {
  if (!slug) {
    return null;
  }
  const match = slug.match(/p-\d+$/i);
  return match ? match[0].toLowerCase() : null;
}
