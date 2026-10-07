# Measurement

Known AI share = verified AI-agent authored merged PRs / all merged PRs in the
same rolling 90-day window. Dates use UTC. Both window boundaries are inclusive.
This measures author accounts. It cannot measure all AI-assisted code.

## Author groups

- Known AI agents: stable GitHub account IDs in the evidence-backed registry.
- User accounts: non-bot accounts outside that registry. They may use AI.
- Other bots: all remaining GitHub Bot accounts, including Copybara, Dependabot,
  release bots, and GitHub Actions. A name or bio never changes this group.
- Unknown authors: missing/deleted author records. They stay in the denominator.

Two verified accounts for the same agent are grouped in the agent mix. The PR
count is unchanged. Login names are display fields, not classification keys.
Explicit coauthor credits are outside the first metric; they may become a separate
signal later. No language model guesses who wrote code.

## Collector

`merged-window-v2` reads public repository metadata, then queries merged PRs by
merge date in a frozen rolling 90-day window. It pages 100 matches at a time.
Windows over GitHub's 1,000-result search limit split recursively into disjoint
half-open time intervals. Every leaf must return exactly its reported count, and
child counts must reconcile with the parent. Duplicate, foreign, private,
out-of-window, malformed, or missing-ID records fail capture. Null authors stay
unknown. Public repository renames use the canonical name returned by GitHub.

Search boundaries use whole UTC seconds; the collector then applies the exact
capture timestamp. It includes old-created PRs merged recently. It does not depend
on update ordering, comment count, or an arbitrary latest-PR slice. There is a
1,000-query safety cap per repo. A window with more than 1,000 merges in a single
second cannot be partitioned and fails. Caps never produce an eligible partial
score.

This is a census of available search matches, not a uniform PR sample. GitHub's
search index can lag and does not provide an atomic snapshot. Count reconciliation
catches some changes, not all. Deleted or not-yet-indexed PRs can affect coverage.
“Complete” means every reported search match was captured and validated; it does
not prove that GitHub has indexed every real-world event. The initial attempt
using update-ordered connections was rejected after real API results showed
non-monotonic returned update timestamps; those captures are excluded.

Copied Repo Lore checkpoints include up to 20 discussion-heavy PRs. Their counts
are local preview evidence only. They do not qualify for ranking or history.

## Ranking

Only complete 90-day reads with at least 100 merged PRs qualify. At this minimum,
one PR changes the share by at most one percentage point. This limits extreme
small-window results, but is not a confidence guarantee. Smaller windows show
counts and a small-window note. An empty window has no percentage.

Rank is descending known AI share. Exact equal ratios share the same competition
rank (1, 1, 3). Larger denominators order equal-share rows for display. The default
comparison pool is the 1,000 highest-star public, active, non-fork repos found by
GitHub repository search. The frozen pool, time, and capture count are stored with
the index. Missing captures prevent publication. A named or limited pool is
labeled as such. A repo outside the published pool has no pool rank.

## Registry

Every new index run validates all known accounts through `/user/{stable ID}`.
It fetches GitHub's official partner coding-agent install declarations, resolves
the declared app bot aliases, and checks stable ID, Bot type, and exact app URL.
Only explicit declarations in this official source can add an agent automatically.
A changed parser format or missing source stops the run. Existing approved vendor
sources are fetched and hashed. Each immutable run retains the full registry,
verification date, account/app evidence, and source SHA or SHA-256 digests.

New observed bot IDs are written to `candidates.json` for source review. They
remain other bots. Discovery is intentionally bounded: accounts not explicitly
covered by official declarations need a reviewed registry update with a vendor
source and verified account ID. A Bot type, AI-looking name, or bio is insufficient.
The registry does not promise universal AI detection.

## Durable reads and history

Daily indexing and the initial backfill execute `scripts/refresh-index.mjs`.
A run freezes its capture time, pool, and registry; retries reuse those facts.
Per-repo checkpoints make the run resumable. A local owner lock prevents overlapping writers. Only a complete index is written
before an atomic rename switches `current.json`. Capture or write failure leaves
the previous pointer intact. Nothing is published to Cloudflare by this script.

Every eligible capture records its AI count, denominator, time, registry evidence
version, and account-classification digest. History compares completed daily
observations with the same ID-to-agent mapping. Changing evidence fetch dates
alone does not erase history. Changing the classification starts a new comparison
series. Seed samples never create movement. The UI shows no change until two real
daily reads exist. Rolling windows overlap; movement is not causal evidence.

Percentages display one decimal at most. A nonzero share below 0.1% displays as
less than 0.1%, rather than a false zero. Rank uses full ratios. Public PR links,
account links, source links, sample scope, and count/denominator stay visible.
