# Biography editor UI — design

**Date:** 2026-06-21
**Status:** Approved (brainstorming)
**Area:** Frontend (Vue 3 SPA) — the last remaining piece of the Google-auth editor feature.

## Context

The backend biography-edit endpoint and the entire Google sign-in flow are already
shipped on `main`. Editors can currently change biographies only via `curl`. This spec
covers the missing UI: an in-app affordance that lets a signed-in editor edit a person's
localized biography and save it through the existing API.

### Existing pieces this builds on (verified against current code)

- **Backend (done):** `PUT /api/people/{id}/biography`, `[Authorize(Policy="CanEdit")]`.
  Body is `LocalizedTextDto` = `{ "ru": string|null, "be": string|null, "en": string|null }`
  (at least one non-empty). `id` matches `^p-\d+$`. Returns the updated `PersonDto`
  (same shape the SPA already consumes as `PersonDetail`). **Replace-all semantics:** the
  PUT replaces the *entire* biography value — submitting only `{ en: "…" }` nulls `ru` and
  `be`. The editor email comes from the session cookie, not the body. A save triggers an
  immediate snapshot refresh so the next read shows the change. Contract documented in
  `docs/reference/features/backend-api.md`.
- **Frontend (done):**
  - `stores/authStore.ts` — `{ signedIn, email, name, canEdit, error }`.
  - `api/authApi.ts` — cookie-aware client; `authFetch` sets `credentials: 'include'`.
  - `stores/selectionStore.ts` — owns `cache: Record<id, PersonDetail>`, `detail`,
    `selectedId`. **Both** render surfaces read from this cache: the popup
    (`PersonPopup` → `selection.detail`) and the rail panels
    (`PanelRail` → `detailFor(id) = cache[id]`).
  - `components/PersonDossier.vue` — renders the biography read-only via `ChroniclePager`,
    inside a `<section v-if="biographyText" data-test="biography">`. Shared by both the
    popup and the rail panels (`PersonDetail.vue`).
  - `types/family.ts` — `LocalizedText = { ru, be, en: string|null }`; `PersonDetail`.
  - `i18n/localize.ts` — `localize(text, locale)`, fallback requested→ru→en→be.
  - `constants/locales.ts` — `LOCALE_OPTIONS` carry native names (Русский / Беларуская /
    English).
  - i18n catalogs `i18n/messages/{en,ru,be}.ts` — **key parity enforced** by
    `messages.spec.ts`; every new key must exist in all three.

## Decisions (from brainstorming)

1. **Surface:** inline editing, **popup-only**. The Edit affordance lives in the wide
   bigger-view popup; the narrow rail panels stay read-only and unchanged.
2. **Locale layout:** **tabs**, one textarea at a time (Русский / Беларуская / English,
   RU first/primary). Tabs whose buffer holds text show a **dot marker** so a hidden
   locale isn't forgotten under replace-all.
3. **Reflect on confirmed 200** (no optimistic update). The displayed view updates only
   after a 200, from the server's returned `PersonDetail`.
4. **Resilient save:** the edit buffer is never cleared on failure — a failed save keeps
   every keystroke, shows an error, and Save can be retried.
5. **Blank safeguard:** if a save would change a previously-non-empty locale to empty,
   show an inline confirm naming the affected locale(s) before the PUT. A fully-empty save
   (all three blank) is blocked outright (mirrors the backend "at least one non-empty").
6. **Cancel guard:** Cancel discards immediately when clean; when the buffer is dirty it
   shows an inline "Discard changes?" confirm first.

## Architecture

### Component tree (popup path only)

```
PersonPopup
  └─ PersonDossier  (editable=true)
       ├─ ChroniclePager           ← read mode (unchanged)
       └─ BiographyEditor          ← edit mode (new)
```

The rail path (`PanelRail → PersonDetail → PersonDossier`) passes no `editable`, so it
never mounts `BiographyEditor` and is functionally unchanged.

### `PersonDossier.vue` changes

- New prop `editable?: boolean` (default `false`). Only `PersonPopup` sets it true.
- Auth: read `useAuthStore()`; expose `canEdit = editable && auth.canEdit`.
- Biography section rendering:
  - **Editors (`canEdit`):** always render the biography `<section>` (even when empty),
    so a biography can be *added* to a person who has none. Read mode shows the text
    (`ChroniclePager`) or an empty-state (`editor.empty`) plus an **Edit/Add** button in
    the section header.
  - **Everyone else:** unchanged — `<section v-if="biographyText">`, no Edit control, no
    empty section.
- Local `editing` ref. Edit/Add toggles it. While `editing`, render `<BiographyEditor>`
  in place of the read view.
- Handlers: `@saved="onSaved"` → `selectionStore.applyDetail(updated)` then
  `editing = false`; `@cancel` → `editing = false`.

### `BiographyEditor.vue` (new, controlled component)

- **Props:** `personId: string`, `biography: LocalizedText | null`.
- **Local state (the resilient buffer):**
  - `buffers: { ru: string; be: string; en: string }` seeded from `biography` (null → '').
  - `activeTab: Locale` (default `'ru'`).
  - `saving: boolean`, `error: string | null`.
  - `pendingConfirm: 'blank' | 'discard' | null` for the inline confirm.
- **Tabs:** ordered `ru, be, en`, labelled with `LOCALE_OPTIONS` native names. Each tab
  shows a dot when its buffer is non-empty (trimmed). `data-test="bio-tab-<locale>"`.
- **Textarea:** one visible, bound to the active buffer. `data-test="bio-input"`.
- **Footer:** Save (`data-test="bio-save"`), Cancel (`data-test="bio-cancel"`), a saving
  indicator, and an inline error region (`data-test="bio-error"`).
- **Validation:** `allEmpty = every buffer trimmed === ''`. Save disabled when `allEmpty`
  or `saving`; an inline `editor.requireOne` hint shows when `allEmpty`.
- **Save flow:**
  1. Build payload: each locale trimmed; `'' → null`.
  2. If a locale that was non-empty in the original `biography` is now empty → set
     `pendingConfirm='blank'` and show `editor.confirmBlank` naming those locales; the
     confirm's primary action re-enters the save at step 3.
  3. `saving=true; error=null`; call `putBiography(personId, payload)`.
  4. On success → `emit('saved', updatedDetail)`. On throw → `error = editor.saveFailed`,
     `saving=false`, buffers untouched (retry allowed).
- **Cancel flow:** if `dirty` (any buffer differs from its seeded value) → set
  `pendingConfirm='discard'` and show `editor.confirmDiscard`; confirm → `emit('cancel')`.
  If clean → `emit('cancel')` immediately.

### API client — `src/frontend/src/api/biographyApi.ts` (new)

```ts
import type { LocalizedText, PersonDetail } from '../types/family';

export async function putBiography(
  personId: string,
  biography: LocalizedText,   // { ru, be, en: string|null }
  baseUrl = ''
): Promise<PersonDetail> {
  const response = await fetch(`${baseUrl}/api/people/${personId}/biography`, {
    method: 'PUT',
    credentials: 'include',            // session cookie; no Authorization header
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(biography)
  });
  if (!response.ok) {
    throw new Error(`Failed to save biography: ${response.status}`);
  }
  return (await response.json()) as PersonDetail;
}
```

Sibling to `authApi`/`familyApi` (replicates `credentials: 'include'` per the auth
convention). Throwing on non-OK is what preserves the buffer in `BiographyEditor`.

### `selectionStore` — new `applyDetail` action

```ts
applyDetail(detail: PersonDetail): void {
  this.cache[detail.id] = detail;
  if (this.selectedId === detail.id) {
    this.detail = detail;
  }
}
```

Because the popup reads `detail` and the rail reads `cache[id]`, replacing the cached
object reflects the saved biography on every surface, authoritatively from the server.

### i18n keys (add to en/ru/be under `editor`)

| key | en (reference) |
|-----|----------------|
| `editor.edit` | Edit |
| `editor.add` | Add biography |
| `editor.empty` | No biography yet. |
| `editor.save` | Save |
| `editor.cancel` | Cancel |
| `editor.saving` | Saving… |
| `editor.saveFailed` | Could not save. Your text is kept — try again. |
| `editor.requireOne` | Enter a biography in at least one language. |
| `editor.confirmBlank` | This will remove the biography in: {locales}. Save anyway? |
| `editor.confirmDiscard` | Discard your unsaved changes? |

Tab labels reuse `LOCALE_OPTIONS` native names (no new keys). ru/be translations land in
the same PR; parity is enforced by `messages.spec.ts`.

## Error handling

- Non-200 from the PUT → caught in `BiographyEditor`, surfaced as `editor.saveFailed`,
  buffer retained, Save re-enabled for retry. (401/403/404/400 all present the same
  generic message; a signed-in editor hitting them is an edge case, not the happy path.)
- The store update only runs on a resolved 200, so a failed save never mutates the view.

## Testing (Vitest + Vue Test Utils, TDD)

- **`biographyApi.spec.ts`** — PUT URL & body shape; `credentials: 'include'`; resolves to
  parsed `PersonDetail` on 200; throws on non-OK.
- **`selectionStore.spec.ts`** — `applyDetail` updates `cache[id]`; updates `detail` when
  it's the selected person; leaves `detail` alone otherwise.
- **`BiographyEditor.spec.ts`** — tab switching shows the right buffer; dot marker tracks
  non-empty buffers; all-empty disables Save and shows `requireOne`; blanking a
  previously-non-empty locale triggers the confirm; **a failed save keeps the buffer,
  shows the error, and a retry succeeds**; emits `saved` with the server `PersonDetail` on
  200; dirty Cancel confirms, clean Cancel emits immediately.
- **`PersonDossier.spec.ts`** — Edit control shows only when `editable && canEdit`; an
  editor sees the add affordance on an empty biography; anonymous/non-editor read-only
  view is unchanged (no Edit, no empty section).
- **`messages.spec.ts`** — passes with the new keys present in all three catalogs.

## Docs (same PR — `update-docs-for-pr`)

- `docs/reference/` — record that the in-app biography editor now exists (popup-only,
  tabbed three-locale editor, resilient save), updating the frontend behavior reference
  and any "not yet built" note.
- `CLAUDE.md` overview / roadmap — flip the line that calls the biography editing UI the
  "remaining frontend piece".

## Out of scope (YAGNI)

- Editing any field other than biography (names, dates, residences, links).
- Rich-text / markdown formatting — plain textarea, matching the read-only renderer.
- Editing from the rail panels.
- Per-keystroke autosave or draft persistence across popup close (buffer lives for the
  open editor session only).
