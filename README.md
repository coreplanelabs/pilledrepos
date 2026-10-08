# AI Pilled

Merged PRs authored by known AI agents across public GitHub repositories.
Built for fun by Polylane. Source: [coreplanelabs/pilledrepos](https://github.com/coreplanelabs/pilledrepos).

## Run locally

Use Node 22.22+ and Bun 1.3.

```sh
bun install --frozen-lockfile
bun run build
node scripts/seed-repo-db.mjs
bun run index -- --use-gh
node scripts/save-repo-snapshots.mjs
bun run dev -- --use-gh
```

Open http://127.0.0.1:4189. The initial index reads all 10,000 seed repos.
Use `--limit=10` for a smaller diagnostic run, or `--resume=RUN_ID` to resume a
failed run. The previous complete index stays active until every read passes.
`--use-gh` uses the current GitHub CLI login for public reads. Alternatively, set
a dedicated read-only `AI_PILLED_GITHUB_TOKEN`. Never copy Repo Lore credentials.

The home page lists complete 90-day reads with at least 100 merged PRs. Click
**AI PRs** to sort by share ascending or descending across the full leaderboard.
Scrolling loads more rows in that same order. Equal shares rank by merged PR count, then repo name. Other saved repos
remain available through the repo form and their normal `owner/repo` URLs.

**Check repo** accepts `owner/repo` or a GitHub URL, saves the public repo in
`.data/repos.sqlite`, and reads its merged PRs. Registration has no expiration.
**Refresh** starts a new read. Failed reads keep the previous complete result and
queue another attempt in the weekly job. Large interactive reads have a 40-query
limit; background reads allow 1,000 queries.

## Seed and weekly index

`config/repo-seed.json` freezes 10,000 public, non-fork, non-archived software
repos, ranked by GitHub stars and pushed within the last 90 days. Discovery
partitions star ranges to pass GitHub's 1,000-result search cap. Curated lists,
tutorials, and repos without a primary language are excluded. The search starts
at 500 stars; the actual selected cutoff is stored in the seed. Coding-agent
config files are not required. Kubernetes and PostHog must be present before
selection can replace the seed. `scripts/seed-top-repos.mjs` rebuilds the pool
when reviewed. Each entry records its stable repo ID and public source URL.

The original agent-config-based seed selected too many small projects and has
been replaced. A larger seed does not change author classification: AI use under
an ordinary user account cannot be measured as an agent-authored PR.

The weekly workflow runs Monday at 10:00 UTC. It includes the seed and all user
submissions, checkpoints reads, updates permanent D1 metrics, and publishes a
verified compact dataset to dedicated KV. It switches the pointer only after
readback passes. No nightly job is used. The workflow requires production setup
before activation; see [DEPLOYMENT.md](DEPLOYMENT.md).

## Checks

```sh
bun run typecheck
bun run test
bun run build
node scripts/release-guard.mjs --local
bun run wrangler deploy --dry-run
npm pack --dry-run --ignore-scripts
```

See [METHOD.md](METHOD.md) for account matching and limitations, and
[VALIDATION.md](VALIDATION.md) for current local evidence. Repo Lore source,
resources, credentials, and deployment remain separate.
