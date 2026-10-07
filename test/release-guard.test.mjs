import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkConfig, checkPolicies, matchingApps, checkEdge, cloudflare } from "../scripts/release-guard.mjs";

const config = JSON.parse(readFileSync(new URL("../wrangler.json", import.meta.url)));
const allow = { decision: "allow", include: [{ email_domain: { domain: "coreplane.ai" } }] };

test("release refuses account, domain, KV and public endpoint drift", () => {
  checkConfig(config);
  for (const patch of [
    { account_id: "other" }, { name: "other" }, { workers_dev: true }, { preview_urls: true },
    { routes: [...config.routes, { pattern: "other.fun" }] },
    { kv_namespaces: [{ binding: "REPORTS", id: "other" }] }, { env: { preview: {} } },
    { assets: { ...config.assets, run_worker_first: false } },
  ]) assert.throws(() => checkConfig({ ...config, ...patch }));
});

test("Access refuses wider audiences, bypass and unresolved groups", () => {
  checkPolicies([allow]);
  checkPolicies([allow, { decision: "deny" }]);
  for (const policies of [[], [{ ...allow, decision: "bypass" }], [{ ...allow, decision: "non_identity" }],
    [{ ...allow, include: [] }], [{ ...allow, include: [{ everyone: {} }] }],
    [{ ...allow, include: [...allow.include, { email_domain: { domain: "other.ai" } }] }],
    [{ ...allow, include: [{ group: { id: "unknown" } }] }],
  ]) assert.throws(() => checkPolicies(policies));
});

test("Access must cover the root and inspect overriding path applications", () => {
  const root = { id: "root", type: "self_hosted", domain: "repolore.fun" };
  const api = { id: "api", type: "self_hosted", domain: "repolore.fun/api/*" };
  assert.deepEqual(matchingApps([root, api, { domain: "other.fun" }]), [root, api]);
  assert.throws(() => matchingApps([api]));
  assert.throws(() => matchingApps([{ ...root, type: "saas" }]));
  assert.deepEqual(matchingApps([{ ...root, domain: undefined,
    destinations: [{ type: "public", uri: "repolore.fun" }] }]).length, 1);
  const override = { ...api, domain: undefined,
    destinations: [{ type: "public", uri: "https://repolore.fun/api/*" }] };
  const wildcard = { ...api, domain: "repolore.*/api/*" };
  assert.deepEqual(matchingApps([root, override, wildcard]), [root, override, wildcard]);
});

test("anonymous probes refuse public responses and unrelated redirects", async () => {
  const seen = [];
  await checkEdge(async (url, options) => {
    seen.push(url);
    assert.equal(options.redirect, "manual");
    return new Response(null, { status: 302, headers: { location: "https://coreplane.cloudflareaccess.com/cdn-cgi/access/login/repolore.fun" } });
  });
  assert.equal(seen.length, 4);
  for (const response of [new Response("public"), new Response(null, { status: 302,
    headers: { location: "https://other.cloudflareaccess.com/cdn-cgi/access/login/repolore.fun" } })]) {
    await assert.rejects(checkEdge(async () => response));
  }
});

test("Cloudflare reads fail closed and never echo token or API errors", async () => {
  const credential = "test-credential";
  await assert.rejects(cloudflare("/test", undefined, () => assert.fail("must not fetch")));
  await assert.rejects(cloudflare("/test", credential, async () => new Response("private error", { status: 403 })),
    error => !error.message.includes(credential) && !error.message.includes("private error"));
  await assert.rejects(cloudflare("/test", credential, async () => Response.json({ success: false })));
});
