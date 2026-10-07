# Registry review

Reviewed 2026-10-07 using GitHub's public identity API, official app metadata where
available, and vendor documentation. This is an allowlist of known agent authors,
not an estimate of all AI use.

## Confirmed account IDs

| Agent | Stable ID | API display login | GitHub app alias |
| --- | ---: | --- | --- |
| Copilot | 198982749 | Copilot | copilot-swe-agent |
| Claude Code action | 209825114 | claude[bot] | claude |
| Claude partner agent | 242468646 | Claude | anthropic-code-agent |
| Cursor | 206951365 | cursor[bot] | cursor |
| Devin | 158243242 | devin-ai-integration[bot] | devin-ai-integration |
| Jules | 161369871 | google-labs-jules[bot] | google-labs-jules |
| Codex partner agent | 242516109 | Codex | openai-code-agent |
| Codex connector | 199175422 | chatgpt-codex-connector[bot] | chatgpt-codex-connector |
| Codegen | 131295404 | codegen-sh[bot] | codegen-sh |

The account API returns a Bot identity and app URL for each ID. Public app metadata
links the non-partner apps to their provider organizations: github, anthropics,
cursor, usacognition, google-labs-code, openai, and codegen-sh. GitHub's private
partner app metadata returns 404; its public app URL redirects to the official
partner documentation. We verified those partner IDs by resolving the exact
bot aliases in GitHub's explicit installation declarations. A 404 from the app
metadata API is not proof that the bot account does not exist.

## Corrections to the inherited draft

- The known list omitted Claude's partner app ID `242468646`.
- Copilot and partner Codex display logins differ from their GraphQL aliases.
  Refresh by ID; do not look up API display names as if they were bot aliases.
- The old Devin integration URL returned 404. The valid source is
  https://docs.devin.ai/integrations/gh.
- OpenAI moved the GitHub integration docs to
  https://learn.chatgpt.com/docs/third-party/github. Use that canonical URL.
- A failed verification used to keep a stale seed identity silently. It now stops
  the new run and preserves the prior complete index.
- A non-bot account was called human. It is now a neutral user-account count.
- Draft eligibility used 20 merges and accepted legacy/incomplete samples. The
  reviewed rule needs a complete census and 100 merges.

## Discovery boundary

The parser admits only explicit “Allow … coding agent” install declarations in
GitHub's official partner documentation. It resolves the declared app alias and
checks the returned stable ID and app URL. New names from observed PR authors or
bios do not create AI labels. Remaining bot candidates are retained for review.

`config/ai-agents.json` records the current sources and digests. Every captured
index keeps its own immutable registry version and source evidence. The UI links
to public app pages and official documentation. Unauthenticated GitHub API links
may hit shared-IP rate limits, so they are not the main public evidence link.

## Collector review

Real API reads disproved the assumption that returned `updatedAt` values are
strictly sorted in GitHub's update-ordered merged-PR connection. Merge-date search
with recursively split time ranges replaces that collector.

A single `merged:START..END` qualifier is required. Repeating `merged:>=START` and
`merged:<END` did not constrain the live query as intended. Leaf scope checks
caught this; these failed captures never became complete indexes. UTC second
ranges are disjoint and records are filtered again against exact timestamps.

References:

- https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests
- https://docs.github.com/en/graphql/reference/queries#search
- https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents
- Individual vendor sources are in `config/ai-agents.json`.
