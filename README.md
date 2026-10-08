# AI Pilled

Merged PRs authored by known AI-agent accounts across public GitHub repos.
Built for fun by Polylane. [Public source](https://github.com/coreplanelabs/pilledrepos).

## Local preview

Use Node 22.22+ and Bun 1.3. Existing indexed data is stored in `.data/repos.sqlite`.

```sh
bun install --frozen-lockfile
bun run build
bun run dev -- --use-gh
```

Open http://127.0.0.1:4189. The hero accepts `owner/repo` or a GitHub URL.
User enrollment sets durable database membership immediately, including when the
first read fails. It remains active regardless of stars, PR volume, or AI share.
The next daily run includes it. No TTL, daily reseeding, or automatic removal is used.

Every complete read with merged PRs receives a rank. Sort the full list by AI share;
infinite scroll has no 100-row or percentage cap. Empty windows remain enrolled but
do not create a false percentage row. Counts stay visible for small samples.
Rank links use native row anchors and highlight the target. One-click pills open
repo pages directly and require complete reads with at least 100 merged PRs.

## Daily data refresh

```sh
bun run list:index                 # read the fixed database list
bun run index -- --use-gh          # refresh only that list
node scripts/save-repo-snapshots.mjs --existing-only
```

GitHub Actions runs at 10:00 UTC daily. The job queries `repos WHERE indexed=1`.
It never runs discovery, seeds a new list, inserts new catalog records, or changes
membership. It updates existing metrics and publishes only the complete captured
cohort. User additions made during a run are included in the following daily run.
A failed read preserves registration and the previous complete dataset. Resume
checkpoints with `--resume=RUN_ID`; partial results never become zeros.

The GitHub CLI login is for local public reads. Unattended runs need the new
project's dedicated `AI_PILLED_GITHUB_TOKEN` / production `GITHUB_READ_TOKEN`.
Never copy Repo Lore secrets. Production needs its own credentials and initialized data.

## One-off discovery and enrollment

These commands are operator actions, separate from the daily workflow:

```sh
bun run seed:repos -- --use-gh              # discover a candidate pool
bun run backfill -- --use-gh               # capture it once; active pointer stays unchanged
node scripts/seed-repo-db.mjs              # register candidate metadata as archive
node scripts/save-repo-snapshots.mjs --run=DISCOVERY_RUN_ID
bun run enroll:index                      # choose active membership once
bun run index -- --use-gh                  # refresh the selected database entries
```

The frozen broad pool starts with 10,000 public, non-fork, non-archived software
repos ranked by stars, pushed within 90 days. It requires a primary language and
excludes named tutorial/curated-resource lists. Search partitions star ranges to
avoid GitHub's 1,000-result cap. The initial selected star cutoff was 3,357.
This is a discovery starting point, not a daily query or an ICP qualification claim.

One-off enrollment admits complete candidates with at least 100 merged PRs,
without an AI-percentage threshold. It also includes reviewed technology overrides
in `src/curated-repos.ts` and all user submissions. Lower-star candidates from the
previous agent-tool discovery remain available; Terreno and Weave are included.
The local active list currently has 2,400 entries. Captured archives remain stored;
being in the archive does not make a repo part of daily refresh.

[Polylane's ICP](https://personas.polylane.com/icp) is teams building with AI daily,
at any scale, with commercial intent. Stars, activity, and agent-authored PRs are
public discovery signals, not proof of that temperament or intent. Familiar
technologies such as Kubernetes and PostHog are reviewed overrides even at low
agent shares. AI-assisted PRs submitted under a person's account do not count as
known-agent authorship. Do not use this metric alone to qualify prospects.

## Checks and release

```sh
bun run typecheck
bun run test
bun run build
node scripts/release-guard.mjs --local
bun run wrangler deploy --dry-run
npm pack --dry-run --ignore-scripts
```

See [METHOD.md](METHOD.md), [VALIDATION.md](VALIDATION.md), and
[DEPLOYMENT.md](DEPLOYMENT.md). Pull requests run validation. Each main merge
must pass the same checks before publishing a source-bound npm version under
`next`, deploying the exact checked revision, and validating the public site.
