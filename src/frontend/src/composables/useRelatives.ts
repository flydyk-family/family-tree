import type { PersonSummary, Union } from '../types/family';

export interface Relatives {
  parents: PersonSummary[];
  siblings: PersonSummary[];
  spouses: PersonSummary[];
  children: PersonSummary[];
}

const EMPTY: Relatives = { parents: [], siblings: [], spouses: [], children: [] };

function byBirthThenId(a: PersonSummary, b: PersonSummary): number {
  const ay = a.birthYear ?? Number.POSITIVE_INFINITY;
  const by = b.birthYear ?? Number.POSITIVE_INFINITY;
  return ay !== by ? ay - by : a.id.localeCompare(b.id);
}

/**
 * Derives a person's immediate family from the flat people list + unions.
 * Siblings share at least one parent id (half-siblings included). Pure and side-effect free
 * so it is unit-testable and reusable by the future add/remove-relative flow (cut 2).
 */
export function deriveRelatives(personId: string, people: PersonSummary[], unions: Union[]): Relatives {
  const byId = new Map(people.map(person => [person.id, person]));
  const self = byId.get(personId);
  if (!self) {
    return { ...EMPTY };
  }

  const parentIds = [self.parents.fatherId, self.parents.motherId].filter((id): id is string => id !== null);
  const parents = parentIds.map(id => byId.get(id)).filter((x): x is PersonSummary => x !== undefined);

  const parentIdSet = new Set(parentIds);
  const siblings = parentIds.length === 0
    ? []
    : people.filter(candidate =>
        candidate.id !== personId &&
        (
          (candidate.parents.fatherId !== null && parentIdSet.has(candidate.parents.fatherId)) ||
          (candidate.parents.motherId !== null && parentIdSet.has(candidate.parents.motherId))
        )
      ).sort(byBirthThenId);

  const spouseIds = new Set<string>();
  const childIds = new Set<string>();
  for (const union of unions) {
    if (!union.partnerIds.includes(personId)) {
      continue;
    }
    for (const partnerId of union.partnerIds) {
      if (partnerId !== personId) {
        spouseIds.add(partnerId);
      }
    }
    for (const c of union.childIds) {
      childIds.add(c);
    }
  }

  const resolve = (ids: Set<string>): PersonSummary[] =>
    [...ids].map(id => byId.get(id)).filter((x): x is PersonSummary => x !== undefined).sort(byBirthThenId);

  return { parents, siblings, spouses: resolve(spouseIds), children: resolve(childIds) };
}
