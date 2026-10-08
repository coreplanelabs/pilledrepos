import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
export async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = path + ".tmp-" + process.pid;
  await writeFile(tmp, JSON.stringify(value));
  await rename(tmp, path);
}
export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
export async function publishLocal(root, runId, index) {
  const records = index.pages ?? index.reports ?? [];
  if (
    !/^[a-z0-9-]+$/.test(runId) ||
    !index.complete ||
    records.length !== index.selected.length ||
    index.selected.length !== index.expected ||
    new Set(records.map((r) => r.repository.toLowerCase())).size !==
      index.expected
  )
    throw new Error("Incomplete index cannot be published.");
  if (
    index.selected.some(
      (name) =>
        !records.some(
          (r) =>
            (r.requestedRepository ?? r.repository).toLowerCase() ===
            name.toLowerCase(),
        ),
    )
  )
    throw new Error("Repository pool does not match captured reports.");
  if (
    records.some(
      (r) =>
        r.collector !== "merged-window-v2" ||
        !(r.analysis?.complete ?? r.coverage?.periodComplete) ||
        r.capturedAt !== index.capturedAt,
    ) ||
    !index.registryId
  )
    throw new Error("Mixed capture cannot be published.");
  const path = resolve(root, "runs", runId, "index.json");
  let existing;
  try {
    existing = await readJson(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(index))
      throw new Error("A published dataset is immutable. Start a new run.");
  } else await atomicJson(path, index);
  // One pointer switches readers to a fully written dataset. No external publication.
  await atomicJson(resolve(root, "current.json"), { runId });
}

export function acquireLock(root) {
  const dir = resolve(root, "capture.lock"),
    owner = resolve(dir, "owner.json");
  mkdirSync(root, { recursive: true });
  try {
    mkdirSync(dir);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    let prior;
    try {
      prior = JSON.parse(readFileSync(owner, "utf8"));
    } catch {
      throw new Error(
        "Index lock has no owner. Inspect it before removing it.",
      );
    }
    if (!Number.isSafeInteger(prior.pid) || prior.pid < 1)
      throw new Error(
        "Invalid index lock owner. Inspect it before removing it.",
      );
    let alive = true;
    try {
      process.kill(prior.pid, 0);
    } catch (e) {
      if (e.code === "ESRCH") alive = false;
      else throw e;
    }
    if (alive)
      throw new Error(
        "An index run is already active. Wait or resume after it ends.",
      );
    rmSync(dir, { recursive: true });
    mkdirSync(dir);
  }
  writeFileSync(owner, JSON.stringify({ pid: process.pid }));
  const release = () => {
    try {
      if (JSON.parse(readFileSync(owner, "utf8")).pid === process.pid)
        rmSync(dir, { recursive: true });
    } catch {}
  };
  process.once("exit", release);
  process.once("SIGTERM", () => {
    release();
    process.exit(143);
  });
  process.once("SIGINT", () => {
    release();
    process.exit(130);
  });
  return release;
}
