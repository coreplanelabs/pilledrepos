# Independent deployment setup

This prototype is local. GitHub repo, domain, and Cloudflare account are not chosen.
There is no enabled Worker, KV binding, cron, deployment workflow, or remote.
`wrangler.example.json` is an inactive placeholder. It cannot be used as a release.

When Justin selects the new repository and domain:

1. Create or attach that independent GitHub repo and push this reviewed source.
   Use its own branch protection and CI. Open a PR; do not push to Repo Lore.
2. Read the selected domain's actual Cloudflare zone. Record zone ID, account ID,
   owner, and DNS transfer state. All experiment DNS, Worker, and KV services must
   use that DNS-owning account. Polycorp stays unavailable until its transfer is
   confirmed complete. Do not assume a transfer date or `coreplane-infra`.
3. Create a new Worker, new KV namespace, and a separate production environment.
   Bind only experiment resources. Use a new read-only GitHub token and separate
   least-privilege Cloudflare credentials in the selected secret store. Never use
   Repo Lore secrets, environments, domains, Worker, or KV.
4. Add an edge adapter for this handler and an atomic immutable dataset publisher.
   Validate the published dataset before switching its pointer. The current
   index publisher writes local files only. Add a dedicated deployment guard that
   checks the chosen zone/account/resource identities before any write.
5. Schedule the same index script with a persistent checkpoint store and a
   non-overlap lock. Keep repo captures and registry source versions as artifacts.
   Restore checkpoints before resuming an interrupted job. The reference file in
   `.github/` is deliberately inactive until these resources are approved.
6. Require build, typecheck, tests, review, and desktop/mobile/OG evidence on the
   exact release head. Deploy only with new explicit deployment authorization.

No production resource or security change is authorized by the original handoff.
