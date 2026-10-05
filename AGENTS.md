# Agent rules

## GitHub / git: never auto-merge

Do **not** merge branches or pull requests unless the current user message explicitly names the source, the target, and says to merge.

Forbidden unless that explicit order is present:

- `gh pr merge`
- `git merge` / merging via GitHub API
- merging because a PR was opened, CI is green, or the user asked "can I merge?"
- promoting `qa` → `full-stack` (or any other pair) as a side effect of another merge

Create a PR only when asked. Stop after the PR URL. Do not merge it.

See also `.cursor/rules/no-auto-merge.mdc`.
