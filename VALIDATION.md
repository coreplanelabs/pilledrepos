# Local review evidence

Updated October 7, 2026. Merge, npm publication, and deployment remain held.

- Source checks: 68 tests, TypeScript checks, and build pass. Tests cover complete
  merge pagination, exact IDs, counts, partial failures, durable submissions,
  refresh preservation, canonical renames, real Node HTTP POST forwarding,
  sorting before pagination, rank tie breakers, batched response isolation,
  rate-limit waiting, seed discovery beyond 1,000 results, and KV fallback.
- Node 22.22.2, Bun 1.3.0 frozen install, release guard, Worker dry run, and npm pack
  dry run passed with the final mobile and larger-seed source changes.
- Real browser submission accepts both `owner/repo` and a full GitHub URL, saves
  `octocat/Hello-World`, and opens its completed result. SQLite retains that repo
  and `mattermost/mattermost` as permanent submissions.
- The earlier complete 1,000-repo capture read 64,641 merged PRs: 751 known AI-agent
  authors, 52,541 user accounts, 11,348 other bots, and one deleted author. 371 repos
  had no merged PRs; 875 were below the 100-PR ranking minimum. Spot checks on
  GitHub confirmed empty windows and non-empty zero-agent results.
- Replacement seed: 10,000 active public software repos ranked by stars, without
  requiring agent configuration. Kubernetes and PostHog are included;
  `thijsmat/rolodink` is excluded. The larger backfill is in progress and does not
  replace the complete index until every capture passes.
- Desktop and mobile screenshots are in `docs/pilledrepos-*.jpg`. Mobile review
  covers 390×844 and 360×800 viewports, with a separate bordered input, larger body/data text,
  22px SVG sort arrows, and a 44px sort touch target.

No source changes were made to the original Repo Lore repository or its resources.
