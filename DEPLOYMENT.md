# Deploying Repo Lore

Host: https://repolore.fun. Cloudflare account: coreplane-infra.
The saved `wrangler.json` pins that account and the exact custom domain.
The former Polycorp worker was deleted; the domain registration stays in its
existing account.

## GitHub delivery

The release process requires one independent approval, resolved conversations,
and the current GitHub Actions `check` on an up-to-date branch, including for
admins. Required reviews are temporarily deferred at Justin's request until
CI/CD ships. Required checks, conversation resolution, linear history, and
admin enforcement remain active. Only squash merges are enabled.
See [CONTRIBUTING.md](CONTRIBUTING.md).

`Check` builds, typechecks, tests offline, validates the release guard, and
bundles the Worker with pinned Wrangler 4.148.0. Node is pinned to 22.22.2 and
Bun to 1.4.2. Actions are pinned to full SHAs; checkout stores no credentials.
Fork runs need maintainer approval and have no production secrets.

Only a successful `push` check on this repository's `main` can start `deploy`.
The `production` environment allows only the `main` branch. Deployments share
one concurrency group and running releases are never canceled. Older pending
jobs may be replaced by newer ones; a stale main SHA fails before promotion.
The deployment job rebuilds that exact SHA, never a fork artifact.

Version upload/deploy preserves existing custom-domain routing and Access.
The guard checks the account, Worker, REPORTS KV binding, disabled public URLs,
every matching Access application's policy, and anonymous page/API/image/asset
redirects before and after release. It accepts explicit `coreplane.ai` email
domain allow rules and deny rules; bypass, service auth, unresolved groups,
missing policy reads, and wider audiences stop release. If the policy shape
changes intentionally, review the guard rather than weakening Access.

## One-time credential setup

Merge the CI/CD PR first. Then re-enable independent review protection **before
provisioning production secrets**; do not enable unattended releases during
the temporary review waiver:

```sh
gh api --method PATCH repos/coreplanelabs/repolore/branches/main/protection/required_pull_request_reviews \
  -F required_approving_review_count=1 -F dismiss_stale_reviews=true \
  -F require_last_push_approval=true -F require_code_owner_reviews=false
gh api repos/coreplanelabs/repolore/branches/main/protection
```

Verify those review fields, admin enforcement, strict GitHub Actions `check`,
conversation resolution, and disabled force pushes/deletion in the response.
The repo has six writers; one independent reviewer is available in principle,
but cannot be the PR author. No author can self-approve.

Deployment is **not operational until both production environment secrets are
provisioned**. Create fresh Cloudflare account API tokens in the dashboard:

| Environment secret | Permissions and scope |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers `Editor` for existing Worker `repo-lore` in account `3c7b28f23cc93f09e77bb0a9ffcb7e6f` only |
| `CLOUDFLARE_ACCESS_READ_TOKEN` | Account `Access: Apps and Policies Read` in that same account only |

No Access write, zone routing write, account-wide Workers admin, or KV data
access is needed: CI releases versions of the already-connected Worker.
If the dashboard cannot issue the per-Worker Editor token, stop and resolve
that limitation; do not silently substitute a broad token.
Choose expiry dates and rotate before expiry. Store the values in GitHub
Settings → Environments → production → Environment secrets, or use prompts:

```sh
gh secret set CLOUDFLARE_API_TOKEN --repo coreplanelabs/repolore --env production
gh secret set CLOUDFLARE_ACCESS_READ_TOKEN --repo coreplanelabs/repolore --env production
```

Never copy Wrangler OAuth or the developer's `gh` credentials into CI. The
read-only ephemeral GitHub workflow token only checks current `main`; it is
not the optional runtime GitHub public-read credential.
Before enabling releases, verify the existing custom domain points to
`repo-lore`, no Cloudflare Builds/deploy hook runs a competing release, and
Access covers the bare `repolore.fun` host with the @coreplane.ai policy.
With both fresh tokens explicitly provided in the local environment, run
`CLOUDFLARE_ACCOUNT_ID=3c7b28f23cc93f09e77bb0a9ffcb7e6f node scripts/release-guard.mjs --remote`
to verify reads and Access without deploying. Missing access is a setup blocker.
CI cannot change routes or Access. It records source SHA, previous versions,
uploaded version, and deployed version in the Actions step summary.

## Cron, routes, and other configuration changes

Version releases include code, assets, and versioned bindings. They **do not
synchronize cron triggers, routes, or custom domains**. A future cron in
`wrangler.json` is not active merely because CI
released its code. Such changes need a reviewed PR and successful `main` checks,
then a separately authorized maintainer operation from that exact main SHA:

```sh
bun run wrangler whoami
node scripts/release-guard.mjs --local
bun run wrangler triggers deploy
node scripts/release-guard.mjs --edge
```

`triggers deploy` applies both configured routes/domains and cron, so inspect
the full diff and verify account and Access first. Use an authorized local
credential with the needed exact-zone routing permission; do not broaden CI's
token. Record the resulting trigger settings. Wrangler may apply other
non-versioned settings such as `logpush` and `tail_consumers` during version
deployment; review those changes explicitly. Keep Access enabled and both
public URL settings disabled. Cron data refresh may also require the separate
runtime GitHub read secret; deployment credentials do not supply it.

## Local release checks

```sh
bun install --frozen-lockfile
bun run build
bun run typecheck
bun run test
node --test test/release-guard.test.mjs
node scripts/release-guard.mjs --local
bun run wrangler versions upload --dry-run
```

Normal releases go through GitHub. For authorized manual recovery, verify the
account with `bun run wrangler whoami`. If the shell has an unrelated Cloudflare
API token, unset it to use the existing local Wrangler OAuth login. Never put
credential values in source or logs.

## Rollback

Pause delivery first: disable the `Check` workflow in GitHub Actions and cancel
or wait for pending/running production jobs. Do not race a manual recovery with
CI. Read the failed release's Actions summary and live deployment list:

```sh
bun run wrangler deployments list --json
bun run wrangler versions list --json
bun run wrangler rollback <previous-version-id> --message "Recover failed release"
node scripts/release-guard.mjs --edge
bun run wrangler deployments list --json
```

Use the previous **known-good** version ID, not the newest uploaded version.
The pre-CI recovery candidate recorded on October 6, 2026 is
`f292e0ed-e564-4838-a596-6f4494fc4db1`, source main
`8ad1527f33afdc1b2be293dae01aec98be116d32`; verify it is still available and
appropriate before rollback. Recovery changes Worker code/assets, not KV data
or Access policy. Check signed-in pages, APIs, portraits, comparisons, and OG
PNG after recovery. If a CLI command fails or times out, inspect the active
deployment before retrying. Submit the fix/revert through a reviewed PR,
re-enable `Check`, and let checked `main` release again. No automatic rollback
is implied by an anonymous SSO redirect check.

## Runtime

`worker/entry.ts` serves repo pages, the report API, leaderboards, avatar proxies,
and OG PNGs. `ASSETS` contains browser modules, styles, fonts, and the shell.
`REPORTS` is the project-owned KV namespace. `.assetsignore` excludes declarations
and source maps. No database, inference service, or customer data is involved.
The existing account uses Workers Paid; CPU time is bounded at 1000 ms/request.

Capture and seed the public comparisons using the README commands. The latest
snapshot stays available if a refresh fails. Versioned OG snapshots have a
seven-day TTL. Keep read dates and incomplete coverage with displayed data.

## Optional GitHub credential

Use a credential limited to public repository reads. Store it as the Worker
secret `GITHUB_TOKEN` with `wrangler secret put GITHUB_TOKEN`; enter the value in
the terminal prompt, not in chat or a source file. The runtime attaches it only
to validated `api.github.com/repos/<owner>/<repo>` reads and rejects private
metadata before collecting records. It is never forwarded to image hosts or
serialized into a report. Local development uses `REPOLORE_GITHUB_TOKEN`.

The current comparisons were captured through the maintainer's explicit `gh`
public-read workflow. No personal CLI credential is shipped to the Worker.

## SSO and public launch

Cloudflare Access protects every path on repolore.fun, including APIs, images,
and assets. The existing Cloudflare identity provider and @coreplane.ai allow
policy apply. The application is managed separately in the Cloudflare dashboard.
Do not remove the gate during ordinary releases. workers.dev and preview URLs
remain disabled, and alternate public URLs must not bypass Access.

After deployment, verify that anonymous page, API, and image requests redirect
to Coreplane Access, then check the signed-in repo page, comparisons, photos,
and PNG. SSO prevents search indexing and external social previews. Canonical
pages and OG metadata are ready, but public launch requires a separate explicit
instruction to remove the gate.

Cloudflare docs:
https://developers.cloudflare.com/workers/static-assets/binding/
https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/

## Daily index job

`.github/workflows/refresh-index.yml` runs `scripts/refresh-index.mjs --limit=1000
--publish` daily at 10:00 UTC and supports manual dispatch. It builds from main,
uses a read-only ephemeral GitHub workflow token, caches same-day checkpoints,
and serializes publishers. It never deploys code or changes Access. The legacy
Worker cron refuses index writes after the daily catalog is selected.

Provision a separate production environment secret `CLOUDFLARE_INDEX_TOKEN`:
**Account → Workers KV Storage → Edit**, scoped to **coreplane-infra** only.
Cloudflare scopes this permission to an account, so the code fixes the exact
Repo Lore namespace ID and accepts no target override. Do not broaden or reuse
the existing deployment token. Choose an expiry and rotate before expiry.
The script refuses to start CI publication without this secret. The account-owned token `repolore-daily-index` was provisioned on October 7, 2026 and expires January 5, 2027; rotate it before that date.

For a first capture, the maintainer can run the same script with `--use-gh
--publish-via-wrangler`; that explicitly uses existing local logins, without
extracting credentials. Upload compatible Worker code before publishing the
first version-2 dataset. The script writes immutable seven-day dataset keys,
waits for propagation, then changes `index:catalog` last. A failed data batch
leaves the previous catalog selected. Local preview seeds are never published.

After setup, dispatch `Refresh daily index` on main and verify the job succeeds,
its summary counts, the ten-result board, the dedicated top-100 route, and the
last-refresh timestamp. Scheduled refreshes preserve the previous successful
index if capture or publication fails. Check failures in GitHub Actions; a
"Refreshed daily" label is cadence, while the timestamp shows actual freshness.
