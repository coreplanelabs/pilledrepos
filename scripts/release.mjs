import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { cloudflare, SCRIPT, WORKER, preflight } from "./release-guard.mjs";

const sha = process.env.GITHUB_SHA;
assert.equal(process.env.GITHUB_EVENT_NAME, "push");
assert.equal(process.env.GITHUB_REF, "refs/heads/main");
assert.equal(process.env.GITHUB_REPOSITORY, "coreplanelabs/repolore");
assert.ok(sha, "Missing source SHA");
assert.match(sha, /^[a-f0-9]{40}$/);

async function currentMain() {
  assert.ok(process.env.GH_TOKEN, "Missing read-only GitHub workflow token");
  const response = await fetch("https://api.github.com/repos/coreplanelabs/repolore/git/ref/heads/main", {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: "application/vnd.github+json" },
    redirect: "error", signal: AbortSignal.timeout(15_000),
  });
  assert.ok(response.ok, `Could not read main (${response.status})`);
  assert.equal((await response.json()).object.sha, sha, "Stale main run; latest main must deploy");
}
/** @param {string} message */
async function summary(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
}
/** @returns {Promise<{id:string,versions:{version_id:string,percentage:number}[]}>} */
async function deployment() {
  const { result } = await cloudflare(`${SCRIPT}/deployments`, process.env.CLOUDFLARE_API_TOKEN);
  assert.ok(result.deployments?.[0]?.versions?.length, "Missing previous deployment");
  return result.deployments[0];
}
/** @param {string[]} args @param {string} outputPath */
function wrangler(args, outputPath) {
  const child = spawnSync("node", ["node_modules/wrangler/bin/wrangler.js", ...args], {
    stdio: "inherit", env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: outputPath },
  });
  assert.equal(child.status, 0, "Wrangler failed; inspect deployment state before retrying");
}

await currentMain();
await preflight();
const previous = await deployment();
await summary(`Source: ${sha}. Previous deployment: ${previous.id}. Rollback versions: ${previous.versions.map(v => `${v.version_id}@${v.percentage}`).join(" ")}.`);
const scratch = await mkdtemp(join(tmpdir(), "repolore-release-"));
try {
  const output = join(scratch, "upload.jsonl");
  wrangler(["versions", "upload", "--strict", "--keep-vars", "--tag", sha.slice(0, 12), "--message", `GitHub main ${sha}`], output);
  const uploads = (await readFile(output, "utf8")).trim().split("\n").map(line => JSON.parse(line)).filter(entry => entry.type === "version-upload");
  assert.equal(uploads.length, 1, "Expected one typed version upload receipt");
  const uploaded = uploads[0];
  assert.equal(uploaded.worker_name, WORKER);
  assert.match(uploaded.version_id, /^[a-f0-9-]{36}$/i);
  assert.ok(!uploaded.preview_url && !uploaded.preview_alias_url, "Unexpected public preview URL");
  await summary(`Uploaded version: ${uploaded.version_id}.`);
  await currentMain();
  assert.equal((await deployment()).id, previous.id, "Deployment changed outside CI; stop and inspect");
  wrangler(["versions", "deploy", `${uploaded.version_id}@100`, "--yes", "--message", `GitHub main ${sha}`], join(scratch, "deploy.jsonl"));
  const active = await deployment();
  assert.deepEqual(active.versions, [{ version_id: uploaded.version_id, percentage: 100 }], "Active version differs from upload");
  await summary(`Deployed version: ${uploaded.version_id}. Deployment: ${active.id}.`);
  await preflight();
  await summary("Access policy and anonymous redirects passed. Signed-in functional checks remain a maintainer release check.");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
