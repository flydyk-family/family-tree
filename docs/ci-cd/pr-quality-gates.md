# PR Quality Gates — operating notes

This repo gates every PR (into `main` and `release-*`) with GitHub Actions.
Workflows live in [`.github/workflows/`](../../.github/workflows/) and
[`.github/dependabot.yml`](../../.github/dependabot.yml). Full rationale:
[`docs/superpowers/specs/2026-06-04-pr-quality-gates-design.md`](../superpowers/specs/2026-06-04-pr-quality-gates-design.md).

## What runs on a PR

| Workflow | Job / check name(s) | What it does |
|---|---|---|
| `ci.yml` | `backend`, `frontend` | .NET build + test + NuGet vuln-audit; Vue type-check + build + Vitest + `npm audit` |
| `codeql.yml` | `Analyze (csharp, manual)`, `Analyze (javascript-typescript, none)` | CodeQL static analysis (SAST) |
| `claude.yml` | — | Responds to `@claude` mentions on issues/PRs (on demand) |
| `dependabot.yml` | — | Weekly dependency + GitHub-Actions update PRs |

There is **no automated per-PR AI review**: Claude runs only when someone
writes `@claude …` on an issue or PR, so it draws on the subscription quota
only on demand. Code review for merge is the human owner's approval.

## One-time owner setup (needs repo-admin — not in version control)

1. **Add the Claude token:** Settings → Secrets and variables → Actions → New
   repository secret → **`CLAUDE_CODE_OAUTH_TOKEN`**. Generate the value locally
   with `claude setup-token` (uses your Claude Pro/Max subscription quota — no
   separate Anthropic API billing). Without it, the `@claude` responder fails.
2. **Code security toggles:** Settings → Code security → enable **Dependabot
   alerts**, **Dependabot security updates**, **Secret scanning**, and **Push
   protection** (all free on this public repo).
3. **Branch protection / ruleset for `main`** (Settings → Rules → Rulesets, or
   Branches → Add rule), ideally with a matching rule for `release-*`:
   - Require a pull request before merging; **require 1 approval**; *(optional)*
     require review from **Code Owners**; dismiss stale approvals on new commits.
   - **Require status checks to pass** + **require branches to be up to date**,
     selecting: **`backend`**, **`frontend`**, **`Analyze (csharp, manual)`**,
     **`Analyze (javascript-typescript, none)`**.
     *(These exact names are confirmed from PR #15's first run. A separate
     `CodeQL` aggregate check also exists if you prefer to require that instead
     of the two per-language `Analyze` jobs.)*
   - **Require conversation resolution before merging.**
   - **Require linear history** (matches the squash-merge workflow).
   - **Do not allow bypassing the above settings.**

After this, the CLAUDE.md flow holds: branch off `main` (or a `release-*`),
open a PR, gates run, the **owner** reviews and squash-merges — no self-merge.

## Notes & tuning

- **No automated review gate.** Merge review is the human owner's approval plus
  the deterministic `backend` / `frontend` / CodeQL checks. Claude assists only
  when invoked with `@claude` on an issue/PR.
- **Claude auth & quota:** `claude.yml` authenticates with
  `CLAUDE_CODE_OAUTH_TOKEN` (a Claude Pro/Max subscription token from
  `claude setup-token`), so `@claude` usage counts against the same
  subscription limits as interactive Claude Code, not API credits. The token
  expires/can be revoked — if `@claude` starts failing with an auth error,
  regenerate it with `claude setup-token`.
- **Fork PRs:** GitHub does not expose secrets to PRs from forks, so `@claude`
  works on branches in this repo but **not** from outside-fork PRs.
- **Audit thresholds:** the frontend gate is `npm audit --audit-level=high`,
  auditing the **full** dependency tree. It previously used `--omit=dev` to
  skip esbuild/vite/vitest advisories that never shipped in `dist/`; the
  **Vite 8 / Vitest 4** upgrade cleared those, so the gate now covers dev
  dependencies too. The backend gate fails on any `dotnet list package
  --vulnerable` finding. Adjust the threshold or allowlist in `ci.yml` if an
  unavoidable advisory ever blocks unrelated PRs.
- **MediatR licensing:** **MediatR 14.x** runs under a Lucky Penny Software
  community license. The key is read from configuration (`MediatR:LicenseKey`):
  set it via user-secrets locally (`dotnet user-secrets set
  "MediatR:LicenseKey" "<key>"`) or the `MediatR__LicenseKey` env var in
  deployment — **never commit it**. Without a key MediatR still runs (logging an
  unlicensed warning), so the build/tests don't require the secret.
