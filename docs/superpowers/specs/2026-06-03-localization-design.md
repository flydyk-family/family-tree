# Localization (i18n) — Design Spec

- **Date:** 2026-06-03
- **Status:** Approved for planning
- **Branch:** `feature-localization`

## 1. Purpose & scope

Make the web app available in **English**, **Russian** (primary/default), and **Belarusian**, with a language picker (flag + native name) and the choice persisted across browser sessions until changed.

Localization covers **both UI text and data**:
- **UI text** — interface strings (loading/error, the picker, and — in the frontend interactions phase — popup field labels, vocation/sex labels).
- **Data** — the free-text Person fields (names, place names, summary, biography). Non-text data (dates, URLs, ids, booleans, links) is not localized.

Switching language is **instant and client-side**: no page reload, no API refetch. The API returns *all* languages and the frontend renders the active one.

## 2. Locales, resolution, persistence

- **Locale codes:** `ru` (Russian, primary), `be` (Belarusian), `en` (English). Note `be` is the ISO-639-1 *language* code; the Belarus *flag* asset is the `BY` country code.
- **First visit:** auto-detect `navigator.language`; if it starts with `ru`/`be`/`en`, use that; otherwise default to **`ru`**.
- **Persistence:** `localStorage` key **`familytree.locale`**. A saved choice always wins on later visits until the user changes it. (URL-carried locale for shareable links is deferred — see §9.)
- **Fallback chain** for any missing translation: **requested → `ru` → `en` → first available non-empty**.
- On change, update `document.documentElement.lang`.

## 3. Backend — data i18n

### `LocalizedText` value object (Domain)
A pure domain value object holding the three language variants and resolving with the fallback chain. No persistence/serialization attributes (storage config lives in Infrastructure — see §7).

```csharp
public sealed record LocalizedText
{
    public string? Ru { get; init; }
    public string? Be { get; init; }
    public string? En { get; init; }

    public string? Resolve(string locale)
    {
        var requested = locale switch { "ru" => Ru, "be" => Be, "en" => En, _ => null };
        return FirstNonEmpty(requested, Ru, En, Be);
    }

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
}
```

### Fields that become `LocalizedText`
`Person.givenName`, `Person.surname`, `Person.maidenName`, `Person.summary`, `Person.biography`; `LifeEvent.place` (birth/death); `Residence.place`. Everything else unchanged. **`vocation`/`sex` stay enums** — localized as UI labels, not data.

### DTOs & mapping
DTOs carry all languages so the client can switch instantly:

```csharp
public sealed record LocalizedTextDto(string? Ru, string? Be, string? En);
```

`PersonDto`/`PersonSummaryDto`/`LifeEventDto`/`ResidenceDto` localized fields become `LocalizedTextDto`. Mapster maps `LocalizedText → LocalizedTextDto` (1:1). The JSON loader is structurally unchanged — `System.Text.Json` deserializes the nested `{ru,be,en}` object into `LocalizedText`.

### Data & tests
- `family.json` is rewritten so the localized fields are `{ru,be,en}` objects (Russian filled throughout; English for names/places; Belarusian where natural — the fallback chain covers gaps).
- The backend unit tests (deserialization, mapping) and the integration fixture/tests update to the localized shape (e.g. assert `dto.Surname.Ru == "Кавальскі"` etc.).

## 4. Frontend — UI i18n

- **vue-i18n** (Composition API, `legacy: false`). Message catalogs `src/i18n/{ru,be,en}.ts` for interface strings; `fallbackLocale: 'ru'`.
- Year-axis labels render as **plain numbers** (`String(year)`) — never locale number-formatted (no `1 842`/`1,842`).

## 5. Frontend — data i18n

- A `LocalizedText` TS type `{ ru?: string; be?: string; en?: string }` mirrors the DTO.
- A pure helper `localize(text: LocalizedText | null, locale: string): string` applies the fallback chain (requested → ru → en → any), returning `''` for null.
- Components resolve localized data through `localize(...)` with the active locale: `OakTree` node names, `TreeView`, and the future member popup.

## 6. Language picker

- A compact control (top-right) showing the current **flag + native name**; opens to the three options: **English**, **Русский**, **Беларуская**.
- Selecting an option updates the locale store, persists to `localStorage`, sets `<html lang>`, and re-renders instantly.
- **Flags** via the **`flag-icons`** package (MIT; SVG/CSS, renders correctly on Windows Chrome — unlike flag emoji): `fi fi-gb` (English/UK), `fi fi-ru` (Russian), `fi fi-by` (Belarusian/official). Picker is keyboard-accessible with `aria-label`s.
- A **`useLocale`** Pinia store (or composable) owns: current locale, the ordered locale list (code, nativeName, flag class), `setLocale`, first-visit detection, and persistence.

## 7. Storage evolution / DB alignment

Localization is **DB-ready by design**: `LocalizedText` is a domain value object behind the existing `IPersonRepository`/`IUnionRepository` interfaces, so swapping the JSON store for a database remains an **Infrastructure-only** change — nothing in Application/Domain or the API changes. The JSON file already stores each localized field as a `{ru,be,en}` object, i.e. the same shape a DB would hold, so data migrates without reshaping.

Two preferred mappings to consider at DB time:

1. **JSON column (preferred default).** Persist each `LocalizedText` as a JSON/`jsonb` column (e.g. `given_name jsonb`) via EF Core owned-type `.ToJson()` or a value converter. 1:1 with the value object; **adding a future language needs no schema migration**; minimal mapping code; `jsonb` is GIN-indexable for per-locale lookups. Best general default.
2. **Normalized translations table.** A `localized_text(owner_id, field, locale, value)` table (or per-entity translation tables). Choose this when **per-locale querying/indexing becomes central** — notably the future search/directory feature ("find by name/place in any language"). More mapping complexity, but the most query-friendly.

(Column-per-language — `given_name_ru/_be/_en` — is explicitly *not* preferred: every new language becomes a schema migration.)

Design rules that keep both doors open:
- Keep `LocalizedText` free of EF/persistence attributes; configure persistence in Infrastructure (`IEntityTypeConfiguration` / converter).
- Repository interfaces stay **locale-agnostic** now (return all languages). Later, if payload size or query patterns demand it, add locale-aware query/projection methods **additively** — no caller changes.
- The decision between option 1 and 2 is made at DB-introduction time and is driven by the search/directory requirements; the value-object approach defers it without cost.

## 8. Testing

- **Backend:** `LocalizedText.Resolve` (each locale + fallback order + all-empty); Mapster `LocalizedText → LocalizedTextDto`; loader deserializes localized JSON; endpoints return all languages.
- **Frontend:** `localize` fallback chain (incl. null → `''`); `useLocale` store (first-visit detection, persistence round-trip, `setLocale`); picker renders the three options and switching updates the active locale; a component test asserting a node name changes when the locale changes.

## 9. Decomposition & deferred

Two implementation plans (this spec covers both):
- **Plan A — backend data i18n:** `LocalizedText`, localized Person fields, DTOs + Mapster, localized sample data, updated unit/integration tests.
- **Plan B — frontend i18n:** vue-i18n + catalogs, `useLocale` store (detect/persist), `localize` helper + localized rendering, the flag picker.

**Deferred:** URL-carried locale for shareable localized links (pairs naturally with the Plan-2 `/person/:id` deep link); localized date formatting in the member popup (frontend interactions phase); a 4th+ language (the model already supports adding one).

## 10. Decisions log

- Locales `ru`/`be`/`en`; Russian primary/default; fallback requested → ru → en → any.
- Data localized via `LocalizedText` value object on free-text Person fields; enums (vocation/sex) localized as UI labels.
- API returns all languages → instant client-side switching.
- Persistence: `localStorage` (`familytree.locale`) + first-visit browser detection. URL locale deferred.
- Flags: `flag-icons` SVG (gb/ru/by) — chosen because flag emoji don't render on Windows Chrome. Belarusian flag = official red-green; English flag = United Kingdom.
- Library: vue-i18n.
- DB alignment: `LocalizedText` behind repositories; preferred persistence = JSON column, alternative = normalized translations table.
