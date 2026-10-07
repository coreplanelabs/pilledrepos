import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const ACCOUNT = "3c7b28f23cc93f09e77bb0a9ffcb7e6f";
export const WORKER = "repo-lore";
export const DOMAIN = "repolore.fun";
export const SCRIPT = `/accounts/${ACCOUNT}/workers/scripts/${WORKER}`;

/** @param {{account_id:string,name:string,workers_dev:boolean,preview_urls:boolean,routes:unknown[],kv_namespaces:unknown[],assets:{directory:string,binding:string,run_worker_first:boolean},main:string,env?:unknown}} config */
export function checkConfig(config) {
  assert.equal(config.account_id, ACCOUNT, "Wrong Cloudflare account");
  assert.equal(config.name, WORKER, "Wrong Worker");
  assert.equal(config.workers_dev, false, "workers.dev must stay disabled");
  assert.equal(config.preview_urls, false, "Preview URLs must stay disabled");
  assert.deepEqual(config.routes, [{ pattern: DOMAIN, custom_domain: true,
    zone_id: "618fed6a003533063757ddf6ab517bac" }], "Routing changed");
  assert.deepEqual(config.kv_namespaces, [{ binding: "REPORTS",
    id: "5ce3d8b4fad240a89542b35c99ea9153" }], "REPORTS binding changed");
  assert.equal(config.assets.directory, "./dist");
  assert.equal(config.assets.binding, "ASSETS");
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.main, "worker/entry.ts");
  assert.equal(config.env, undefined, "Alternate environments need separate review");
}

/** @param {{decision:string,include?:unknown[]}[]} policies */
export function checkPolicies(policies) {
  assert.ok(Array.isArray(policies) && policies.length > 0, "Missing Access policies");
  let allows = 0;
  for (const policy of policies) {
    if (policy.decision === "deny") continue;
    assert.equal(policy.decision, "allow", "Bypass/service-auth/unknown Access policy");
    assert.ok(policy.include && policy.include.length > 0, "Missing Access include rules");
    for (const rule of policy.include) {
      assert.deepEqual(rule, { email_domain: { domain: "coreplane.ai" } },
        "Access allow must explicitly include only @coreplane.ai");
    }
    allows++;
  }
  assert.ok(allows > 0, "Missing @coreplane.ai allow policy");
}

// List every application: a more-specific application can override the root gate.
/** @typedef {{id:string,type:string,domain?:string,self_hosted_domains?:string[],destinations?:{type:string,uri:string}[]}} AccessApp */
/** @param {AccessApp[]} apps */
export function matchingApps(apps) {
  /** @param {AccessApp} app @returns {string[]} */
  const domains = (app) => [app.domain, ...(app.self_hosted_domains ?? []),
    ...(app.destinations ?? []).filter(d => d.type === "public").map(d => d.uri)]
    .filter(domain => domain !== undefined)
    .map(domain => domain.replace(/^https?:\/\//, "").replace(/\/$/, ""));
  /** @param {string} domain */
  const matches = (domain) => {
    const host = domain.split("/")[0];
    const pattern = host.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${pattern}$`, "i").test(DOMAIN);
  };
  const matching = apps.filter(app => domains(app).some(matches));
  assert.ok(matching.some(app => domains(app).includes(DOMAIN)),
    "Access must cover repolore.fun without a path restriction");
  for (const app of matching) assert.equal(app.type, "self_hosted", "Unexpected Access app type");
  return matching;
}

/** @param {string} path @param {string | undefined} token @param {typeof fetch} fetcher */
export async function cloudflare(path, token, fetcher = fetch) {
  assert.ok(token, "Missing Cloudflare token; provision production environment secrets");
  const response = await fetcher(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` }, redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok(response.ok, `Cloudflare read failed (${response.status})`);
  const body = await response.json();
  assert.equal(body.success, true, "Cloudflare read unsuccessful");
  return body;
}

/** @param {string} path @param {string} token */
async function list(path, token) {
  const result = [];
  for (let page = 1; page <= 100; page++) {
    const body = await cloudflare(`${path}?page=${page}&per_page=50`, token);
    assert.ok(Array.isArray(body.result), "Unexpected Cloudflare list");
    result.push(...body.result);
    const pages = body.result_info?.total_pages;
    if (pages !== undefined ? page >= pages : body.result.length < 50) return result;
  }
  throw new Error("Cloudflare pagination exceeded bound");
}

/** @param {typeof fetch} fetcher */
export async function checkEdge(fetcher = fetch) {
  for (const path of ["/", "/api/repos/vitejs/vite", "/_og/vitejs/vite.png", "/assets/app.css"]) {
    const response = await fetcher(`https://${DOMAIN}${path}`, {
      redirect: "manual", signal: AbortSignal.timeout(15_000),
    });
    assert.ok([302, 303, 307].includes(response.status), `Access redirect missing: ${path}`);
    const header = response.headers.get("location");
    assert.ok(header, "Missing Access location");
    const location = new URL(header);
    assert.equal(location.protocol, "https:");
    assert.equal(location.hostname, "coreplane.cloudflareaccess.com", "Wrong Access tenant");
    assert.ok(location.pathname.startsWith("/cdn-cgi/access/login/"), "Wrong Access redirect");
    await response.body?.cancel();
  }
}

export async function preflight() {
  checkConfig(JSON.parse(await readFile("wrangler.json", "utf8")));
  assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT, "Wrong account environment");
  assert.ok(process.env.CLOUDFLARE_API_TOKEN, "Missing CLOUDFLARE_API_TOKEN");
  assert.ok(process.env.CLOUDFLARE_ACCESS_READ_TOKEN, "Missing CLOUDFLARE_ACCESS_READ_TOKEN");
  const { result: subdomain } = await cloudflare(`${SCRIPT}/subdomain`, process.env.CLOUDFLARE_API_TOKEN);
  assert.equal(subdomain.enabled, false, "Live workers.dev enabled");
  assert.equal(subdomain.previews_enabled, false, "Live preview URLs enabled");
  const apps = matchingApps(await list(`/accounts/${ACCOUNT}/access/apps`, process.env.CLOUDFLARE_ACCESS_READ_TOKEN));
  for (const app of apps) {
    assert.match(app.id, /^[a-f0-9-]{36}$/i, "Invalid Access app ID");
    checkPolicies(await list(`/accounts/${ACCOUNT}/access/apps/${app.id}/policies`, process.env.CLOUDFLARE_ACCESS_READ_TOKEN));
  }
  await checkEdge();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "--local") checkConfig(JSON.parse(await readFile("wrangler.json", "utf8")));
  else if (process.argv[2] === "--edge") await checkEdge();
  else if (process.argv[2] === "--remote") await preflight();
  else throw new Error("Use --local, --edge, or --remote");
  console.log("Release guard passed");
}
