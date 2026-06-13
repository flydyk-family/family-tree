// PreToolUse hook (gated to `gh pr create` via the `if` filter in
// .claude/settings.json). It injects a non-blocking reminder so the docs are
// kept in sync with every PR. It does not read stdin and never blocks — it
// only adds context for the model's next turn.
const reminder = [
  'A pull request is being created.',
  "Per this repo's workflow, keep the documentation in sync with the change:",
  'invoke the `update-docs-for-pr` skill to update docs/reference/ (and the',
  'README / CLAUDE.md project-overview if the product description changed) to',
  "match this branch's diff, then commit and push the doc edits onto the same",
  'branch so they land in this PR.',
  'If the diff has no behavior / API-contract / architecture / tooling impact',
  "(docs-only or test-only), note 'no doc update needed' and skip."
].join(' ');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    additionalContext: reminder
  }
}));
