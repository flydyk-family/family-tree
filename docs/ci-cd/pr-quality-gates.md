# PR Quality Gates — operating notes

This repo gates every PR (into `main` and `release-*`) with GitHub Actions.
Workflows live in [`.github/workflows/`](../../.github/workflows/) and
[`.github/dependabot.yml`](../../.github/dependabot.yml). Full rationale:
[`docs/superpowers/specs/2026-06-04-pr-quality-gates-design.md`](../superpowers/specs/2026-06-04-pr-quality-gates-design.md).

## What runs on a PR

| Workflow | Job / check name(s) | What it does |
|---|---|---|
| `ci.yml` | `backend`, `frontend` | .NET build + test + NuGet vuln-audit; Vue type-check + build + Vitest + `npm audit` |
| `codeql.yml` | `Analyze (csharp)`, `Analyze (javascript-typescript)` | CodeQL static analysis (SAST) |
| `claude-code-review.yml` | `claude-review` | Automated Claude review (advisory — posts comments) |
| `claude.yml` | — | Responds to `@claude` mentions on issues/PRs |
| `dependabot.yml` | — | Weekly dependency + GitHub-Actions update PRs |

## One-time owner setup (needs repo-admin — not in version control)

1. **Add the API key:** Settings → Secrets and variables → Actions → New
   repository secret → **`ANTHROPIC_API_KEY`**. Without it, the two Claude
   workflows fail. (Billed via Anthropic API usage.)
2. **Code security toggles:** Settings → Code security → enable **Dependabot
   alerts**, **Dependabot security updates**, **Secret scanning**, and **Push
   protection** (all free on this public repo).
3. **Branch protection / ruleset for `main`** (Settings → Rules → Rulesets, or
   Branches → Add rule), ideally with a matching rule for `release-*`:
   - Require a pull request before merging; **require 1 approval**; *(optional)*
     require review from **Code Owners**; dismiss stale approvals on new commits.
   - **Require status checks to pass** + **require branches to be up to date**,
     selecting: **`backend`**, **`frontend`**, **`Analyze (csharp)`**,
     **`Analyze (javascript-typescript)`** (and optionally **`claude-review`**).
     *Check names appear in the picker only after each workflow has run once —
     so open the first PR (which runs them), then add the checks.*
   - **Require conversation resolution before merging.**
   - **Require linear history** (matches the squash-merge workflow).
   - **Do not allow bypassing the above settings.**

After this, the CLAUDE.md flow holds: branch off `main` (or a `release-*`),
open a PR, gates run, the **owner** reviews and squash-merges — no self-merge.

## Notes & tuning

- **Claude review is advisory.** The `claude-review` check passing means the
  review *ran*, not that Claude approved. The merge decision stays with the
  human owner plus the deterministic `backend` / `frontend` / CodeQL checks.
- **Fork PRs:** GitHub does not expose secrets to PRs from forks, so the Claude
  workflows run on branches in this repo but **not** on outside-fork PRs. This
  is intentional — we use the safe `pull_request` event and avoid
  `pull_request_target`.
- **Audit thresholds:** the frontend gate is `npm audit --omit=dev
  --audit-level=high` — it audits **shipped/runtime** dependencies. The dev
  toolchain (esbuild/vite/vitest) currently carries four advisories (3 moderate
  + 1 critical, the Vitest UI dev-server issue) that never ship in `dist/` and
  whose fix is a breaking `vite@8` / `vitest@4` major bump; those are tracked by
  Dependabot rather than blocking PRs. Drop `--omit=dev` once the toolchain is
  upgraded. The backend gate fails on any `dotnet list package --vulnerable`
  finding. Adjust the threshold or allowlist in `ci.yml` if an unavoidable
  advisory ever blocks unrelated PRs.
