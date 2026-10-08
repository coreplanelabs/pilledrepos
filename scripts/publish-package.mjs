import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { checkReleaseContext, currentMain } from "./release-guard.mjs";
export function mergeVersion(base, sha, run) {
  assert.match(base, /^\d+\.\d+\.\d+$/);
  assert.match(sha, /^[a-f0-9]{40}$/);
  assert.match(String(run), /^[1-9]\d*$/);
  return `${base}-main.${run}.g${sha.slice(0, 12)}`;
}
if (
  process.argv[1] &&
  new URL(import.meta.url).pathname === resolve(process.argv[1])
) {
  const env = process.env,
    sha = env.GITHUB_SHA;
  checkReleaseContext(env, sha);
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sha,
  );
  await currentMain(sha);
  const original = await readFile("package.json", "utf8"),
    p = JSON.parse(original);
  assert.equal(p.name, "@coreplane/pilledrepos");
  assert.equal(
    p.repository.url,
    "https://github.com/coreplanelabs/pilledrepos.git",
  );
  const version = mergeVersion(p.version, sha, env.GITHUB_RUN_NUMBER),
    url =
      "https://registry.npmjs.org/" +
      encodeURIComponent(p.name) +
      "/" +
      version;
  const prior = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (prior.ok) {
    assert.equal(
      (await prior.json()).gitHead,
      sha,
      "Existing package version has another source head.",
    );
    console.log(`Package ${version} is already published for ${sha}.`);
  } else {
    assert.equal(prior.status, 404, "Cannot verify npm publication state.");
    await writeFile(
      "package.json",
      JSON.stringify({ ...p, version }, null, 2) + "\n",
    );
    try {
      await currentMain(sha);
      const r = spawnSync(
        "npm",
        ["publish", "--access", "public", "--tag", "next", "--provenance"],
        { stdio: "inherit" },
      );
      assert.equal(
        r.status,
        0,
        "npm did not confirm publication; inspect registry before retrying.",
      );
    } finally {
      await writeFile("package.json", original);
    }
    const published = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    assert.ok(published.ok);
    const receipt = await published.json();
    assert.equal(receipt.version, version);
    assert.equal(receipt.gitHead, sha);
    console.log(`Verified npm ${p.name}@${version}, source ${sha}.`);
  }
}
