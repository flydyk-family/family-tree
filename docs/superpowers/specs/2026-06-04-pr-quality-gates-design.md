# PR Quality Gates — Design Spec

- **Date:** 2026-06-04
- **Status:** Approved for planning
- **Branch:** `feature-pr-quality-gates`
- **Refines:** [`2026-06-03-family-tree-design.md`](2026-06-03-family-tree-design.md) §12 ("Platform / CI-CD → PR quality gates")

## 1. Purpose

Spec §12 calls for: "on every PR, run build + unit/integration tests + a security scan, plus an automated code review, as required checks before merge. Evaluate tooling: GitHub Actions for build/test, CodeQL + dependency scanning for security, and an AI review (Claude Code review / a 'bugbot'-style reviewer or similar)."

This change wires those gates with **GitHub Actions**, **CodeQL + Dependabot**, and the **Anthropic Claude Code GitHub Action**, and documents the **branch-protection / required-checks** settings the repo owner must enable (some require repo-admin in the GitHub UI).

## 2. Tooling decisions (brainstorm outcome)

The roadmap said *"pick, don't stack."* Decisions:

- **Build/test:** **GitHub Actions** — one workflow with a `.NET 10` backend job and a `Vue/Vite` frontend job.
- **Security:** **CodeQL** (SAST on our code) **+ Dependabot** (third-party CVEs, version/security update PRs) **+ an in-CI dependency-audit step** (the only layer that *blocks a PR that introduces* a vulnerable dependency). These are complementary, not redundant — see §6.
- **Automated review:** the **Anthropic Claude Code GitHub Action** (`anthropics/claude-code-action`), chosen over GitHub Copilot review (separate paid subscription, configured in repo settings rather than a version-controlled workflow). It fits this repo's Claude-centric workflow and holds changes to the conventions in `CLAUDE.md`.
  - **Revision (during implementation):** the owner found that `ANTHROPIC_API_KEY` bills against pay-as-you-go Anthropic API credits (separate from their Max subscription) and so dropped the **auto-review-on-every-PR** workflow. The Claude integration is reduced to the **on-demand `@claude` responder** only (`claude.yml`), authenticated with **`CLAUDE_CODE_OAUTH_TOKEN`** (a Claude Pro/Max subscription token from `claude setup-token`) so it draws on the subscription quota rather than API credits. There is **no automated review status check**; merge review is the human owner's approval plus the deterministic build/test/CodeQL checks.

### Repository visibility

The owner has made the repo **public** (`flydyk-family/family-tree` is public as of this writing). Real family data is **not** committed — it lives in local storage, and the committed `family.json` is sample data — so the usual privacy objection to a public genealogy repo does not apply here. Going public unlocks, **for free**:

- **CodeQL** code scanning (C# + JS/TS).
- **Secret scanning + push protection**.
- **Unlimited GitHub Actions minutes** (private repos draw down a monthly quota).

Dependabot is free on private and public repos alike, so it is unaffected by the switch.

**Public-repo security caveat (designed around):** GitHub does **not** expose repository secrets to workflows triggered from **forks**. The `@claude` responder needs `CLAUDE_CODE_OAUTH_TOKEN`, so it works for collaborators on **branches in this repo** but **not** from outside forks. We deliberately avoid `pull_request_target` (which *would* expose secrets to fork code and is a well-known privilege-escalation footgun). This is an accepted limitation, documented for the owner.

## 3. Scope

**In scope**
- `.github/workflows/ci.yml` — build + test (backend and frontend) + dependency-audit.
- `.github/workflows/codeql.yml` — CodeQL SAST (C# + JS/TS), advanced setup (version-controlled).
- `.github/workflows/claude.yml` — interactive `@claude` responder on PR/issue comments (OAuth-token auth; see §2 revision). *(The originally-planned auto-review-on-every-PR workflow was dropped — see §2 revision and §7.)*
- `.github/dependabot.yml` — version + security update PRs (nuget, npm, github-actions).
- `.github/CODEOWNERS` — auto-request the owner and enable "require review from Code Owners".
- A delivery note (in this spec, §9) listing the owner-only GitHub settings (secret, branch protection / ruleset, security toggles).

**Out of scope (now)**
- The other two §12 CI-CD items — **continuous delivery to a dev host** and **release delivery to a public host** — are separate roadmap entries with their own spec/plan later. This change is *gates only*, not deploys.
- Enforcing the required checks programmatically. Branch protection needs repo-admin and is best set once in the UI/ruleset; we **document** it rather than script it. (`gh api` scripting is offered as optional in the plan but is not the deliverable.)
- An automated AI review gate. Per the §2 revision, only the on-demand `@claude` responder remains; there is no per-PR AI review check.

## 4. Workflow organization

**Split workflows by concern** (vs. one monolithic file): each file has a single purpose, independent triggers, and the minimum permissions for its job. CodeQL needs `security-events: write`; Claude needs `pull-requests: write`; build/test needs neither — separating them keeps each token least-privileged and gives branch protection clean, stable check names to require. A YAML error in one gate does not disable the others.

## 5. Build + test — `ci.yml`

**Triggers** (per the delivery workflow, `main` is trunk and releases are cut as `release-X.Y.Z`):

```yaml
on:
  pull_request:
    branches: [main, "release-*"]
  push:
    branches: [main, "release-*"]
```

So PRs into — and pushes onto — `main` **and** any `release-*` branch are gated identically.

**Concurrency:** cancel superseded runs per ref:

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

**Job `backend`** (`ubuntu-latest`):
1. `actions/checkout@v6`.
2. `actions/setup-dotnet@v5` with `dotnet-version: 10.0.x`.
3. `dotnet restore` (the root `FamilyTree.slnx` is picked up automatically).
4. `dotnet build --no-restore -c Release`.
5. `dotnet test --no-build -c Release` (covers `tests/unit` + `tests/integration`).
6. **Dependency-audit step:** `dotnet list package --vulnerable --include-transitive`, parsed to **fail the job** if any vulnerable package is reported (the CLI exits 0 even when vulnerabilities are found, so the step greps the output and exits non-zero on a match).

**Job `frontend`** (`ubuntu-latest`, `working-directory: src/frontend`):
1. `actions/checkout@v6`.
2. `actions/setup-node@v6` with `node-version: 22` and `cache: npm`, `cache-dependency-path: src/frontend/package-lock.json`.
3. `npm ci`.
4. `npm run build` (this is `vue-tsc -b && vite build` — i.e. **type-check + production build**, matching CLAUDE.md).
5. `npm test` (`vitest run`).
6. **Dependency-audit step:** `npm audit --audit-level=high` (fails on high/critical advisories; threshold is tunable).

**SDK/runtime versions:** .NET pinned to `10.0.x` (matches `Directory.Build.props` `net10.0`; runners do not preinstall it). Node pinned to `22` (LTS; satisfies Vite 5's `^18 || >=20`). No NuGet lockfile exists, so restore is a plain `dotnet restore` (no `--locked-mode`); frontend uses the committed `package-lock.json` via `npm ci`.

## 6. Security — `codeql.yml` + `dependabot.yml` + the audit step

Three complementary layers — explicitly **not** stacking the same check twice:

- **CodeQL (`codeql.yml`)** — static / dataflow analysis of **our own code**. Catches injection, unsafe deserialization, etc. Deterministic, results in the **Security** tab.
- **Dependabot (`dependabot.yml`)** — watches **dependency manifests** (incl. transitive) against GitHub's Advisory DB and opens **update PRs**. Continuous and ongoing, but it **alerts/opens PRs after the fact — it does not block a PR**.
- **In-CI dependency-audit step (in `ci.yml`, §5)** — the only layer that **blocks at PR time** a change that introduces a known-vulnerable dependency. CodeQL would not catch this (it analyzes our code, not third-party CVEs), and Dependabot only reacts post-merge — hence the gap this step closes.

Why this is *not* redundant with the Claude review: Claude reviews the **diff** for logic/design, is non-deterministic, and has **no live CVE database**. It cannot replace deterministic SAST or a CVE-backed dependency scanner.

### `codeql.yml`

**Triggers:** same branch set as CI plus a weekly cron:

```yaml
on:
  pull_request:
    branches: [main, "release-*"]
  push:
    branches: [main, "release-*"]
  schedule:
    - cron: "23 3 * * 1"   # weekly, Monday — fixed minute to avoid the top-of-hour stampede
```

**Permissions (job level):** `security-events: write`, `packages: read`, `actions: read`, `contents: read`.

**Matrix over languages:**

| Language | `build-mode` | Notes |
|---|---|---|
| `csharp` | `manual` | Runners don't ship the .NET 10 SDK, so CodeQL `autobuild` is unreliable. Run `actions/setup-dotnet@v5` (`10.0.x`) then `dotnet build` explicitly between `init` and `analyze`. |
| `javascript-typescript` | `none` | Interpreted; no build step needed. |

Steps per matrix entry: `checkout` → (`csharp` only: `setup-dotnet`) → `github/codeql-action/init@v3` (with `languages`, `build-mode`) → (`csharp` only: `dotnet restore && dotnet build`) → `github/codeql-action/analyze@v3`.

### `dependabot.yml`

Three ecosystems, weekly, grouped to reduce PR noise, targeting the **default branch** (`main`) only — deliberately *not* every `release-*` branch, to avoid duplicate dep PRs:

| `package-ecosystem` | `directory` |
|---|---|
| `nuget` | `/` (the `.slnx` + central `Directory.Packages.props` live at the root) |
| `npm` | `/src/frontend` |
| `github-actions` | `/` (keeps the action pins above current) |

Each ecosystem: `schedule.interval: weekly`, a `groups` entry collapsing minor/patch bumps into one PR, and a sane `open-pull-requests-limit`.

## 7. Claude integration — `claude.yml` (on-demand `@claude` responder)

Per the §2 revision, there is **no automated per-PR review workflow**. The only Claude integration is the interactive responder.

Responds when someone comments `@claude …` on an issue or PR (events: `issue_comment`, `pull_request_review_comment`, plus `issues`/`pull_request_review` as the action documents), gated by an `if:` that checks for the `@claude` trigger phrase. Authenticated with **`claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`** (Claude Pro/Max subscription quota via `claude setup-token`), not `ANTHROPIC_API_KEY`. Lets the owner ask follow-ups ("@claude is this handler thread-safe?") directly on the PR, on demand, so it costs subscription quota only when invoked.

**No automated review gate.** Merge review is the human owner's approval (CLAUDE.md: "Do not self-merge … the owner reviews and merges") plus the deterministic `backend` / `frontend` / `CodeQL` checks. Claude assists only when explicitly invoked.

## 8. `CODEOWNERS`

`.github/CODEOWNERS` with `* @flydyk` (the owner account, resolved via `gh api user`) so the owner is auto-requested on every PR and "Require review from Code Owners" (§9) is meaningful. Can be switched to a team like `@flydyk-family/maintainers` later.

## 9. Delivery note — owner-only GitHub settings

These need **repo-admin** and are set in the GitHub UI (or via `gh`/Rulesets API); they are **not** in version control:

1. **Secret:** add repository secret **`CLAUDE_CODE_OAUTH_TOKEN`** (Settings → Secrets and variables → Actions), generated with `claude setup-token` (Pro/Max subscription quota — no API billing). Without it, the `@claude` responder fails. *(Not required for the build/test/CodeQL gates.)*
2. **Make the repo public** — **already done** (the repo is public); this unlocked free CodeQL, secret scanning, and unlimited Actions minutes.
3. **Code security toggles** (Settings → Code security): enable **Dependabot alerts** + **Dependabot security updates**, and **Secret scanning** + **Push protection**.
4. **Branch protection / ruleset for `main`** (and ideally a matching rule for `release-*`):
   - Require a pull request before merging; **require 1 approval**; *(optional)* **require review from Code Owners**; dismiss stale approvals on new commits.
   - **Require status checks to pass** + **require branches up to date**, selecting: **`backend`**, **`frontend`**, **`Analyze (csharp, manual)`**, **`Analyze (javascript-typescript, none)`** (exact names confirmed from PR #15; a `CodeQL` aggregate check also exists).
   - **Require conversation resolution before merging.**
   - **Require linear history** (matches the squash-merge workflow).
   - **Do not allow bypassing the above settings** / restrict who can push.

After these are set, the CLAUDE.md flow holds: branch off `main` (or a `release-*`), open a PR, gates run, the **owner** reviews and squash-merges — no self-merge.

## 10. Testing / verification strategy

CI workflows are validated by **running them**, not by unit tests:

- **Lint locally** with `actionlint` (and `yamllint` if available) before committing, to catch syntax/expression errors early.
- **Mirror each CI command locally** to prove the steps themselves are green: `dotnet build -c Release` + `dotnet test -c Release`; and in `src/frontend`, `npm ci` + `npm run build` + `npm test`. Also dry-run the audit commands (`dotnet list package --vulnerable --include-transitive`, `npm audit --omit=dev --audit-level=high`).
- **End-to-end validation** happens on the **first PR** that uses these workflows: confirm each job runs on `pull_request` into `main` (and a `release-*` test branch) and the dependency-audit and CodeQL jobs report. This is inherently a post-merge/owner step and is called out as such.

No application source changes are involved, so no app unit/integration tests are added; the existing suites are simply *exercised* by CI.

## 11. Conventions

- Workflow/action versions are **pinned to major tags**, using the current majors verified at implementation time — `actions/checkout@v6`, `actions/setup-node@v6`, `actions/setup-dotnet@v5`, `github/codeql-action@v3`, `anthropics/claude-code-action@v1` — for readable, maintainable updates; the `github-actions` Dependabot ecosystem keeps them current.
- YAML: 2-space indent, lowercase job ids that double as the **required-check names** referenced in §9 (`backend`, `frontend`).
- Least-privilege `permissions:` per workflow; secrets only where required (`CLAUDE_CODE_OAUTH_TOKEN`, for the `@claude` responder).
- Files live under `.github/` per GitHub convention; nothing else in the repo changes.
