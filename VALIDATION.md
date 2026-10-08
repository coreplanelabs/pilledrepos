# Local verification and affected feature map

October 8, 2026. Repo `coreplanelabs/pilledrepos`, branch
`setup-merge-deploy`, base `7c7b444`. PR #1 is merged; this CI change is unmerged.
Production credentials and first deployment remain pending.

## Data evidence

The one-off 10,001-repo capture completed at `2026-10-08T02:25:21.517Z` (October 7,
7:25 PM PDT): 1,477,264 merged PRs and 10,858 known-agent authors. Its first attempt
saved 9,880 reads; 121 GitHub read failures correctly kept the previous pointer.
Resuming recovered all reads. No failure was turned into a zero.

[Account audit](docs/account-audit.json) independently tallies raw IDs. All nine
identities were checked live; one real matched PR was verified for each of the
seven IDs with corpus matches. Codegen and Codex connector had zero corpus matches:
live identity proof plus local positive/negative ID tests, not matched-PR proof.
[Denominator audit](docs/denominator-audit.json) separately checks GitHub counts for
the leader, Kubernetes, and PostHog. These are spot checks, not universal provider proof.

The fixed active database currently contains 2,400 entries. A controlled data-only
run completed all 112 members selected before the final one-off enrollment;
remaining active rows use their saved complete captures with their own read times.
[Visible data audit](docs/visible-data-audit.json) checks every displayed row for
complete data, positive denominator, rank, unique identity, exact fraction, and
category sums. Thirteen data-backed curated pills passed the 100-PR minimum. The placeholder is Strix;
the obsolete filter and visible input label are removed.
No AI-percentage filter, broad daily discovery, or automatic removal is used.

## Existing app verification map

Real preview: `/Users/justin/workspace/coreplanelabs/ai-pilled`, port 4189.
Build with `bun run build`; launch `bun run dev -- --use-gh`. Read-only doctor:
check the owned PID, index pointer, GET `/api/leaderboard?limit=1`, and
`bun run list:index`. Stop only agent-owned processes; retain catalog and captures.

| User outcome                                                                     | Entry and drive                                                                                                         | Evidence and boundaries                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Durable enrollment                                                               | Submit repo name/URL via Check repo; inspect SQLite, reopen the store, and list indexed names.                          | User rows remain selected at zero PRs and after read failure/restart. Private repos are refused. Daily selection does not admit high-score archive rows or remove low-score members.                                                       |
| Separate discovery                                                               | Run capture with `--discover`; checkpoint completes without activating it.                                              | Regression failed when discovery replaced `current.json`; passes with the active pointer unchanged. Public publisher rejects discovery and partial cohorts.                                                                                |
| Complete data-only refresh                                                       | Default `index` reads `indexed=1`; save with `--existing-only`.                                                         | Controlled 112-member provider run passed. Daily workflow excludes seed/enrollment commands. Production D1 migration/activation remains pending.                                                                                           |
| Infinite ranking                                                                 | GET sorted `/api/leaderboard` pages; load past 100.                                                                     | All complete nonempty reads rank, including small samples and zero AI share. Empty windows remain enrolled without false percentages. Stable-ID rename regression prevents duplicate rows.                                                 |
| Rank jump                                                                        | Open Strix, click #3, inspect target row.                                                                               | Old hash/smooth behavior settled at the page top; native row anchor settles at 24px and keeps the matching highlight. Both href and landing row IDs are tested.                                                                            |
| Data-backed pills                                                                | Click a technology pill.                                                                                                | Links open actual repo details, not a filter. Only complete 100+ PR reads receive a pill. The obsolete filter is removed; input label is accessible but hidden.                                                                            |
| Card treatments | Open normal and #1 repo pages; move pointer to a card corner and leave. | Existing proof: gradient on all cards, pointer tilt resets on exit, and rank badge at top right. |
| Repo header and emoji | Open PostHog and a short-description repo at desktop/mobile widths. | GitHub sits 24px after the desktop name. On mobile a 40px avatar sits beside the title, while description and action row use the full width. Read age and an icon-only Refresh button form one compact group; full local read time remains in the title/accessibility label. Native GitHub emoji aliases render; custom GitHub images use the allowed asset host. Historical sections are omitted even with two daily reads. |
| Leaderboard information | Click or press Enter on the info button; dismiss with Escape or outside click. | Approved user copy appears in a native popover. Its 44px trigger and tooltip fit 1280×900 and 360×800. No page shift or table clipping. |
| Top-ten confetti                                                                 | Open ranks 1, 10, and 11.                                                                                               | Real browser: burst on 1/10, none on 11, canvas removed afterward. Reduced-motion/touch exclusions are source-inspected; OS settings were not changed.                                                                                     |
| Fixed raised loading                                                             | Use `node test/ui-review-server.mjs` after build/test; submit fixture repo and scroll during its three-second response. | Isolated UI proof: fixed 16px bottom offset before/after 800px scroll, no board shift, visible elevation. No GitHub or real catalog writes. Stop the owned fixture after capture.                                                          |
| Mobile type/spacing                                                              | 360×800 repo view.                                                                                                      | Claude Code is one line; header spacing is compact. Rank and repository headers use distinct type treatments and larger separation. Footer matches the requested credit and external-link mark.                                            |

Gates: Node 22.22.2, Bun 1.3.0 frozen install, typecheck, tests, build, local release
guard, Worker dry run, and whitespace checks. Current-head CI is
separate from these local proofs. The merged app passed main CI at `7c7b444`;
this CI diff has not yet been merged or deployed.

Proof files: `docs/final-*.jpg`, `docs/oct8-*.jpg`, and the JSON audits. The temporary
UI fixture is justified by fast real responses that otherwise hide loading layout.
No new global verification process, recurring monitor, or review agent was created.

Previous app gates passed: **77 tests**, typecheck/build, release guard, Worker dry
run, npm pack dry run, and whitespace checks. Known source compatibility cases
include old small-window eligibility flags and repo renames keyed by stable ID.
The SQLite startup regression failed under a held writer lock, then passed with
a bounded five-second busy timeout. The database was not reset.

UI cleanup proof: the emoji rendering and populated-history removal checks failed
before the change and passed afterward. All 81 tests and type/build checks passed.
The real local preview on port 4189 was driven at 1280×900 and 360×800: PostHog's
hedgehog rendered; GitHub/read/Refresh alignment, tooltip copy, viewport fit,
keyboard open, Escape, and outside-click dismissal passed. No enrollment or
refresh request was submitted during these UI checks. The source awaits user merge; production still runs the earlier app build.
The final client build also passed a 320px mobile check and open-tooltip resize
check. Light and dark desktop styles were inspected. Viewport and theme overrides
were reset after verification.


## Merge deployment verification

The affected entries are `check.yml`, `release.mjs`,
`verify-live.mjs`, and the Worker revision header. Main merges must pass validation,
activate that exact revision, and pass
public checks. Tag pushes and stale-main releases are rejected.

Local behavior tests cover tag refusal, exact live revision,
empty data, and invalid PNG refusal. A real isolated local Worker on port 4192
passed home, leaderboard, repo, PNG, CSS, and browser-script checks with 111 complete
nonempty rows. Its revision was a synthetic propagation marker, not a deployed
commit. Proof is retained in `docs/local-worker-release-proof.json`. This proves
Worker response handling and the validation CLI; it does not prove
Cloudflare deployment, public DNS/TLS, or live enrollment.

To repeat after build: prepare isolated local KV with the complete compact dataset
and current manifest, start Wrangler with a 40-hex `SOURCE_SHA`, then call
`verifyLive(origin, sha)` from `scripts/verify-live.mjs`. Stop only that owned Worker;
retain the real catalog and captures. Production preflight is read-only:
`node scripts/release.mjs --preflight`, in the checked-main workflow context.

The deployment-only diff passed **79 tests**, frozen install, typecheck, build,
config guard, Worker dry run, and whitespace checks. Npm publication is removed. GitHub main now requires PRs and the `check`
status; the production environment allows only the main branch.

Production setup proof: three fresh Cloudflare credentials stored in 1Password CI
and GitHub production secrets. Zone/account and per-Worker deployment read checks
passed. D1 migration/import preserved all prior rows and newer reads, enrolled
2,401 selected repos, and kept three user submissions active. KV publication passed
hash readback. The empty Worker has no active code version. GitHub passkey/read
credential and first deployment remain pending. Npm registry returns 404 after
unpublication. See `docs/production-data-proof.json` for the scoped data receipt.

GitHub credential wiring: GitHub rejected the old `GITHUB_READ_TOKEN` secret name
with HTTP 422 because `GITHUB_` is reserved. The production secret is now
`AI_PILLED_GITHUB_TOKEN`; deployment maps it to the Worker environment credential,
and daily indexing reads the same secret. GitHub secret creation and a real public
GraphQL repository query passed. All 79 tests, frozen install, typecheck, build,
config guard, Worker dry run, and whitespace checks passed on this wiring diff.

First live launch: checked main `3ce26f19a0973e71f9f91a2f925a93bf19a20c41`,
Worker version `652d5436-433c-4df6-971d-2d920c3d2f6d`. Read-only production
preflight passed. The verified Cloudflare login performed the one-time domain
bootstrap; the CI credential remained limited to the Worker. HTTP/HTTPS returned
200 with the exact revision. Home, 2,400-row leaderboard, github/gh-aw detail,
1200×630 PNG, CSS, and browser script checks passed with normal TLS certificate
verification. The live check used an address returned by authoritative/public
DNS because the local resolver cached the earlier empty answer. This proves the
public service; it does not prove all resolver caches have expired. Receipt:
`docs/production-live-proof.json`. The CI wiring PR remains unmerged.

Repo header redesign verification: github/gh-aw, PostHog, and Kubernetes were
driven locally at 1280px desktop and 360px/320px mobile widths. Mobile descriptions
use the full content width; the avatar centers beside single-line and wrapped
titles. The GitHub link, read age, and 40px Refresh target fit one mobile action
row without overflow. Desktop keeps GitHub immediately after the name and places
read age/Refresh below the description. Full local capture time remains in the
time element title and accessibility label; display age updates once per minute
without provider requests. Formatter tests cover minute/hour/day boundaries and
future clock skew. Earlier floating/italic timestamp experiments are superseded.
