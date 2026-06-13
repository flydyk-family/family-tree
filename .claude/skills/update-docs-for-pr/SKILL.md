---
name: update-docs-for-pr
description: Use when opening a pull request (at `gh pr create` time) to sync the documentation with the branch's changes — updates docs/reference/ and the README/CLAUDE.md overview to match new, changed, or removed behavior, then commits the doc edits onto the same branch so they land in the same PR. A PreToolUse hook prompts this on every `gh pr create`.
---

# Update docs for a PR

## Overview

**Docs ship with the code that changes them.** When a branch changes behavior, its documentation impact must land in the *same* PR — not a follow-up. This skill diffs the branch against its base, updates the affected docs to match the actual code, and pushes the doc edits onto the same branch.

Scope of docs kept in sync:
- [`docs/reference/`](../../../docs/reference/README.md) — the connected QA reference (the primary target).
- The root [`README.md`](../../../README.md) intro and the [`CLAUDE.md`](../../../CLAUDE.md) **Project overview** paragraph — only if the product description changed.

Specs/plans under `docs/superpowers/` are **historical** — do not edit them here.

## When to use / skip

Run it at PR time (the hook reminds you). **Skip with an explicit note** — don't force edits — when the diff is:
- docs-only, or test-only, or
- a refactor/rename/dep-bump/CI tweak with **no** observable-behavior, API-contract, architecture, device/screen, or tooling change.

If nothing user-facing or contract-level changed, say "no doc update needed" and stop.

## Procedure

1. **Find the diff against the base** (usually `main`):
   ```bash
   base=$(gh pr view --json baseRefName -q .baseRefName 2>/dev/null || echo main)
   git fetch -q origin "$base"
   git diff --stat "origin/$base...HEAD"      # what files changed
   git diff "origin/$base...HEAD"             # read the actual changes
   ```
   If the PR isn't created yet, use `main` as the base.

2. **Classify the changes → map to docs** (read the changed code; don't guess):

   | Change touches… | Update… |
   |---|---|
   | API endpoints / DTOs / validation / errors / `family.json` shape | [features/backend-api.md](../../../docs/reference/features/backend-api.md) |
   | OakTree / medallion / time rail / layout engine / motion | [features/oak-tree.md](../../../docs/reference/features/oak-tree.md) |
   | Panel rail / popup / person detail / media / lightbox / stores | [features/person-details.md](../../../docs/reference/features/person-details.md) |
   | Search / pan-zoom / routing / deep links / orientation | [features/search-and-navigation.md](../../../docs/reference/features/search-and-navigation.md) |
   | App bar / tabs / Chronicle / i18n / stats | [features/app-shell-and-localization.md](../../../docs/reference/features/app-shell-and-localization.md) |
   | Packages / versions / project layout / architecture | [tech-stack.md](../../../docs/reference/tech-stack.md) |
   | Workflows / deploy / hosting / scripts | [ci-cd.md](../../../docs/reference/ci-cd.md) |
   | Tests added/removed; coverage config | [testing.md](../../../docs/reference/testing.md) |
   | Breakpoints / responsive / a11y / PWA | [devices-and-screens.md](../../../docs/reference/devices-and-screens.md) |
   | Feature shipped, removed, or deferred | [roadmap.md](../../../docs/reference/roadmap.md) **and** the live-vs-roadmap callout in [README.md](../../../docs/reference/README.md) |
   | New workaround / constraint / known limitation | [technical-debt.md](../../../docs/reference/technical-debt.md) |
   | Product description / one-paragraph pitch | root README intro + CLAUDE.md Project overview |

3. **Edit to match the code, not the spec.** Ground every change in the changed files. Re-verify any concrete fact you touch (data counts, API contract shapes, ports) against the code or the running app — see the `run-app` skill. Keep the existing behavior-level, QA-oriented voice.

4. **Honor the doc conventions:**
   - Every mention of a **repo file** is a Markdown link to it, with the correct relative depth: `../../` from a top-level `docs/reference/*.md`, `../../../` from `docs/reference/features/*.md`. Verify each target exists.
   - Move shipped items out of `roadmap.md` into the implemented list; update the README live-vs-roadmap callout so QA never tests an absent (or already-present) feature.

5. **Validate links resolve** before committing (each local link target must exist from its file's location).

6. **Land it in the same PR:** commit the doc edits onto the current branch and push. An open PR tracks its branch, so the docs appear in the same PR:
   ```bash
   git add docs/reference README.md CLAUDE.md
   git commit -m "Docs: sync reference with <short description of the change>"
   git push
   ```

## Common mistakes
- **Editing specs/plans** under `docs/superpowers/` — those are historical; leave them.
- **Guessing** instead of reading the diff — describe what the code now does, verified.
- **Forgetting the file-link convention** or using the wrong `../` depth.
- **Opening a separate docs PR** — the whole point is to land docs in the *same* PR by pushing to the same branch.
- **Forcing edits** on a docs-only/test-only/no-behavior diff — note "no doc update needed" instead.
