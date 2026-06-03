export interface ParentsRef {
  motherId: string | null;
  fatherId: string | null;
}

export interface PersonSummary {
  id: string;
  givenName: string;
  surname: string;
  maidenName: string | null;
  sex: string;
  birthYear: number | null;
  deathYear: number | null;
  vocation: string;
  portrait: string | null;
  parents: ParentsRef;
  marriedIntoFamily: boolean;
  isDefaultRoot: boolean;
}

export interface Union {
  id: string;
  partnerIds: string[];
  marriageYear: number | null;
  childIds: string[];
}

export interface FamilyGraph {
  people: PersonSummary[];
  unions: Union[];
}
