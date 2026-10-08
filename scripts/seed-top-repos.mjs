import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { githubReader, digest } from "./github-api.mjs";
import { atomicJson } from "./index-storage.mjs";
import { selectTopRepos, SEED_SIZE } from "./repo-cohort.mjs";
const root = resolve(".data/repo-discovery");
await mkdir(root, { recursive: true });
const stampFile = resolve(root, "discovery.json");
let state;
try {
  state = JSON.parse(await readFile(stampFile, "utf8"));
} catch {}
if (!state) {
  state = {
    capturedAt: new Date().toISOString(),
    since: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10),
  };
  await atomicJson(stampFile, state);
}
const read = githubReader(process.argv.includes("--use-gh"));
let last = 0,
  calls = 0;
async function search(q, page) {
  const path =
      "/search/repositories?" +
      new URLSearchParams({
        q,
        sort: "stars",
        order: "desc",
        per_page: "100",
        page: String(page),
      }),
    file = resolve(root, digest(path) + ".json");
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {}
  const delay = 2100 - (Date.now() - last);
  if (delay > 0) await new Promise((done) => setTimeout(done, delay));
  last = Date.now();
  const data = await read(path);
  if (data.incomplete_results)
    throw new Error("Incomplete search; previous seed preserved.");
  await atomicJson(file, data);
  console.log(`Repository discovery: ${++calls} searches`);
  return data;
}
const rows = await selectTopRepos(search, { since: state.since });
for (const expected of ["kubernetes/kubernetes", "PostHog/posthog"])
  if (!rows.some((r) => r.full_name.toLowerCase() === expected.toLowerCase()))
    throw new Error("Expected major repository missing: " + expected);
for (const r of rows)
  await atomicJson(
    resolve(root, "metadata", digest("/repos/" + r.full_name) + ".json"),
    r,
  );
const seed = {
  version: 2,
  capturedAt: state.capturedAt,
  source: "https://github.com/search?type=repositories",
  method:
    "Top 10,000 public, non-fork, non-archived software repos by stars, pushed within 90 days. At least 500 stars; excludes curated lists and tutorials. No AI-config requirement.",
  repositories: rows.map((r) => ({
    id: r.id,
    repository: r.full_name,
    url: r.html_url,
    description: r.description ?? "",
    ownerId: r.owner.id,
    stars: r.stargazers_count,
    language: r.language,
    pushedAt: r.pushed_at,
    score: r.stargazers_count,
    evidence: [r.html_url],
  })),
};
await atomicJson("config/repo-seed.json", seed);
console.log(
  `Frozen ${SEED_SIZE} repos; Kubernetes and PostHog verified; ${digest(seed)}`,
);
