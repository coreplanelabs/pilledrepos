# Award definitions

All timestamps come from GitHub records. The 90-day interval is inclusive of its
start and ends at the read's starting instant. Later merges are excluded. Time
is calendar time, including nights, weekends and draft periods.

## Reading scope

The daily index checks up to 1,000 public, non-fork, non-archived repos, discovered
by current stars. Each authenticated aggregate read selects up to 100 recently
updated merged PRs and 20 discussion-heavy merged PR candidates from the past
90 days, deduplicated by PR number. It reads additions, deletions and total PR
discussion counts for every selected eligible merge. The extra discussion
candidates reduce recent-only bias but do not prove a repository-wide maximum.
The merge/author/bot awards include those selected candidates too. Fast-moving
repositories still have sampled coverage. All detail and author identities are
bound to the public repository; partial GraphQL errors reject that capture.

The anonymous REST fallback has a smaller scope:

The closed listing is one page of 100 PRs ordered by `updated` descending.
Only records with a non-null `merged_at` inside the window count as merges.
The window is complete only when the listing returns fewer than 100 records,
or its oldest update precedes the window start, with valid ordered records and
no exclusions. Otherwise the result remains a sample. A closed PR is not assumed
merged. PRs whose required fields cannot be parsed are excluded visibly.

Anonymous REST reads select the ten most recently merged observed PRs for detailed counts.
Detail number, author ID, merge timestamp and head SHA must match the listing.
Changed bindings and unreadable counts are excluded. Awards name the largest
value among inspected records, not all PRs in the repository.

## Nine awards

| Award | Exact fact |
| --- | --- |
| Merge Machine | PR author ID with the most observed merges. Bot accounts are included. Ties are disclosed; account login breaks the display tie. This is not merge-button activity. |
| Delete Club | Inspected PR with the largest positive `deletions` count. The card also shows `additions`; it does not claim net shrinkage. All file types count. PR number breaks equal-value display ties. |
| Comment Magnet | Indexed reports: inspected PR with the largest positive GraphQL `totalCommentsCount`, GitHub's aggregate discussion count. Legacy anonymous reports: inline `review_comments`; these do not mix with indexed discussion scores. Neither measures sentiment or defects. |
| The Cast | Number of distinct identified author IDs among observed merged PRs. Bots count. Deleted/unidentified authors do not count. This does not identify newcomers or external contributors. |
| The Long Goodbye | Earliest `created_at` from GitHub's oldest-first open-PR listing. Drafts are included and identified. Calendar age is not review waiting time. Any unreadable open record makes this award unknown. |
| Big Bang | Inspected PR with the largest positive additions count. All file types count; this is gross additions, not net growth or effort. |
| Human Touch | Observed merges attributed to identified GitHub User accounts. Unknown authors are excluded. User type does not prove a human wrote the code or exclude automation. |
| Bot Party | Observed merged PRs whose author is a GitHub Bot account. |
| Fastest Lap | Shortest nonnegative opening-to-merge interval among observed merges. It includes waiting, draft time and automation; it is not engineering effort or deployment lead time. |

Missing evidence is unknown. A fully read scope with no positive award value is
empty. Zero comments or no recorded deletions does not mean perfect code. Returned
author names, coauthor prose, titles and bot identities cannot establish AI use.

## Contribution guidance

The community-profile endpoint may provide a contribution-guide URL. The app
accepts only a HTTPS github.com URL bound to this repository. It does not parse
prose into an authoritative open/closed policy. With no verified guide link, the
app links the repository's documentation and says the policy is unknown.

## Sharing and replay

Text, JSON and the page use one typed report. JSON retains the normalized input
facts; offline replay rebuilds the awards instead of trusting saved captions or
links. A selected evidence file is local input, not fresh provider verification.
The PNG includes read date, repository, observed merge count and inspected-diff
count. A page URL shows the indexed snapshot or a temporary on-demand capture.
Later visits can produce a newer snapshot.

The application performs public reads only. It has no email collection, fake events, sentiment classifier, telemetry, or repository mutations. Rankings apply only within the displayed indexed pool.

## Cross-repo comparisons

Each category compares the winning **observed** value from the saved snapshot
of each indexed popular repository. These are not lifetime or comprehensive
90-day leaderboards. Indexed reads cover up to 120 selected merged PRs; anonymous REST reads inspect at most ten eligible selected merges. The selection is bounded, not exhaustive. Inspected counts and
capture dates remain available through the row information control. A partial read can miss a larger event.

Delete Club compares gross deletions on one inspected PR. Comment Magnet compares
one PR's aggregate discussion count in version-2 indexed reports. Merge Machine compares observed authored merge
counts. The Cast compares distinct observed authors. The Long Goodbye compares
calendar age of an open PR; Fastest Lap compares opening-to-merge duration.
Scores use normalized facts, not numbers parsed from display prose.

GitHub API author IDs identify people and bots. Contributor photos use the API's
validated `avatars.githubusercontent.com/u/` or bot-app `/in/` source. Repo-owner
photos, stars, forks, and language come from the public metadata record. A photo
failure does not change an award. GitHub's `Bot` type is not an AI-authorship claim.

## Graphs and discovery

Human/bot shares use the account types of observed merged-PR authors. Missing
authors form a separate unknown group. Daily bars use actual merge timestamps
in the captured listing, not a claim to all merges that day. Stars are metadata
readings recorded on capture, with at most one point per UTC day for 90 days.

Top stars discovers up to 1,000 public, non-fork, non-archived repos by star count each day. Trending includes pool members with positive star additions across the last 30 days of GitHub's aggregate history. Award rows rank each
cohort by its observed award value. The starting curated baseline is shown
and labeled until discovery or aggregate history is available. No LLM judgment
selects either group. Arbitrary lookups enter the comparison only for that
result; they do not change the indexed cohort.

Star backfills use GitHub's aggregate star history, not stargazer identities.
Six weeks supply up to 30 dated addition counts before today's UTC date. GitHub
week/day boundaries are provider-defined and need not align with UTC; missing
dates are not filled. Additions do not subtract unstars and cannot reconstruct
old net balances. Daily metadata readings remain the source for net changes.

## Bot Party and nearby repos

Bot Party counts observed merges whose PR author has GitHub's Bot account type.
Its percentage divides that count by all observed merges. Missing authors are
not treated as bots or humans. A repo with observed merges and no known bots can
have a zero score; no observed merges produces an empty award. The leaderboard
compares bot-authored merge counts, not commits or developer AI use.

Card neighbors use the same typed winning values and ordering as the index's
leaderboards, with the current repo added only for comparison. Higher counts
lead; Fastest Lap sorts lower elapsed time first. Equal scores share rank, with
repository names breaking display-order ties. Adjacent equal scores say Level
with, not Just ahead or Just behind. Unknown or empty awards have no invented
rank. These comparisons retain each snapshot's original scope.
