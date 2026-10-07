# Repo Lore research and scope

This experiment implements the human's October 6 pivot from review-pressure
research to a quick, gamified public-repository report. It is not an engineering
performance dashboard. It runs independently of Polylane and Switchboard.

## Prior art

- [Repo Wrapped](https://www.repowrapped.com/) offers repository narration,
  share cards and a leaderboard. A generic wrapped summary is not a new category.
- [wrapped.dev](https://www.wrapped.dev/) offers public-repository year-in-review
  reports. This experiment focuses on a quick recent snapshot with named awards
  and literal source-linked facts.
- [GitHub issue-metrics](https://github.com/github-community-projects/issue-metrics)
  provides response/review/lifecycle measurements. The earlier research already
  found little justification for another generic review-volume tool.
- [GitHub PR API](https://docs.github.com/en/rest/pulls/pulls),
  [community profile](https://docs.github.com/en/rest/metrics/community) and
  [review comments](https://docs.github.com/en/rest/pulls/comments) supply the
  fields this app reads. Different comment types remain distinct.

No superiority, causal AI effect or market demand claim has been demonstrated.

## Chosen supported scope

Public canonical github.com repositories, browser or Node 22+, no authentication
setup, one page of recent closed PRs, ten selected merge diffs and an oldest-first
open listing. Static UI; no database, email capture, indexer or inference service.
All awards disclose their inspected scope. A quiet or capped repository remains
useful without manufactured winners or a universal quality score.

The earlier repository screen found 57/65 opened PRs in Pytest and 56/92 in Vite
in the two 14-day screening periods. These select live test targets, not health
benchmarks. Large-repo and quiet-repo behavior matter as much as a happy path.

## Acceptance

- A public repo produces real award cards with PR links and a readable summary.
- Browser and CLI run the same pure calculations; saved facts reproduce awards.
- PNG export carries the date and scope; JSON includes source facts and prose.
- Input cannot choose a different host, private access, executable link, or
  another repository's evidence. PR prose renders as text.
- Absent, malformed, capped, moved and rate-limited data remain explicit.
- Offline correctness cases, typecheck and runnable build pass. Manual live
  browser/CLI checks verify the actual user path and exported image.
- A useful cold result should arrive within 30 seconds in the bounded supported
  scope. Individual timings do not establish universal latency or p95.

Readiness, public release and product resonance are separate. Keep the package
private on npm with its publication refusal. Source is published on GitHub with the user's approval.

## URL-first repo identity and comparisons

- Shiptalkers (https://shiptalkers.dev/) makes the hook personal through named
  identities and public comparisons. Repo Lore uses identities and comparisons
  of literal PR records, without importing a quality judgment or Twitter data.
- Yappers (https://yappers.context.dev/@t3dotchat) leads with a group's identity,
  people, and standings. Repo Lore adds GitHub portraits, contributor standings,
  overlapping top-three photos, and a rest count.
- Nominal's OG guidance uses local fonts, a shared card design, PNG output,
  and prerasterized image assets to avoid expensive blur/turbulence. This app
  uses local licensed font subsets, PNG/JPEG portraits, a common 1200x630 layout,
  and cached resvg WASM renders.
- GitHub API quota guidance: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- PNG renderer source: https://github.com/yisibl/resvg-js

Acceptance: clean owner/repo paths; server-rendered canonical and OG metadata;
versioned PNGs tied to the same snapshot; no sharing UI; three contributor
portraits plus correct rest count; sourced cross-repo rows; no token in browser
or stored facts; SSO remains intact. Tests inject fetch, storage, clock, and PNG
rendering. Real HTTP, image, and mobile checks supplement the offline suite.

## Compact award hierarchy

The card groups its content into result, comparison, and evidence/actions.
A high-contrast rank is the central item in a three-position comparison strip;
neighboring repos use smaller text, arrows, and quieter portraits. It borrows
picker hierarchy without pretending that rank is an editable selection.
Related footer actions share a baseline and 44px touch targets. Natural card
height replaces minimum heights and auto margins that separated related content.

Design basis: [NN/g proximity](https://www.nngroup.com/articles/gestalt-proximity/),
[NN/g visual hierarchy](https://www.nngroup.com/articles/principles-visual-design/),
and [Apple pickers](https://developer.apple.com/design/human-interface-guidelines/pickers).
These guide the layout; browser review verifies the implementation, not a claim
that this exact design has been experimentally validated.
