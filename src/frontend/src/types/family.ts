export interface LocalizedText {
  ru: string | null;
  be: string | null;
  en: string | null;
}

export interface ParentsRef {
  motherId: string | null;
  fatherId: string | null;
}

export interface PersonSummary {
  id: string;
  givenName: LocalizedText;
  surname: LocalizedText;
  maidenName: LocalizedText | null;
  sex: string;
  birthYear: number | null;
  deathYear: number | null;
  birthPlace: LocalizedText | null;
  vocation: string;
  portrait: string | null;
  portraitThumb?: string | null;
  portraitVideo: string | null;
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

export interface LifeEvent {
  year: number | null;
  month: number | null;
  day: number | null;
  approx: boolean;
  place: LocalizedText | null;
}

export interface Residence {
  place: LocalizedText;
  fromYear: number | null;
  toYear: number | null;
  mapUrl: string | null;
}

export interface SocialLink {
  type: string;
  url: string;
}

export interface Photo {
  id: string;
  full: string;
  thumb: string;
}

export interface PersonDetail {
  id: string;
  givenName: LocalizedText;
  surname: LocalizedText;
  maidenName: LocalizedText | null;
  sex: string;
  birth: LifeEvent;
  death: LifeEvent | null;
  vocation: string;
  summary: LocalizedText | null;
  biography: LocalizedText | null;
  portrait: string | null;
  portraitThumb?: string | null;
  portraitVideo: string | null;
  gallery: Photo[];
  links: SocialLink[];
  residences: Residence[];
  parents: ParentsRef;
  marriedIntoFamily: boolean;
  isDefaultRoot: boolean;
}
