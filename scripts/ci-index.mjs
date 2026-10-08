import { digest } from "./github-api.mjs";
import { loadIndexedRepos } from "./indexed-repos.mjs";
import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(".data/index/runs");
let runs = [];
try {
  runs = await readdir(root);
} catch {}
const poolId = digest(await loadIndexedRepos());
let resume;
for (const id of runs.sort().reverse()) {
  try {
    const state = JSON.parse(
      await readFile(resolve(root, id, "state.json"), "utf8"),
    );
    if (
      state.kind !== "indexed" ||
      state.poolId !== poolId ||
      Date.now() - Date.parse(state.capturedAt) > 7 * 86400000
    )
      continue;
    let complete = false;
    try {
      complete = JSON.parse(
        await readFile(resolve(root, id, "index.json"), "utf8"),
      ).complete;
    } catch {}
    if (!complete) {
      resume = id;
      break;
    }
  } catch {}
}
const args = [
  "scripts/refresh-index.mjs",
  ...(resume ? ["--resume=" + resume] : []),
];
const child = spawnSync(process.execPath, args, {
  stdio: "inherit",
  env: process.env,
});
process.exit(child.status ?? 1);
