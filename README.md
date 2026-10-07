# <img src="public/favicon.svg" alt="" width="40" height="40"> Repo Lore

The merge machines, delete legends, and main characters behind a GitHub repo.

Paste `owner/repo` or a GitHub URL. The result lives at
`repolore.fun/owner/repo`: copy that URL to pass it around. Each award links to a
leaderboard comparing snapshots from popular repositories and to the source PRs.

[repolore.fun](https://repolore.fun) currently requires Coreplane Cloudflare SSO.
The source and local app are public. Search engines and social preview crawlers
cannot pass that SSO gate; the canonical pages and PNG previews are ready for a
public launch when the gate is removed.

![Repo Lore Open Graph preview](docs/example.png)

## Run locally

Use Node 22 or later and Bun for development dependencies.

```sh
bun install --frozen-lockfile
bun run build
bun run dev
```

Open http://127.0.0.1:4178. Repo pages, leaderboards, avatars, and PNG previews
use the same local server as the hosted Worker. Set `REPO_ARCADE_PORT` to choose
another port. Saved snapshots live in `.data`, which is ignored by Git.

## What the awards mean

| Award | Measurement |
| --- | --- |
| Merge Machine | Author with the most observed merges in the snapshot |
| Delete Club | Largest deletion on one inspected merged PR; additions stay visible |
| Comment Magnet | Most discussion comments on one inspected merged PR |
| The Cast | Distinct author accounts, including bots; top three photos and a rest count |
| The Long Goodbye | Oldest open PR by calendar age |
| Fastest Lap | Shortest observed interval between PR opening and merge |
| Big Bang | Most lines added in one inspected merged PR |
| Human Touch | Observed merges attributed to GitHub user accounts |
| Bot Party | Number of observed merged PRs authored by GitHub bot accounts |

These do not measure developer skill, AI authorship, or contribution policy.
They use bounded 90-day snapshots, not lifetime totals. The main-character
standings use authored merges; clicking the merge button is a different action.
Bot participation uses GitHub's account type, not an authorship guess.

Cross-repo leaderboards compare each repo's observed winning value. Delete Club
compares **one PR**, not a person's total deleted lines. Every row keeps its PR
link, read date, and inspected count. Some repositories have few eligible merged PRs. See [METHOD.md](METHOD.md) for calculations and limits.

## Pages and previews

- `/owner/repo`: server-rendered result, canonical URL, repo identity, and metadata.
- `/leaderboards/delete`: cross-repo Delete Club; the other eight categories have pages too.
- `/_og/owner/repo.png?v=<capture timestamp>`: a 1200 × 630 PNG for that snapshot.
- `/_avatar/u/<id>` and `/_avatar/in/<app-id>`: bounded GitHub photo proxies.
- `/sitemap.xml`: known popular repo pages and leaderboard pages.

The page and its preview use the same saved facts. Titles, descriptions,
`og:image`, Twitter large-image metadata, and structured data are emitted before
JavaScript runs. GitHub's repo-owner avatar supplies repo identity. Contributor
portraits preserve the API's user or app avatar source. Missing photos get a
simple fallback; they do not affect scores.

Previews use local DM Sans font buffers and resvg WASM. The design avoids costly
SVG blur filters, and rendered PNGs are reused in each Worker isolate. No font
CDN, browser screenshot service, or inference provider is required.

## GitHub data and caching

A read checks public metadata first, then reads up to 100 recently updated
closed PRs, the 30 oldest open PRs, and details for up to ten selected recent
merges. The PR scan uses at most 14 GitHub requests, with two diff reads at a time.
One optional request reads aggregate star history after public validation. A 24-second
deadline and eight-million-character response cap bound the scan. Private repos
are rejected even when a server credential is configured.

Indexed repos reuse their saved snapshot; the scheduler refreshes the index.
An on-demand repo uses a 15-minute temporary cache and is not added to the index.
If GitHub is temporarily unavailable or rate-limited, an existing snapshot can
still be shown with its original date and a note. An unknown repo without a
snapshot gets a plain error. Indexed versioned OG snapshots expire after seven days; temporary ones after
fifteen minutes;
an expired version never silently uses different facts.

Anonymous GitHub quota is limited by source IP. A public-read GitHub credential
can be configured as a Worker secret for a larger quota. It stays on the server,
is sent only to GitHub's API, and never goes to browsers, avatars, HTML, or cache.
Local development uses `REPOLORE_GITHUB_TOKEN` only when explicitly provided.
No runtime reads the developer's GitHub CLI login or switches credentials.

## Daily comparisons

`Refresh daily index` runs every day at 10:00 UTC on GitHub Actions. The same
script performs the first backfill and daily refreshes:

```sh
bun run build
# Explicit maintainer reads through your existing gh login; no credential export.
node scripts/refresh-index.mjs --use-gh --limit=1000
# Capture and publish with the existing, authorized Wrangler OAuth login.
node scripts/refresh-index.mjs --use-gh --limit=1000 --publish-via-wrangler
```

The script discovers up to 1,000 most-starred public, non-fork, non-archived repos.
For each it checks public metadata, then reads up to 100 recently updated merged
PRs, 20 discussion-heavy merged PR candidates, and the 30 oldest open PRs.
GitHub's aggregate PR discussion count supplies Comment Magnet. Missing inline
counts remain unknown. Legacy anonymous reports use inline counts and do not
enter the aggregate Comment Magnet board.

Main boards show ten results. **Show top 100** opens
`/leaderboards/<category>/top-100`. Top stars ranks the broad discovered pool;
Trending ranks members with positive star additions over the last 30 days.
Every award ranks its own numeric score, not star count. No LLM chooses repos.
These are pool rankings, not a claim to all GitHub PRs.

Checkpoints in `.data/index` let an interrupted same-day run resume. CI restores missing checkpoints and daily histories from the last published dataset when its Actions cache is cold. GitHub
quota resets pause capture rather than discard it. Successful reads add actual
daily history points; missing days stay missing. A refresh with fewer than 100
readable repos or more than 10% failed captures cannot publish. Only successful,
same-day reports enter the new rankings.

Publication writes versioned dataset keys first and switches the catalog last,
after a propagation grace period. Failed data writes leave the old catalog
selected. KV is eventually consistent; a temporarily missing new board returns
a plain unavailable response instead of combining datasets. The site displays
**Refreshed daily** and the last successful refresh in the viewer's timezone.
GitHub Actions can start scheduled runs late; this is a daily cadence, not an
exact-time service guarantee.

CI uses its ephemeral read-only `GH_TOKEN` and the separate production secret
`CLOUDFLARE_INDEX_TOKEN` for KV publication. See [DEPLOYMENT.md](DEPLOYMENT.md).
The older Worker refresh hook stops writing once a daily dataset is active.
Arbitrary lookups use a temporary cache and do not enlarge the indexed pool.

Repo graphs show human/bot merge shares, sampled daily merge activity, daily star additions and actual total-star readings, and the repo's Comment Magnet comparison. Unknown accounts stay
separate. Missing days and history are not fabricated.

## For terminal users and agents

```sh
node scripts/report.mjs owner/repo
node scripts/report.mjs owner/repo --json
node scripts/report.mjs --input saved-evidence.json
```

JSON contains the plain-language summary, awards, coverage, and normalized
source facts. Show the summary and source links, and retain scope when quoting
numbers. Replay reproduces saved facts offline; it does not verify them against
GitHub. The CLI uses public anonymous reads and performs no repository writes.

## Development and hosting

```sh
bun run build
bun run typecheck
bun run test
```

Tests stay offline with injected fetch, storage, clock, and rendering boundaries.
Build before typecheck: CLI entry points consume compiled modules. Browser and
real PNG checks are separate. [RESEARCH.md](RESEARCH.md) records design references;
[DEPLOYMENT.md](DEPLOYMENT.md) covers account binding, KV, secrets, and SSO.

Light, Dark, and System themes use local fonts. The green values are CSS tokens:
light `#29E047`, dark `#3FF35D`. Motion respects reduced-motion preferences.
The footer credits Polylane: built for fun.

## License

Code is MIT-licensed. Fonts, icons, and the PNG renderer retain their licenses;
GitHub photos retain their owners' rights. See [THIRD_PARTY.md](THIRD_PARTY.md).
The package remains private on npm with a publication refusal.

## Star history backfill

GitHub's public aggregate `/repos/owner/repo/stargazers/history` endpoint
returns weekly groups with seven daily addition counts. Repo Lore reads six
weeks, keeps the last 30 dates before the current UTC date, and preserves missing
dates as missing. GitHub calendar boundaries may differ from UTC. These are
**stars added**, not net growth after unstars or historical total-star balances.

For the saved public comparison set, an explicit maintainer backfill uses `gh`
without saving its credential:

```sh
bun run build
node scripts/backfill-stars.mjs --popular
wrangler kv bulk put .data/star-seed.json --binding REPORTS --remote
```

Hover or keyboard focus opens positioned explanations on desktop. Phones and
touch devices use a tap-open modal with a close button and Escape support.

Award cards lead each repo page. Their small comparison strip shows the adjacent
repos in the saved index, plus an on-demand repo when relevant. Rankings use the
award's numeric measurement: larger values lead except Fastest Lap, where less
time leads. Equal scores share a competition rank and say “Level with.” Different
capture times and listing limits still apply; these are snapshot comparisons.

Bot Party counts bot-authored merged PRs in the 90-day snapshot, not individual
commits, merge actors, bot-written lines, or AI-written code. It shows the share
of observed merges and links example bot PRs. Missing authors remain unknown.
The cross-repo board ranks bot merge counts and shows the repo's bot crew.

## Navigation and mobile behavior

Repo links, award categories, and Trending/Top stars switches navigate within
the current page. Direct URLs still render on the server for previews and
indexing. Back/forward navigation, canonical metadata, and award fragments remain
usable. The saved theme is applied before styles paint on a fresh document.

Homepage suggestions are the top three Merge Machine results within the
Trending cohort; missing growth data uses the same saved-repo fallback as the
boards. Confetti celebrates a successful submission, or the first visit to a
repo with a positive top-ten award result. Returning to a cached result does
not replay it. Reduced-motion preferences suppress confetti and hover motion.

The mobile header follows scroll direction with small thresholds to avoid
flicker. Scrolling retains browser-native inertia. Input text is at least 16px
to avoid iOS focus zoom; the mobile viewport and touch settings disable page
zoom where supported by the browser. Safe-area padding protects header/footer
controls. Only award artwork and the brand logo rotate on hover.

The nine-card homepage grid uses the #1 result from each Trending award board and links
to that board. Repo suggestions use custom repository artwork when GitHub has
one, organization logos otherwise, and a project monogram for personal repos
without artwork. Contributor faces stay on the contributor results. Artwork is
proxied from validated GitHub image hosts; no credential is sent to image hosts.
