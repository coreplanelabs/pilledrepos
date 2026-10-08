# Pilled Repos deployment

Target: public **pilledrepos.com**, source **coreplanelabs/pilledrepos**, package
**@coreplane/pilledrepos**. Pull requests validate changes. A push to main deploys
only after validation passes. The workflow checks that its source is still current
main before publishing and activating it.

## Merge pipeline

`.github/workflows/check.yml` runs frozen dependency installation, build, typecheck,
behavior tests, config checks, Worker dry run, and npm pack dry run. Its production
job then checks DNS/account ownership, complete KV data, D1 membership, and GitHub
read access. It publishes a unique `0.1.0-main.<run>.g<sha>` version under npm's
`next` tag through OIDC. Reruns verify an existing version's source before skipping
publication. No long-lived npm token is used.

The first release creates the Worker and custom domain. Later releases upload an
inactive version, recheck current main and the previous deployment, then activate
it at 100%. The workflow records the prior version for rollback. Concurrent
releases are serialized. Stale main releases fail rather than replace newer code.

Public checks require HTTP 200, the exact `X-Pilledrepos-Revision`, real leaderboard
counts, a repo page, a 1200×630 PNG, CSS, and browser script. A failed check fails the
release; it does not silently roll back or retry a possibly completed write.
Inspect the recorded deployment and npm receipt before retrying.

## Dedicated resources

Account: Polycorp `efbcecf27f8ef6ef0ceae56a78415cd0`.
DNS zone: `ea3e04242d411869c7f8de1bfe1e3c31`.
Public nameservers: `katelyn.ns.cloudflare.com`, `zahir.ns.cloudflare.com`.

- Worker: `pilledrepos`.
- KV: `PILLEDREPOS_DATA`, `e97cbc79cf864745ad6a86525df56bba`.
- D1: `pilledrepos`, `afc39784-ac54-48f4-863b-c526be1c0ab4`.

Never use Repo Lore's resources, environments, or credentials.

## First-launch prerequisites

1. Configure the GitHub `production` environment for main only. Require the PR
   validation check on main. No per-deploy review gate is needed for deploy-on-merge.
2. After immediate user confirmation, create fresh scoped credentials. Store them
   in the 1Password CI vault and this repo's production environment secrets:
   `CLOUDFLARE_DEPLOY_TOKEN`, `CLOUDFLARE_ZONE_READ_TOKEN`,
   `CLOUDFLARE_INDEX_TOKEN`, and `GITHUB_READ_TOKEN`. Restrict Cloudflare grants
   to the named account/zone and supported Worker, zone-read, KV, and D1 operations.
   GitHub read access must cover public repositories only. The release installs
   `GITHUB_READ_TOKEN` as a Worker secret atomically with the code version.
3. Bootstrap the npm package once with the approved npm account and 2FA. Configure
   its trusted publisher for `coreplanelabs/pilledrepos`, workflow `check.yml`,
   environment `production`. Future publication uses GitHub OIDC.
4. Apply `config/migrations/0002-index-membership.sql` to the existing D1 database.
   Import only the reviewed active membership and complete captures, preserving
   user registrations and newer reads. Do not enroll the whole discovery archive.
   Publish the complete KV dataset with verified readback. Daily refresh updates
   existing entries; it does not discover, reseed, or remove registrations.
5. Review and merge the CI change. Its main push starts the checked release.

As of October 8, 2026, the dedicated KV/D1 resources and active DNS delegation
exist. Production credentials, npm bootstrap/trusted publishing, current D1
membership, KV activation, and the first Worker deployment are still pending.
Local validation does not prove these provider steps.
