import type { PersonSummary, Union } from '../types/family';

/**
 * Computes each person's genealogical generation.
 *
 * Bloodline descent drives it: founders (no parent present in `people`) are
 * generation 1; a child is `1 + max(parent generations)`. A person who married
 * into the family (`marriedIntoFamily`, typically with no recorded parents) takes
 * the generation of their spouse instead of defaulting to 1 — so a spouse who
 * married a fourth-generation member is placed in generation 4, not lumped in with
 * the founders. With more than one spouse, the earliest (minimum) spouse generation
 * wins. Cycle-safe: a parent/spouse chain that loops back is broken at the repeated id.
 */
export function computeGenerations(people: PersonSummary[], unions: Union[] = []): Map<string, number> {
  const byId = new Map(people.map(person => [person.id, person]));
  const spousesOf = new Map<string, string[]>();
  for (const union of unions) {
    for (const id of union.partnerIds) {
      const others = union.partnerIds.filter(other => other !== id && byId.has(other));
      if (others.length > 0) {
        spousesOf.set(id, [...(spousesOf.get(id) ?? []), ...others]);
      }
    }
  }

  const generations = new Map<string, number>();

  const resolve = (id: string, visiting: Set<string>): number => {
    const cached = generations.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const person = byId.get(id);
    if (!person || visiting.has(id)) {
      return 1;
    }
    visiting.add(id);

    const parentIds = [person.parents.motherId, person.parents.fatherId].filter(
      (parentId): parentId is string => parentId != null && byId.has(parentId)
    );

    let generation: number;
    if (parentIds.length > 0) {
      generation = 1 + Math.max(...parentIds.map(parentId => resolve(parentId, visiting)));
    } else if (person.marriedIntoFamily) {
      const spouseGens = (spousesOf.get(id) ?? []).map(spouseId => resolve(spouseId, visiting));
      generation = spouseGens.length > 0 ? Math.min(...spouseGens) : 1;
    } else {
      generation = 1;
    }

    visiting.delete(id);
    generations.set(id, generation);
    return generation;
  };

  for (const person of people) {
    resolve(person.id, new Set());
  }

  return generations;
}

/** Sorted, distinct generation numbers present in a `computeGenerations` result. */
export function generationOptions(gens: Map<string, number>): number[] {
  return [...new Set(gens.values())].sort((a, b) => a - b);
}
