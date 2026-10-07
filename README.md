# AI Pilled

A local experiment for comparing known AI-agent PR authors on public GitHub repos.
Built from Repo Lore main `bfaf2427228118dda65869ddb54ac35cb2eda447`.
The original project stays unchanged.

## Start

Use Node 22 or newer and Bun.

```sh
bun install --frozen-lockfile
bun run build
bun run preview:seed
bun run dev
```

Open http://127.0.0.1:4189. Set `AI_PILLED_PORT` to change the port.
Seed previews use the copied public checkpoints in `.data/seed/repolore`.
They are biased samples, so they cannot supply ranks or history.

## Capture real data

```sh
bun run build
bun run verify:registry -- --use-gh
bun run backfill -- --use-gh
# On later days, use the same script:
bun run index -- --use-gh
# Resume a failed run using the ID printed by the script:
bun run index -- --use-gh --resume=RUN_ID
```

The default pool is the top 1,000 public, active, non-fork repos with more than 500 stars, sorted by stars.
A run freezes its repo pool, capture time, and verified registry. It checkpoints
each repo. It switches the local `current.json` pointer only when every capture
passes. A failed run keeps the previous complete index.

For a smaller local check, use `--limit=10`. To capture named repos, use
`--repos=microsoft/vscode,openai/codex,vercel/next.js`. These results rank only
within that stated pool. A later complete run replaces the active pool.

`--use-gh` uses the existing GitHub CLI login for public reads. Unattended jobs
should instead use a separate read-only `AI_PILLED_GITHUB_TOKEN`. The local server
uses that token only if present, to cache on-demand public repo reads for 24 hours.
Do not copy tokens from Repo Lore. Without a token, the server reads local data.

A backfill is an initial census of the current 90-day window. It does not create
past daily observations. Change over time needs two real daily captures with the
same account classification.

## Check

```sh
bun run test
bun run typecheck
bun run build
```

The offline suite checks ID matching, neutral author counts, complete merge
pagination, limits, registry failures, ranking ties, source evidence, canonical
URLs, escaping, and atomic publication. See [METHOD.md](METHOD.md),
[RESEARCH.md](RESEARCH.md), [VALIDATION.md](VALIDATION.md), and
[DEPLOYMENT.md](DEPLOYMENT.md).

There is no remote or enabled deployment. Share the normal `owner/repo` page URL
once an independent deployment exists. Its metadata serves a 1200×630 PNG.

No daily schedule is active yet. The daily runner is ready; enable its schedule
only after the independent GitHub project and hosting resources are approved.

For local comparisons with public repos outside the index, run
`bun run dev -- --use-gh`. This uses the existing GitHub CLI login for public reads
and keeps a 24-hour local cache. The experiment token remains an alternative.
