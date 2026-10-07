# Contributing

Open a branch or fork and submit a pull request against `main`. Use Node 22+
and Bun 1.4.2. Keep tests offline, copy plain, coverage explicit, and source
links intact. Read [AGENTS.md](AGENTS.md) and [METHOD.md](METHOD.md).

Describe the idea before a large change. Keep missing-data states intact; never
turn absent records into zero counts or invented winners. Avoid quality rankings,
AI-authorship claims, or personal criticism based on comment counts.

```sh
bun install --frozen-lockfile
bun run build
bun run typecheck
bun run test
node --test test/release-guard.test.mjs
node scripts/release-guard.mjs --local
bun run wrangler versions upload --dry-run
```

Include what changed and validation results. For visual changes, include desktop
and mobile screenshots in light and dark themes.
Never commit credentials, captured private data, or generated output.
Ordinary contributions do not change hosting, Access, publication, or secrets.
The npm package stays private.

The intended release process requires the current GitHub Actions `check`, an
up-to-date branch, one independent approval after the latest push, and resolved
conversations. Justin temporarily deferred required reviews until CI/CD ships;
[DEPLOYMENT.md](DEPLOYMENT.md) gives the activation order. Once enabled, new
commits dismiss approvals. These rules apply to admins; force pushes and
deletion are disabled. Maintainers squash merge. There are multiple writers;
the PR author cannot self-approve. If only one writer remains, add a trusted
reviewer rather than bypassing checks or pretending self-review is independent.

Fork PRs run with read-only permissions and no production credentials. A
maintainer must approve runs from external contributors after inspecting the
diff, especially workflow changes. This approves running CI, not merging.
Never execute fork code through `pull_request_target`.

Successful checks on merged `main` trigger the production job. PRs never deploy.
Release credentials and recovery steps are in [DEPLOYMENT.md](DEPLOYMENT.md).
