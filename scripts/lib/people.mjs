import { readFileSync } from 'node:fs';

// Loads the people array from the API's seed JSON. Thin I/O wrapper.
export function loadPeople(jsonPath) {
  const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  return data.people ?? [];
}

// Pure: returns all people (onlyIds null) or exactly the requested ids in order.
export function selectPeople(people, onlyIds) {
  if (!onlyIds) {
    return people;
  }
  const byId = new Map(people.map((p) => [p.id, p]));
  const missing = onlyIds.filter((id) => !byId.has(id));
  if (missing.length) {
    throw new Error(`Unknown person id(s): ${missing.join(', ')}`);
  }
  return onlyIds.map((id) => byId.get(id));
}
