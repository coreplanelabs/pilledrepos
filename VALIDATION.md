# Local prototype validation

Validated on October 7, 2026. No production change or remote Git write occurred.

## Source checks

- 45 offline tests passed on Node 22.18.0 and Node 26.6.0.
- Bun 1.3.0 frozen install, test, typecheck, and build passed.
- TypeScript browser and server checks passed. The index runner passed Node's
  syntax check. Git whitespace checks passed.
- Tests cover stable IDs, renamed logins, non-AI bots, missing authors, denominator
  integrity, small windows, incomplete/legacy exclusion, tied ranks, registry
  failures, date partitioning beyond 1,000 search matches, count reconciliation,
  canonical URLs, comparison, escaping, image scope, and failed publication.
- Failure tests prove that an incomplete capture, pool mismatch, mixed timestamps,
  failed write, or attempt to replace an immutable dataset retains the old pointer.
  Transient reads have a fixed three-attempt bound; access refusals and semantic
  failures do not retry through new credentials.

## Real capture

The same `scripts/refresh-index.mjs` ran the initial backfill and resume.

- Complete pool: 1,000 public, active, non-fork repos, selected by stars.
- Capture time: `2026-10-07T22:05:09.357Z`.
- Eligible repos: 372, with complete windows and at least 100 merged PRs.
- Merged PRs: 395,975. All four author groups sum to this denominator.
- Known agent authors: 3,032 PRs from nine verified account IDs.
- User accounts: 356,520 PRs. Other bots: 36,351. Unknown authors: 72.
- Candidate queue: 126 bot IDs, retained outside the AI count for source review.
- Registry evidence version:
  `2f6a7148d577156c739aa67a0db568467d52a687c9254d7fc25064af282bc6f8`.

Five initial reads failed. The prior complete nine-repo index remained active.
Resuming the same run reused checkpoints and completed all 1,000 captures before
switching the pointer. A previous update-ordered collector and an invalid repeated
merge qualifier were rejected; their captures do not enter this leaderboard.
The reviewed collector uses a single merge-date range, split below the search cap.

Example: `usestrix/strix` has 142 known-agent authors among 277 merged PRs, or
51.3%, ranked first among 372 eligible repos in this pool. Its old biased seed
preview showed 58.6%. Search indexing can lag; this is the complete set of available
search matches, not proof of all AI use or an atomic historical GitHub snapshot.

Checkpoints, raw read pages, registry evidence, history, and the published local
index are retained under `.data/index/runs/2026-10-07t22-05-09-355z/`.
The local pointer is `.data/index/current.json`. These public data artifacts are
ignored by Git. The original copied seed remains in `.data/seed/repolore`.

## Visual and browser checks

- Desktop: 1440×1000, light theme. No horizontal overflow.
- Mobile: 390×844, dark theme. No horizontal overflow.
- Theme selection and system preference work; the final browser preference was
  restored to System and the temporary viewport override was removed.
- Comparison shows both counts and capture dates. Its canonical/share URL omits
  the comparison query. The copy control showed its success state.
- Browser console showed no errors or warnings in the tested result.
- OG output is a real 1200×630 PNG with repo identity, percentage, numerator,
  denominator, rank, time scope, and detection limits.
- History stays empty until two genuine daily observations exist. The two reads
  on the same day do not create a daily movement claim.

Proof files:

- `docs/prototype-desktop.jpg`
- `docs/prototype-mobile.jpg`
- `docs/prototype-og.png`

Preview: http://127.0.0.1:4189. A browser panel was queued for this child chat.
The local server stays running for review. No daily schedule is enabled yet.

## Deployment boundary

This repository has no remote or enabled deployment. Repo Lore's source, Worker,
KV, domain, environments, and secrets were not changed or reused. Independent CI
validation is prepared. Deployment setup stays pending the new repo/domain choice,
verification of the actual DNS-owning Cloudflare account, separate resources, and
new deployment authorization. Polycorp's DNS transfer is not assumed complete.
