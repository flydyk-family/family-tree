# Friendly person URLs — design

**Date:** 2026-06-25
**Status:** Approved (pending spec review)

## Problem

Opening a person popup deep-links to `/person/p-0003`, exposing the raw
internal id. Shared links are opaque — a recipient can't tell who the link
points to. We want human-readable URLs that carry the person's name (and birth
year), while keeping links stable and unambiguous.

## Decision summary

| Question | Decision |
| --- | --- |
| Language in the URL | **English transliteration** of the name, plus the **birth year** |
| Resolution strategy | **Slug + trailing id** — the real id is appended and is the source of truth |
| Collision handling | None needed — the embedded id guarantees uniqueness |
| Id placement / form | **Trailing, hyphenated** (`…-p-0003`), id kept verbatim |
| Backend changes | **None** — resolution is entirely frontend |

## URL shape

```
/person/<given>-<surname>-<birthYear>-<id>
```

Examples:

- `/person/franciszek-kowalski-1788-p-0003`
- `/person/jan-nowak-p-0042` — birth year omitted when unknown
- `/person/p-0003` — degenerate form (no name available, or a legacy link); still valid

The portion before the trailing id is **decorative**. Resolution depends only on
the trailing id, so a truncated or stale name part still resolves correctly.

## Resolution

Person ids have the form `p-<digits>` (`p-0003`). Every slug ends with the
verbatim id. To resolve a slug to a person:

```
extractPersonId(slug): match /p-\d+$/ against the slug; return the match, else null
```

The matched id is fetched via the existing `GET /api/people/{id}` endpoint —
**the backend and its routes are unchanged.**

Backward compatibility falls out for free: a legacy `/person/p-0003` link ends
with `p-0003`, so `extractPersonId` returns `p-0003` and it resolves normally.

## Slug building

A pure helper produces the canonical slug from a `PersonSummary` (already held
in the graph store, so no extra fetch):

```
personSlug(person):
  name = slugifyName(person.givenName) + '-' + slugifyName(person.surname)
  parts = [name]                       // omit empty halves
  if person.birthYear != null: parts.push(birthYear)
  parts.push(person.id)                // verbatim, e.g. 'p-0003'
  return parts.filter(nonEmpty).join('-')
```

`slugifyName(localized)`:

1. Pick the text: `en` if present, else transliterate `ru` (Cyrillic→Latin),
   else `be`, else empty string.
2. Lowercase; strip diacritics via Unicode NFD + combining-mark removal
   (`ł→l` needs an explicit map, as it has no NFD decomposition).
3. Replace any run of non-`[a-z0-9]` with a single `-`; trim leading/trailing `-`.

If both name halves resolve empty (no usable locale), the slug collapses to just
the id (`p-0003`) — i.e. it degrades gracefully to today's URL.

### Cyrillic→Latin fallback

A small fixed transliteration table (BGN/PCGN-ish, lowercase) covers the
ru/be alphabets. It is only used when `en` is null, so for the current dataset
(Latin `en` names present) it is rarely hit. It need not be reversible — it only
has to produce stable, readable ASCII.

## Canonicalization

After a person's detail loads, compare the current `route.params.slug` against
`personSlug(person)`. If they differ (arrived via bare id, or the name part is
stale/mangled), `router.replace` to the canonical slug. `replace` (not `push`)
avoids polluting browser history. This makes the address bar self-heal to the
pretty URL.

## Touch points

All changes are in `src/frontend`:

- **`src/utils/personSlug.ts`** (new) — `personSlug(person)`, `extractPersonId(slug)`,
  and the internal `slugifyName` / transliteration table. Pure, no Vue/store deps.
- **`src/utils/personSlug.test.ts`** (new, Vitest) — covers: Latin name → slug,
  diacritics (`ł`, `ż`), missing birth year, Cyrillic fallback, empty-name
  collapse-to-id, and `extractPersonId` for both slug and legacy bare-id inputs.
- **`src/router/index.ts`** — rename the route param `:id` → `:slug`
  (`{ path: '/person/:slug', name: 'person', component: TreeView }`).
- **`src/views/TreeView.vue`**:
  - `selectedId` derives from `extractPersonId(route.params.slug)`.
  - `onSelect(id)` and the panel-store → router watcher push
    `{ name: 'person', params: { slug: personSlug(person) } }`, where `person`
    is looked up from the graph store by id. A helper resolves id→`PersonSummary`.
  - Add the canonicalization `router.replace` once the loaded person is known.

The `route.params.id` name is internal to the router; the `name: 'person'` route
identity is preserved, so any `router.push({ name: 'person', … })` call sites
just swap `params.id` for `params.slug`.

## Out of scope (YAGNI)

- No backend slug index or resolve endpoint.
- No `-2` style disambiguation suffixes — the id makes slugs unique already.
- No Cyrillic characters in the URL path.
- No per-locale URLs — the slug is locale-independent (English/transliterated),
  so one person has exactly one canonical URL regardless of viewing language.

## Testing

- Unit (Vitest): `personSlug` / `extractPersonId` per the cases above.
- Manual: open a medallion → URL becomes the pretty slug; reload the pretty URL →
  same person opens; visit a legacy `/person/p-0003` → resolves and self-heals to
  the slug; visit `/person/anything-p-0003` → resolves to `p-0003`.

## Docs impact

`/person/:id` deep-link behavior is described in `docs/reference/` and the
project overview (CLAUDE.md / README). Update the deep-link description to the
new slug form in the same PR (per the docs-land-with-the-PR rule).
