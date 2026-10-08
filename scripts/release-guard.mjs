import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveNs } from "node:dns/promises";
import { pathToFileURL } from "node:url";
export const REPO = "coreplanelabs/pilledrepos",
  DOMAIN = "pilledrepos.com",
  ACCOUNT = "efbcecf27f8ef6ef0ceae56a78415cd0",
  ZONE = "ea3e04242d411869c7f8de1bfe1e3c31",
  WORKER = "pilledrepos",
  NAMESPACE = "e97cbc79cf864745ad6a86525df56bba";
export function checkConfig(c) {
  assert.equal(c.name, WORKER);
  assert.equal(c.account_id, ACCOUNT);
  assert.equal(c.workers_dev, false);
  assert.equal(c.preview_urls, false);
  assert.equal(c.main, "worker/entry.ts");
  assert.equal(c.env, undefined);
  assert.deepEqual(c.routes, [
    { pattern: DOMAIN, custom_domain: true, zone_id: ZONE },
  ]);
  assert.deepEqual(c.kv_namespaces, [{ binding: "DATA", id: NAMESPACE }]);
  assert.deepEqual(c.d1_databases, [
    {
      binding: "REPOS",
      database_name: "pilledrepos",
      database_id: "afc39784-ac54-48f4-863b-c526be1c0ab4",
    },
  ]);
  assert.deepEqual(c.assets, {
    directory: "./dist",
    binding: "ASSETS",
    run_worker_first: true,
    not_found_handling: "none",
  });
}
export async function cloudflare(
  path,
  token,
  { method = "GET", body, raw = false, allowMissing = false } = {},
) {
  assert.ok(
    token,
    "A dedicated Pilled Repos Cloudflare credential is required.",
  );
  if (
    !path.startsWith("/zones/" + ZONE) &&
    !path.startsWith("/accounts/" + ACCOUNT + "/")
  )
    throw new Error("Refusing a different account or zone.");
  const r = await fetch("https://api.cloudflare.com/client/v4" + path, {
    method,
    body,
    redirect: "error",
    signal: AbortSignal.timeout(30000),
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
  });
  if (allowMissing && r.status === 404) return null;
  if (!r.ok) throw new Error("Cloudflare request failed (" + r.status + ").");
  if (raw) return r.text();
  const d = await r.json();
  assert.equal(d.success, true, "Cloudflare did not confirm success.");
  return d;
}
export async function checkZone(z, lookup = resolveNs) {
  assert.equal(z.id, ZONE);
  assert.equal(z.name, DOMAIN);
  assert.equal(
    z.account.id,
    ACCOUNT,
    "DNS and services must use the same account.",
  );
  assert.equal(z.status, "active");
  const publicNs = (await lookup(DOMAIN))
    .map((s) => s.toLowerCase().replace(/\.$/, ""))
    .sort();
  assert.deepEqual(
    publicNs,
    [...z.name_servers].map((s) => s.toLowerCase()).sort(),
    "Public DNS is not delegated to the verified zone.",
  );
}
export async function preflight({ indexOnly = false } = {}) {
  const c = JSON.parse(await readFile("wrangler.json", "utf8"));
  checkConfig(c);
  const zoneToken =
    process.env.CLOUDFLARE_ZONE_READ_TOKEN ??
    process.env.CLOUDFLARE_INDEX_TOKEN ??
    process.env.CLOUDFLARE_DEPLOY_TOKEN;
  await checkZone((await cloudflare("/zones/" + ZONE, zoneToken)).result);
  const token = indexOnly
    ? process.env.CLOUDFLARE_INDEX_TOKEN
    : process.env.CLOUDFLARE_DEPLOY_TOKEN;
  if (indexOnly) {
    const namespaces = (
      await cloudflare(
        `/accounts/${ACCOUNT}/storage/kv/namespaces?per_page=100`,
        token,
      )
    ).result;
    assert.ok(
      namespaces.some(
        (n) => n.id === NAMESPACE && n.title === "PILLEDREPOS_DATA",
      ),
      "Namespace identity mismatch.",
    );
  }
  return c;
}
export function checkReleaseContext(env, sha) {
  assert.equal(env.GITHUB_REPOSITORY, REPO);
  assert.equal(env.GITHUB_EVENT_NAME, "push");
  assert.ok(
    env.GITHUB_REF === "refs/heads/main" ||
      /^refs\/tags\/v\d+\.\d+\.\d+$/.test(env.GITHUB_REF),
  );
  assert.equal(env.GITHUB_SHA, sha);
  assert.match(sha, /^[a-f0-9]{40}$/);
}
export async function currentMain(sha, token = process.env.GH_TOKEN) {
  assert.ok(token, "Missing workflow GitHub read token.");
  const r = await fetch(
    `https://api.github.com/repos/${REPO}/git/ref/heads/main`,
    {
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    },
  );
  assert.ok(r.ok, "Cannot verify current main.");
  assert.equal(
    (await r.json()).object.sha,
    sha,
    "The release must use exact current main.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.includes("--local"))
    checkConfig(JSON.parse(await readFile("wrangler.json", "utf8")));
  else await preflight({ indexOnly: process.argv.includes("--index") });
  console.log("Pilled Repos release guard passed.");
}
