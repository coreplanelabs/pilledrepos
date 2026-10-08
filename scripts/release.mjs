import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, appendFile, rm } from "node:fs/promises";
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
const sha = process.env.GITHUB_SHA;
checkReleaseContext(process.env, sha);
await currentMain(sha);
await preflight();
const token = process.env.CLOUDFLARE_DEPLOY_TOKEN,
  script = `/accounts/${ACCOUNT}/workers/scripts/${WORKER}`;
const dir = await mkdtemp(join(tmpdir(), "pilledrepos-release-"));
async function summary(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, message + "\n\n");
}
function run(args, file) {
  const r = spawnSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    {
      stdio: "inherit",
      env: {
        ...process.env,
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
    "Wrangler did not confirm completion. Inspect state before retrying.",
  );
}
try {
  const receipt = join(dir, "upload.jsonl");
  run(
    [
      "versions",
      "upload",
      "--strict",
      "--keep-vars",
      "--tag",
      sha.slice(0, 12),
    ],
    receipt,
  );
  const entries = (await readFile(receipt, "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse)
    .filter((x) => x.type === "version-upload");
  assert.equal(entries.length, 1);
  const upload = entries[0];
  assert.equal(upload.worker_name, WORKER);
  assert.match(upload.version_id, /^[a-f0-9-]{36}$/);
  assert.ok(!upload.preview_url && !upload.preview_alias_url);
  await currentMain(sha);
  await summary(
    `Checked source ${sha}; uploaded version ${upload.version_id}.`,
  );
  run(
    ["versions", "deploy", upload.version_id + "@100", "--yes"],
    join(dir, "deploy.jsonl"),
  );
  const active = (await cloudflare(script + "/deployments", token)).result
    .deployments[0];
  assert.deepEqual(active.versions, [
    { version_id: upload.version_id, percentage: 100 },
  ]);
  await summary(`Active deployment ${active.id}.`);
  for (const path of [
    "/",
    "/microsoft/vscode",
    "/api/leaderboard",
    "/_og/microsoft/vscode.png",
  ]) {
    const r = await fetch("https://" + DOMAIN + path, {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(r.status, 200, "Public functional check failed: " + path);
    if (path.endsWith(".png"))
      assert.match(r.headers.get("Content-Type"), /image\/png/);
    await r.body?.cancel();
  }
  await summary(
    "Public HTML, repo details, leaderboard API, and OG image checks passed.",
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
