import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compactDataset } from "../.server-dist/server/edge-data.js";
import { digest } from "./github-api.mjs";
import { readJson } from "./index-storage.mjs";
export async function publishSnapshot(data, store) {
  const compact = compactDataset(data);
  if (
    data.kind !== "indexed" ||
    !Number.isSafeInteger(data.expected) ||
    data.expected < 1 ||
    data.selected?.length !== data.expected ||
    compact.pages.length !== data.expected ||
    new Set(data.selected.map((n) => n.toLowerCase())).size !== data.expected ||
    data.selected.some(
      (n) =>
        !compact.pages.some(
          (p) =>
            (p.requestedRepository ?? p.repository).toLowerCase() ===
            n.toLowerCase(),
        ),
    )
  )
    throw new Error(
      "Publication requires the complete indexed cohort, not discovery or partial data.",
    );
  const text = JSON.stringify(compact),
    sha = digest(text),
    key = "dataset:" + sha;
  if (Buffer.byteLength(text) > 24 * 1024 * 1024)
    throw new Error("Compact dataset exceeds its publication size bound.");
  const previousRaw = await store.get("current"),
    previous = previousRaw ? JSON.parse(previousRaw) : null;
  if (previous?.key === key) return { key, sha, unchanged: true };
  await store.put(key, text);
  const receipt = await store.get(key);
  if (!receipt || digest(receipt) !== sha)
    throw new Error(
      "New dataset readback failed. Previous index remains active.",
    );
  const manifest = {
    version: 1,
    key,
    sha,
    previousKey: previous?.key,
    previousSha: previous?.sha,
    previousRepositories: previous?.repositories,
    capturedAt: compact.capturedAt,
    repositories: compact.pages.length,
  };
  await store.put("current", JSON.stringify(manifest));
  const pointer = await store.get("current");
  if (!pointer || JSON.parse(pointer).key !== key)
    throw new Error(
      "Pointer readback did not confirm publication; inspect before retrying.",
    );
  return manifest;
}
if (
  process.argv[1] &&
  new URL(import.meta.url).pathname === resolve(process.argv[1])
) {
  const root = resolve(".data/index"),
    pointer = await readJson(resolve(root, "current.json")),
    data = await readJson(resolve(root, "runs", pointer.runId, "index.json"));
  if (process.argv.includes("--dry-run")) {
    const text = JSON.stringify(compactDataset(data));
    await writeFile(".data/compact-index.json", text);
    console.log(
      `Validated compact index: ${Buffer.byteLength(text)} bytes, SHA ${digest(text)}.`,
    );
  } else {
    const { preflight, cloudflare } = await import("./release-guard.mjs");
    const config = await preflight({ indexOnly: true });
    const token = process.env.CLOUDFLARE_INDEX_TOKEN,
      base = `/accounts/${config.account_id}/storage/kv/namespaces/${config.kv_namespaces[0].id}/values/`;
    const store = {
      get: async (key) => {
        const r = await cloudflare(base + encodeURIComponent(key), token, {
          raw: true,
          allowMissing: true,
        });
        return r;
      },
      put: async (key, value) =>
        cloudflare(base + encodeURIComponent(key), token, {
          method: "PUT",
          body: value,
          raw: true,
        }),
    };
    console.log("Published index:", (await publishSnapshot(data, store)).key);
  }
}
