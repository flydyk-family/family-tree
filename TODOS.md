# TODOS

Deferred items captured during the Members-page eng review (2026-07-06). Each has enough
context to pick up cold.

## Members page — cut 1c: residence editing + map place picker
- **What:** In-app editor for a person's `residences[]` — add/edit/delete rows of
  `{ place (ru/be/en), fromYear, toYear, mapUrl }`, with an on-map city picker for `place`.
- **Why:** Cut 1 displays residences read-only. Residences are a variable-length structured
  i18n list, not a scalar field, and editing a place well needs a picker (place-search was
  deferred). Split out of cut 1b to keep the first editor slice small.
- **Depends on:** the profile-override backend slice (cut 1a) — residences ride the same
  override; and a geocoding/map dependency for the picker.
- **Start at:** `ResidencesEditor` (stubbed as read-only display in cut 1); extend the profile
  override to carry the residences list; add row-level validation (from ≤ to).

## Members page — cut 2: add/remove people + relationship editing
- **What:** Create/delete a person and edit relationships (parents, unions, children).
- **Why:** The override store only modifies existing seed ids; a net-new person is a new
  entity the snapshot must *add*, and a relationship-less person is an orphan the oak can't
  place. The cut-1 family-area layout is built to accommodate add/remove affordances.
- **Depends on:** a structural-override mechanism (net-new entities), not just field overrides.

## Profile override — optimistic-concurrency precondition (if editing goes multi-editor)
- **What:** Add a revision precondition (expected-latest-revision check) to
  `AppendProfileAsync` so two concurrent editors don't silently clobber each other.
- **Why:** Cut 1 is whole-record latest-wins — fine for a solo archive, unsafe with multiple
  active editors even though the allow-list supports several. Append-only history is already
  there; this uses it.
- **Depends on:** nothing; small change when needed.

## Profile override — intentional-empty locale (distinct from seed-inherit)
- **What:** A sentinel so an editor can set a name locale to *explicitly empty* vs *inherit
  the seed value*. Cut 1 uses null→seed fallback + revert-to-seed, so "explicit empty" isn't
  representable.
- **Why:** Rare (mostly maidenName), but a real correctness gap for the settable-then-cleared
  case. Revert-to-seed covers the common "undo my edit" need.

## Members index — animated census-card shuffle (banked north star)
- **What:** The index becomes era-styled cards that Flip-re-sort by decade/surname/vocation/
  generation; the opened card lifts and relatives fan around it.
- **Why:** The "whoa" version; deferred so cut 1 proves the editing plumbing first. Motion
  perf risk on large trees (bake bitmaps, never vector in a pan/zoom canvas).
