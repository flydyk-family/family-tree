import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, type RouteLocationRaw } from 'vue-router';
import { useFamiliesStore } from '../stores/familiesStore';
import { useLocaleStore } from '../stores/localeStore';
import { localize } from '../i18n/localize';
import { activeFamilyId, familyLocation } from '../router/familyRoutes';
import type { FamilyLinkRef, PersonDetail } from '../types/family';

export interface FamilyLinks {
  /** The person's links that can be followed from the family currently shown. */
  links: ComputedRef<FamilyLinkRef[]>;
  /** The button label: "{name} family tree", or the sex-specific "joined" wording. */
  label: (link: FamilyLinkRef) => string;
  /** Where following the link goes: the counterpart person, or the other family's tree. */
  target: (link: FamilyLinkRef) => RouteLocationRaw;
}

/** Gendered "joined" wording; any other sex falls back to the neutral form. */
const JOINED_KEYS: Record<string, string> = { male: 'family.openJoinedMale', female: 'family.openJoinedFemale' };

/**
 * Cross-family links for a person card or dossier. Call in `setup`; `getDetail` may return null
 * while the host is still loading.
 */
export function useFamilyLinks(getDetail: () => PersonDetail | null): FamilyLinks {
  const { t } = useI18n({ useScope: 'global' });
  const families = useFamiliesStore();
  const localeStore = useLocaleStore();
  const route = useRoute();

  // Only links whose family is registered and isn't the family already shown: a button that cannot
  // resolve, or that points back at the current tree, is worse than none.
  const links = computed(() => {
    const activeFamily = activeFamilyId(route) ?? families.defaultFamilyId;
    return (getDetail()?.familyLinks ?? []).filter(link => families.isKnown(link.family) && link.family !== activeFamily);
  });

  function label(link: FamilyLinkRef): string {
    const family = families.familyById(link.family);
    const name = (family && localize(family.name, localeStore.currentLocale)) || link.family;
    if (link.relation === 'origin') {
      return t('family.openOrigin', { name });
    }
    return t(JOINED_KEYS[getDetail()?.sex ?? ''] ?? 'family.openJoined', { name });
  }

  // The counterpart's bare id is a valid slug (extractPersonId matches p-<digits>$); TreeView swaps in
  // the friendly slug once that family's graph has loaded.
  function target(link: FamilyLinkRef): RouteLocationRaw {
    const familyId = families.routeFamily(link.family);
    return link.personId
      ? familyLocation('person', familyId, { slug: link.personId })
      : familyLocation('tree', familyId);
  }

  return { links, label, target };
}
