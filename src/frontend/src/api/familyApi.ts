import type { FamilyGraph, PersonDetail } from '../types/family';

/** API root for a family: the unprefixed alias routes for null (the default family). */
export function familyApiRoot(familyId: string | null, baseUrl = ''): string {
  return familyId ? `${baseUrl}/api/families/${encodeURIComponent(familyId)}` : `${baseUrl}/api`;
}

export async function fetchFamilyGraph(familyId: string | null, baseUrl = ''): Promise<FamilyGraph> {
  const url = familyId ? `${familyApiRoot(familyId, baseUrl)}/graph` : `${baseUrl}/api/family/graph`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load family graph: ${response.status}`);
  }
  return (await response.json()) as FamilyGraph;
}

export async function fetchPerson(familyId: string | null, id: string, baseUrl = ''): Promise<PersonDetail> {
  const response = await fetch(`${familyApiRoot(familyId, baseUrl)}/people/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to load person ${id}: ${response.status}`);
  }
  return (await response.json()) as PersonDetail;
}
