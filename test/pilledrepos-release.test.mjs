import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  checkConfig,
  checkZone,
  checkReleaseContext,
  ACCOUNT,
  ZONE,
  REPO,
  DOMAIN,
} from "../scripts/release-guard.mjs";
const config = JSON.parse(
  await readFile(new URL("../wrangler.json", import.meta.url), "utf8"),
);
test("deployment cannot reuse the Repo Lore account, worker, namespace, or domain", () => {
  checkConfig(config);
  for (const c of [
    { ...config, account_id: "3c7b28f23cc93f09e77bb0a9ffcb7e6f" },
    { ...config, name: "repo-lore" },
    { ...config, workers_dev: true },
    { ...config, routes: [{ pattern: "repolore.fun" }] },
    {
      ...config,
      kv_namespaces: [
        { binding: "DATA", id: "5ce3d8b4fad240a89542b35c99ea9153" },
      ],
    },
  ])
    assert.throws(() => checkConfig(c));
});
test("account, zone, active status, and public nameservers are all required", async () => {
  const z = {
    id: ZONE,
    name: DOMAIN,
    status: "active",
    account: { id: ACCOUNT },
    name_servers: ["a.ns.cloudflare.com", "b.ns.cloudflare.com"],
  };
  await checkZone(z, async () => [
    "b.ns.cloudflare.com",
    "a.ns.cloudflare.com",
  ]);
  await assert.rejects(
    checkZone({ ...z, account: { id: "another" } }, async () => z.name_servers),
  );
  await assert.rejects(
    checkZone({ ...z, status: "pending" }, async () => z.name_servers),
  );
  await assert.rejects(checkZone(z, async () => ["other.ns.cloudflare.com"]));
});
test("CI release rejects a fork, PR event, branch other than main, and wrong head", () => {
  const sha = "a".repeat(40),
    env = {
      GITHUB_REPOSITORY: REPO,
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/heads/main",
      GITHUB_SHA: sha,
    };
  checkReleaseContext(env, sha);
  for (const e of [
    { ...env, GITHUB_REPOSITORY: "other/repo" },
    { ...env, GITHUB_EVENT_NAME: "pull_request" },
    { ...env, GITHUB_REF: "refs/heads/feature" },
    { ...env, GITHUB_SHA: "b".repeat(40) },
  ])
    assert.throws(() => checkReleaseContext(e, sha));
});
test("merge deployment rejects tag pushes rather than treating them as checked-main releases", () => {
  const sha = "a".repeat(40);
  assert.throws(() =>
    checkReleaseContext(
      {
        GITHUB_REPOSITORY: REPO,
        GITHUB_EVENT_NAME: "push",
        GITHUB_REF: "refs/tags/v0.1.0",
        GITHUB_SHA: sha,
      },
      sha,
    ),
  );
});
