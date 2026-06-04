# PR Quality Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Actions PR quality gates — build + test (backend & frontend), CodeQL + Dependabot + an in-CI dependency-audit step for security, and an automated Claude PR review — and document the owner-only branch-protection settings.

**Architecture:** Split workflows by concern under `.github/`, each least-privileged: `ci.yml` (build/test/audit), `codeql.yml` (SAST), `claude.yml` (on-demand `@claude` responder), plus `dependabot.yml`, `CODEOWNERS`, and an owner-facing delivery note. Triggers cover `main` and `release-*`. *(An auto-review-on-every-PR workflow was planned as Task 5 but dropped — see its amendment banner.)*

**Tech Stack:** GitHub Actions (`actions/checkout@v6`, `actions/setup-node@v6`, `actions/setup-dotnet@v5`, `github/codeql-action@v3`, `anthropics/claude-code-action@v1`), .NET 10 (`FamilyTree.slnx`), Node 22 / Vite 5 / Vitest, Dependabot.

**Spec:** [`../specs/2026-06-04-pr-quality-gates-design.md`](../specs/2026-06-04-pr-quality-gates-design.md)

---

## Verification model (read first)

These are CI config files, not application code, so the usual "write a failing unit test" loop does not apply. Each task is verified two ways instead:

1. **Lint the YAML** with [`actionlint`](https://github.com/rhysd/actionlint) when available (catches syntax + expression-context errors offline). If `actionlint` is not installed, this is non-blocking — GitHub validates the workflow when it first runs, and Task 1 mirrors every *command* locally so the real risk (the build/test/audit commands) is already proven green.
2. **Mirror the underlying command locally** (e.g. run the exact `dotnet`/`npm` command the workflow will run) so we know the step itself passes before it ever runs in CI.

The **definitive** end-to-end check is the workflows running on the PR this branch opens (Task 9). That is inherently an owner/post-push step and is called out as such.

**Optional one-time `actionlint` install** (pick what fits the machine; all non-blocking):
- Go: `go install github.com/rhysd/actionlint/cmd/actionlint@latest`
- Docker: `docker run --rm -v "${PWD}:/repo" --workdir /repo rhysd/actionlint:latest -color`
- Scoop (Windows): `scoop install actionlint`

Throughout, "Run actionlint" means: `actionlint .github/workflows/<file>.yml` if installed, else skip and note it.

---

## Task 1: Pre-flight — prove every CI command is green locally

No files created. This de-risks every later task by running the exact commands the workflows will run.

- [ ] **Step 1: Backend build**

Run (repo root): `dotnet build -c Release`
Expected: `Build succeeded`, 0 errors.

- [ ] **Step 2: Backend tests**

Run (repo root): `dotnet test -c Release`
Expected: all `tests/unit` + `tests/integration` tests pass; non-zero exit only on failure.

- [ ] **Step 3: Backend dependency audit (capture wording)**

Run (repo root): `dotnet list package --vulnerable --include-transitive`
Expected: prints either "has no vulnerable packages" per project (clean) or "has the following vulnerable packages" (a finding). **Record which** — Task 3 greps for the phrase `has the following vulnerable packages` to decide pass/fail. If a real vulnerability exists, note it for the owner; the gate is *supposed* to fail on it.

- [ ] **Step 4: Frontend install**

Run (in `src/frontend`): `npm ci`
Expected: clean install from the committed `package-lock.json`.

- [ ] **Step 5: Frontend build (type-check + bundle) and tests**

Run (in `src/frontend`): `npm run build` then `npm test`
Expected: `vue-tsc` type-check passes, Vite build succeeds, Vitest run is green.

- [ ] **Step 6: Frontend dependency audit (capture threshold behavior)**

Run (in `src/frontend`): `npm audit --audit-level=high`
Expected: exit 0 if no high/critical advisories (gate passes); non-zero if found. **Record the result.** If it fails on an unavoidable transitive/dev advisory, note it — the owner may choose to relax the threshold or allowlist (documented in Task 8); do **not** weaken the gate silently.

- [ ] **Step 7: No commit** — this task only verifies the ground truth. Proceed once Steps 1–6 are understood (green, or known-and-recorded failures).

---

## Task 2: Dependabot configuration

**Files:**
- Create: `.github/dependabot.yml`

- [ ] **Step 1: Write the config**

```yaml
# Dependabot keeps dependencies current and opens security-update PRs.
# Free on public and private repos. Targets the default branch (main) only —
# deliberately not every release-* branch, to avoid duplicate dependency PRs.
version: 2
updates:
  # .NET — solution + central package management live at the repo root.
  - package-ecosystem: "nuget"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    groups:
      dotnet-minor-and-patch:
        update-types:
          - "minor"
          - "patch"

  # Frontend npm packages.
  - package-ecosystem: "npm"
    directory: "/src/frontend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    groups:
      npm-minor-and-patch:
        update-types:
          - "minor"
          - "patch"

  # Keep the GitHub Actions used by these workflows up to date.
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    groups:
      actions-all:
        patterns:
          - "*"
```

- [ ] **Step 2: Verify**

Run actionlint if available (it validates `dependabot.yml` schema in recent versions; otherwise GitHub validates it on push). Confirm the three ecosystems and directories match the repo layout (`nuget` → `/`, `npm` → `/src/frontend`, `github-actions` → `/`).

- [ ] **Step 3: Commit**

```bash
git add .github/dependabot.yml
git commit -m "ci: add Dependabot config (nuget, npm, github-actions)"
```

---

## Task 3: Build + test + dependency-audit workflow (`ci.yml`)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CI

on:
  pull_request:
    branches: [main, "release-*"]
  push:
    branches: [main, "release-*"]

# Cancel superseded runs for the same ref.
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  backend:
    name: backend
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Set up .NET 10
        uses: actions/setup-dotnet@v5
        with:
          dotnet-version: 10.0.x

      - name: Restore
        run: dotnet restore

      - name: Build
        run: dotnet build --no-restore -c Release

      - name: Test
        run: dotnet test --no-build -c Release

      - name: Audit NuGet packages for known vulnerabilities
        shell: bash
        run: |
          set -euo pipefail
          dotnet list package --vulnerable --include-transitive 2>&1 | tee audit.log
          if grep -qE "has the following vulnerable packages" audit.log; then
            echo "::error::Vulnerable NuGet packages detected (see log above)."
            exit 1
          fi

  frontend:
    name: frontend
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: src/frontend
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Set up Node 22
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: src/frontend/package-lock.json

      - name: Install
        run: npm ci

      - name: Build (type-check + bundle)
        run: npm run build

      - name: Test
        run: npm test

      # Audit production (shipped) dependencies for known vulnerabilities.
      # --omit=dev: the dev toolchain (esbuild/vite/vitest) carries advisories
      # that never ship in dist/ and whose fix is a breaking major bump; those
      # are tracked via Dependabot, not this PR-blocking gate.
      - name: Audit npm packages for known vulnerabilities
        run: npm audit --omit=dev --audit-level=high
```

- [ ] **Step 2: Verify YAML**

Run: `actionlint .github/workflows/ci.yml` (if installed)
Expected: no errors. (If not installed, note it; the commands themselves were proven in Task 1.)

- [ ] **Step 3: Sanity-check the audit gate logic**

Confirm the backend audit step keys off the exact phrase recorded in Task 1 Step 3 (`has the following vulnerable packages`). If your local dotnet emitted different wording, update the `grep` pattern to match before committing.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: build + test + dependency audit for backend and frontend (main, release-*)"
```

---

## Task 4: CodeQL workflow (`codeql.yml`)

**Files:**
- Create: `.github/workflows/codeql.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CodeQL

on:
  pull_request:
    branches: [main, "release-*"]
  push:
    branches: [main, "release-*"]
  schedule:
    - cron: "23 3 * * 1" # weekly, Monday 03:23 UTC (off the top of the hour)

concurrency:
  group: codeql-${{ github.ref }}
  cancel-in-progress: true

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      packages: read
      actions: read
      contents: read
    strategy:
      fail-fast: false
      matrix:
        include:
          - language: csharp
            build-mode: manual
          - language: javascript-typescript
            build-mode: none
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      # Runners do not preinstall the .NET 10 SDK, so CodeQL autobuild is
      # unreliable for C#. Pin the SDK and build manually instead.
      - name: Set up .NET 10
        if: matrix.language == 'csharp'
        uses: actions/setup-dotnet@v5
        with:
          dotnet-version: 10.0.x

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: ${{ matrix.language }}
          build-mode: ${{ matrix.build-mode }}

      - name: Build (C# manual build-mode)
        if: matrix.build-mode == 'manual'
        run: |
          dotnet restore
          dotnet build --no-restore -c Release

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: "/language:${{ matrix.language }}"
```

- [ ] **Step 2: Verify YAML**

Run: `actionlint .github/workflows/codeql.yml` (if installed)
Expected: no errors. Note the produced check names will be **`Analyze (csharp)`** and **`Analyze (javascript-typescript)`** — these are the names the owner selects in branch protection (Task 8).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/codeql.yml
git commit -m "ci: add CodeQL SAST for C# and JS/TS (main, release-*, weekly)"
```

---

## Task 5: Automated Claude PR review (`claude-code-review.yml`) — ⚠️ SUPERSEDED / REMOVED

> **Amendment (post-implementation):** This auto-review-on-every-PR workflow was
> **dropped**. `ANTHROPIC_API_KEY` bills against pay-as-you-go Anthropic API
> credits (separate from the owner's Max subscription), so the owner chose to
> keep **only the on-demand `@claude` responder** (Task 6), authenticated with
> `CLAUDE_CODE_OAUTH_TOKEN`. The workflow below was created then removed; it is
> retained here only as a record. **Do not create this file.** There is no
> automated AI review check.

**Files:**
- ~~Create: `.github/workflows/claude-code-review.yml`~~ (removed)

**Prerequisite (owner, documented in Task 8):** repo secret `ANTHROPIC_API_KEY` must exist for this job to succeed.

- [ ] **Step 1: Write the workflow**

```yaml
name: Claude Code Review

on:
  pull_request:
    types: [opened, synchronize]

# No base-branch filter: reviews PRs into main AND release-* automatically.

jobs:
  claude-review:
    name: claude-review
    runs-on: ubuntu-latest
    # Skip bot-authored PRs (e.g. Dependabot) to save review spend.
    if: github.event.pull_request.user.login != 'dependabot[bot]'
    permissions:
      contents: read
      pull-requests: write
      id-token: write
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          fetch-depth: 1

      - name: Claude review
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          track_progress: true
          prompt: |
            REPO: ${{ github.repository }}
            PR NUMBER: ${{ github.event.pull_request.number }}

            Review this pull request for the family-tree project. The repo's
            conventions live in CLAUDE.md at the repo root — read it and hold
            the change to it.

            Focus, in priority order:
            1. Correctness & bugs — logic errors, unhandled edge cases, broken
               async/cancellation, null-handling.
            2. Security — input validation, unsafe deserialization, leaking
               secrets, anything risky in the diff.
            3. Convention adherence (per CLAUDE.md):
               - C#/.NET: file-scoped namespaces; `_camelCase` private fields;
                 `Async` suffix + `CancellationToken` last; thin MediatR handlers
                 that delegate to services; always-brace control statements;
                 `System.Text.Json` into typed models; AwesomeAssertions in tests;
                 test naming `<Method>_When<Conditions>_Should<ExpectedResult>`.
               - Frontend: Vue 3 `<script setup lang="ts">`; Pinia; scoped SCSS
                 using design tokens / CSS custom properties; `data-test` hooks;
                 Vitest.
            4. Tests — is new behavior covered? Are tests meaningful?

            Post specific issues as inline comments. Give a short top-level
            summary. Be concise; praise only what's genuinely noteworthy. This
            review is advisory — the human owner still approves and merges.
          claude_args: |
            --allowedTools "mcp__github_inline_comment__create_inline_comment,Bash(gh pr comment:*),Bash(gh pr diff:*),Bash(gh pr view:*)"
```

- [ ] **Step 2: Verify YAML**

Run: `actionlint .github/workflows/claude-code-review.yml` (if installed)
Expected: no errors. The check name is **`claude-review`**.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/claude-code-review.yml
git commit -m "ci: add automated Claude PR review (advisory)"
```

---

## Task 6: Interactive `@claude` responder (`claude.yml`)

**Files:**
- Create: `.github/workflows/claude.yml`

- [ ] **Step 1: Write the workflow** (based on the official `anthropics/claude-code-action` example)

```yaml
name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  claude:
    runs-on: ubuntu-latest
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          fetch-depth: 1

      - name: Run Claude Code
        id: claude
        uses: anthropics/claude-code-action@v1
        with:
          # OAuth token from a Claude Pro/Max subscription (`claude setup-token`),
          # so this runs on subscription quota, not Anthropic API billing.
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

- [ ] **Step 2: Verify YAML**

Run: `actionlint .github/workflows/claude.yml` (if installed)
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/claude.yml
git commit -m "ci: add interactive @claude responder"
```

---

## Task 7: CODEOWNERS

**Files:**
- Create: `.github/CODEOWNERS`

- [ ] **Step 1: Write the file**

```
# Every change requests review from the repo owner.
# (Org repo flydyk-family/family-tree; switch to a team like
# @flydyk-family/maintainers if you prefer team-based ownership.)
* @flydyk
```

- [ ] **Step 2: Verify the handle**

Run: `gh api user --jq .login`
Expected: `flydyk` (the operating account). If the owner prefers a different handle/team, edit the file accordingly before committing. A bad CODEOWNERS handle is silently ignored by GitHub, so confirming it now matters.

- [ ] **Step 3: Commit**

```bash
git add .github/CODEOWNERS
git commit -m "ci: add CODEOWNERS (owner auto-review)"
```

---

## Task 8: Owner-facing delivery note

**Files:**
- Create: `docs/ci-cd/pr-quality-gates.md`

- [ ] **Step 1: Write the note**

````markdown
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
| `claude.yml` | — | Responds to `@claude` mentions on issues/PRs (on demand) |
| `dependabot.yml` | — | Weekly dependency + GitHub-Actions update PRs |

> **Amendment:** the auto-review-on-every-PR workflow was dropped; only the
> on-demand `@claude` responder remains. The authoritative copy of this note is
> [`docs/ci-cd/pr-quality-gates.md`](../../docs/ci-cd/pr-quality-gates.md).

## One-time owner setup (needs repo-admin — not in version control)

1. **Add the Claude token:** Settings → Secrets and variables → Actions → New
   repository secret → **`CLAUDE_CODE_OAUTH_TOKEN`** (from `claude setup-token`;
   uses Pro/Max subscription quota). Without it, the `@claude` responder fails.
   Not required for the build/test/CodeQL gates.
2. **Code security toggles:** Settings → Code security → enable **Dependabot
   alerts**, **Dependabot security updates**, **Secret scanning**, and **Push
   protection** (all free on this public repo).
3. **Branch protection / ruleset for `main`** (Settings → Rules → Rulesets, or
   Branches → Add rule), ideally with a matching rule for `release-*`:
   - Require a pull request before merging; **require 1 approval**; *(optional)*
     require review from **Code Owners**; dismiss stale approvals on new commits.
   - **Require status checks to pass** + **require branches to be up to date**,
     selecting: **`backend`**, **`frontend`**, **`Analyze (csharp)`**,
     **`Analyze (javascript-typescript)`**.
     *Check names appear in the picker only after each workflow has run once —
     so open the first PR (which runs them), then add the checks.*
   - **Require conversation resolution before merging.**
   - **Require linear history** (matches the squash-merge workflow).
   - **Do not allow bypassing the above settings.**

After this, the CLAUDE.md flow holds: branch off `main` (or a `release-*`),
open a PR, gates run, the **owner** reviews and squash-merges — no self-merge.

## Notes & tuning

- **No automated review gate.** Merge review is the human owner's approval plus
  the deterministic `backend` / `frontend` / CodeQL checks. Claude assists only
  when invoked with `@claude`, authenticated via `CLAUDE_CODE_OAUTH_TOKEN`
  (subscription quota; regenerate with `claude setup-token` if it expires).
- **Fork PRs:** GitHub does not expose secrets to PRs from forks, so `@claude`
  works on branches in this repo but **not** from outside-fork PRs.
- **Audit thresholds:** the frontend gate is `npm audit --omit=dev
  --audit-level=high` (audits **shipped/runtime** deps; dev-toolchain advisories
  in esbuild/vite/vitest don't ship and are tracked via Dependabot, so they
  don't block PRs); the backend gate fails on any `dotnet list package
  --vulnerable` finding. To also gate dev deps later, drop `--omit=dev` once the
  toolchain is upgraded (a `vitest`/`vite` major bump clears the current four
  advisories). Adjust the threshold or allowlist in `ci.yml` if an unavoidable
  advisory ever blocks unrelated PRs.
````

- [ ] **Step 2: Verify links**

Confirm the relative paths resolve from `docs/ci-cd/`: `../../.github/...` and `../superpowers/specs/...`. Confirm the check names match the workflows exactly (`backend`, `frontend`, `Analyze (csharp)`, `Analyze (javascript-typescript)`).

- [ ] **Step 3: Commit**

```bash
git add docs/ci-cd/pr-quality-gates.md
git commit -m "docs: owner-facing PR quality gates operating note"
```

---

## Task 9: Open the PR (do NOT merge) and validate end-to-end

Per CLAUDE.md: open the PR and **stop** — the owner reviews and merges.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature-pr-quality-gates
```

- [ ] **Step 2: Open the PR into main**

```bash
gh pr create --base main --title "ci: PR quality gates (build/test + CodeQL + Dependabot + @claude)" --body "<summary + link to spec & plan; note CLAUDE_CODE_OAUTH_TOKEN secret + branch-protection steps from docs/ci-cd/pr-quality-gates.md>"
```

- [ ] **Step 3: Watch the gates run on this PR**

```bash
gh pr checks --watch
```
Expected: `backend`, `frontend`, and the two `Analyze (...)` jobs complete. (The `@claude` responder only runs when someone comments `@claude`, so it produces no PR check.) Capture the result; report failures with the log (no success claims without evidence).

- [ ] **Step 4: Hand off**

Tell the owner: PR is open, gates are running; they need to (a) add `CLAUDE_CODE_OAUTH_TOKEN` (for `@claude`), (b) set the branch-protection required checks (names now visible after this run), per `docs/ci-cd/pr-quality-gates.md`. **Do not merge.**

---

## Self-review check (against the spec)

- **§5 build/test** → Task 3 (`backend` + `frontend` jobs, `main`/`release-*` triggers, concurrency, Node 22 + .NET 10.0.x). ✔
- **§6 security** → CodeQL Task 4, Dependabot Task 2, in-CI audit steps Task 3. ✔
- **§7 Claude integration** → Task 6 only (on-demand `@claude` responder, `CLAUDE_CODE_OAUTH_TOKEN`). Task 5 (auto-review) was **dropped** — see the amendment banners and §2 revision. ✔
- **§8 CODEOWNERS** → Task 7 (`@flydyk`, resolved). ✔
- **§9 owner delivery note** → Task 8 (secret, security toggles, branch protection with exact check names). ✔
- **§10 verification** → "Verification model" section + Task 1 local mirror + Task 9 PR run. ✔
- **Triggers cover `release-*`** → Tasks 3 & 4. ✔
- **No placeholders:** every committed workflow body is complete; the only fill-in is the PR body text in Task 9 Step 2 (intentional, author-written at PR time).
- **Name consistency:** the required-check names `backend`, `frontend`, `Analyze (csharp)`, `Analyze (javascript-typescript)` are used identically in Tasks 3/4 and the Task 8 delivery note. ✔
