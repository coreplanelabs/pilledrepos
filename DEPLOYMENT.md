# Pilled Repos deployment

Target: public **pilledrepos.com**, source **coreplanelabs/pilledrepos**, package
**@coreplane/pilledrepos**. Merge, npm publication, and deployment are held for
user review. This PR prepares the release path; it does not launch the site.

## Resources

The domain's active DNS zone belongs to Polycorp account
`efbcecf27f8ef6ef0ceae56a78415cd0`, zone `ea3e04242d411869c7f8de1bfe1e3c31`.
Public nameservers match `katelyn.ns.cloudflare.com` and
`zahir.ns.cloudflare.com`. The config binds only these dedicated resources:

- Worker: `pilledrepos` (not deployed).
- KV: `PILLEDREPOS_DATA`, `e97cbc79cf864745ad6a86525df56bba`.
- D1: `pilledrepos`, `afc39784-ac54-48f4-863b-c526be1c0ab4`.

D1 already holds the schema, the earlier 1,000 seed registrations, and their real complete
90-day metrics. The replacement backfill completed locally with 10,001 repos. Remote seed replacement,
KV activation, and Worker deployment remain held for review.
Never use Repo Lore's Worker, database, namespace, environments, or secrets.

## Before first release

1. Review and merge this PR only after user approval. Configure protected main and
   the GitHub `production` environment with the required review gate.
2. Create fresh scoped credentials after approval. Store them in the CI vault in
   1Password and the new repository's production environment secrets:
   `CLOUDFLARE_DEPLOY_TOKEN`, `CLOUDFLARE_ZONE_READ_TOKEN`, and
   `CLOUDFLARE_INDEX_TOKEN`. Restrict them to this DNS-owning account and the
   required Worker, zone-read, KV, and D1 operations. Never reuse another project's
   secret. The Worker also needs a dedicated public GitHub read token as
   `GITHUB_READ_TOKEN`; the daily job also needs a dedicated public-read token in its new production
   environment (`GITHUB_READ_TOKEN`).
3. Bootstrap the npm package under the approved account, then configure npm's
   trusted publisher for `coreplanelabs/pilledrepos`, `release.yml`, environment
   `production`. Use OIDC for CI publication. Initial package creation may require
   npm 2FA. Choose the next unpublished version for the first CI release.
4. Validate the exact reviewed config and active zone with the remote release
   guard. Publish the complete KV dataset with verified readback. Bootstrap the
   named Worker, custom domain, bindings, and GitHub-read secret only after launch
   approval. Before enabling the daily job, apply `config/migrations/0002-index-membership.sql`
   to the existing D1 database, import the reviewed capture with `save-repo-snapshots.mjs --run=... --remote`,
   then generate/apply `enroll-index.mjs --remote` SQL once. This initializes membership;
   the daily workflow performs only existing-row metric updates. Later releases use Worker version upload and activation.
5. Tag the checked current main as `v<package version>`. The release workflow
   checks tag/version and current main, publishes npm via OIDC, then deploys and
   verifies public HTML, repo details, pagination API, and OG images.

A merge alone does not deploy or publish npm. The release workflow uses tags;
daily remote indexing needs its scoped production secrets. Do not create a tag
or enable live writes before the user approves launch.
