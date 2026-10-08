import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, appendFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkReleaseContext,
  currentMain,
  preflight,
  cloudflare,
  ACCOUNT,
  WORKER,
  DOMAIN,
} from "./release-guard.mjs";
import { edgeDatasetReader } from "../.server-dist/server/edge-data.js";
import { verifyLive } from "./verify-live.mjs";
const env = process.env,
  sha = env.GITHUB_SHA;
checkReleaseContext(env, sha);
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sha,
  "Checkout does not match the checked source.",
);
await currentMain(sha);
const config = await preflight(),
  indexToken = env.CLOUDFLARE_INDEX_TOKEN,
  readToken = env.GITHUB_READ_TOKEN;
assert.ok(env.CLOUDFLARE_DEPLOY_TOKEN, "Configure the dedicated deployment credential.");
assert.ok(
  indexToken && readToken,
  "Configure separate index and public GitHub-read credentials.",
);
const kv = `/accounts/${ACCOUNT}/storage/kv/namespaces/${config.kv_namespaces[0].id}/values/`;
const data = await edgeDatasetReader({
  get: (key) =>
    cloudflare(kv + encodeURIComponent(key), indexToken, {
      raw: true,
      allowMissing: true,
    }),
})();
assert.ok(
  data.pages?.length,
  "The first complete indexed dataset must be published before deployment.",
);
const rows = (
  await cloudflare(
    `/accounts/${ACCOUNT}/d1/database/${config.d1_databases[0].database_id}/query`,
    indexToken,
    {
      method: "POST",
      body: JSON.stringify({
        sql: "SELECT COUNT(*) n FROM repos WHERE indexed=1",
        params: [],
      }),
    },
  )
).result[0].results;
assert.ok(
  Number.isSafeInteger(rows[0]?.n) && rows[0].n > 0,
  "D1 membership must be initialized before deployment.",
);
const github = await fetch("https://api.github.com/graphql", {
  method: "POST",
  redirect: "error",
  signal: AbortSignal.timeout(20000),
  headers: {
    Authorization: "Bearer " + readToken,
    "Content-Type": "application/json",
    "User-Agent": "PilledRepos-Release",
  },
  body: JSON.stringify({ query: "query {rateLimit {remaining}}" }),
});
assert.ok(github.ok, "Public GitHub read credential is unavailable.");
const auth = await github.json();
assert.ok(
  !auth.errors && auth.data?.rateLimit,
  "Public GitHub GraphQL read credential is invalid.",
);
if (process.argv.includes("--preflight")) {
  console.log(
    "Checked source, DNS/account, complete KV data, D1 membership, and public GitHub read access.",
  );
  process.exit(0);
}
const token = env.CLOUDFLARE_DEPLOY_TOKEN,
  script = `/accounts/${ACCOUNT}/workers/scripts/${WORKER}`,
  dir = await mkdtemp(join(tmpdir(), "pilledrepos-release-"));
async function summary(message) {
  console.log(message);
  if (env.GITHUB_STEP_SUMMARY)
    await appendFile(env.GITHUB_STEP_SUMMARY, message + "\n\n");
}
function run(args, file) {
  const r = spawnSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    {
      stdio: "inherit",
      env: {
        ...env,
        CLOUDFLARE_API_TOKEN: token,
        CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
        WRANGLER_SEND_METRICS: "false",
        WRANGLER_OUTPUT_FILE_PATH: file,
      },
    },
  );
  assert.equal(
    r.status,
    0,
    "Wrangler did not confirm completion; inspect remote state before retrying.",
  );
}
async function active() {
  return (
    (await cloudflare(script + "/deployments", token, { allowMissing: true }))
      ?.result?.deployments?.[0] ?? null
  );
}
try {
  const previous = await active(),
    file = join(dir, "upload.jsonl"),
    secrets = join(dir, "secrets.json");
  await writeFile(secrets, JSON.stringify({ GITHUB_READ_TOKEN: readToken }), {
    mode: 0o600,
  });
  const common = [
    "--strict",
    "--keep-vars",
    "--tag",
    sha.slice(0, 12),
    "--message",
    "GitHub main " + sha,
    "--var",
    "SOURCE_SHA:" + sha,
    "--secrets-file",
    secrets,
  ];
  if (previous)
    await summary(
      `Previous deployment ${previous.id}; rollback ${previous.versions.map((v) => v.version_id + "@" + v.percentage).join(" ")}.`,
    );
  await currentMain(sha);
  run(
    previous ? ["versions", "upload", ...common] : ["deploy", ...common],
    file,
  );
  const entries = (await readFile(file, "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse)
    .filter((x) => x.type === (previous ? "version-upload" : "deploy"));
  assert.equal(entries.length, 1);
  const upload = entries[0];
  assert.equal(upload.worker_name, WORKER);
  assert.match(upload.version_id, /^[a-f0-9-]{36}$/i);
  assert.ok(!upload.preview_url && !upload.preview_alias_url);
  if (previous) {
    await currentMain(sha);
    assert.equal(
      (await active())?.id,
      previous.id,
      "An external deployment changed during CI.",
    );
    run(
      [
        "versions",
        "deploy",
        upload.version_id + "@100",
        "--yes",
        "--message",
        "GitHub main " + sha,
      ],
      join(dir, "deploy.jsonl"),
    );
  }
  const deployment = await active();
  assert.deepEqual(deployment?.versions, [
    { version_id: upload.version_id, percentage: 100 },
  ]);
  await summary(
    `Source ${sha}; active version ${upload.version_id}; deployment ${deployment.id}.`,
  );
  const proof = await verifyLive("https://" + DOMAIN, sha);
  await summary(
    `Live revision ${proof.revision} passed home, ${proof.repository}, leaderboard, PNG, CSS, and browser-script checks.`,
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
