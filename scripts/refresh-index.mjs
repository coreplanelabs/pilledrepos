import { batchMergeReader } from "./batch-merges.mjs";
import { SEED_SIZE } from "./repo-cohort.mjs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { collectIndexedReport } from "../.server-dist/server/github-index.js";
import { refreshAiRegistry } from "../.server-dist/server/ai-registry.js";
import {
  parseRegistry,
  parseReport,
  botCandidates,
  analyzeAi,
  aiPage,
} from "../.server-dist/src/ai.js";
import { parseRepository } from "../.server-dist/src/core.js";
import { githubReader, verifySource, digest } from "./github-api.mjs";
import {
  atomicJson,
  readJson,
  publishLocal,
  acquireLock,
} from "./index-storage.mjs";
const args = process.argv.slice(2);
if (
  args.some(
    (x) => !["--use-gh"].includes(x) && !/^--(limit|resume|repos)=/.test(x),
  )
)
  throw new Error(
    "Use --use-gh, --limit=1..10000, --resume=RUN_ID, or --repos=owner/repo,owner/repo.",
  );
const limit = Number(
  args.find((x) => x.startsWith("--limit="))?.slice(8) ?? SEED_SIZE,
);
if (!Number.isInteger(limit) || limit < 1 || limit > SEED_SIZE)
  throw new Error("Use --limit=1..10000.");
const read = batchMergeReader(githubReader(args.includes("--use-gh")), {
    onWait: (until) =>
      console.log(
        "GitHub budget reserved; continuing after " +
          new Date(until).toISOString(),
      ),
  }),
  root = resolve(".data/index"),
  resume = args.find((x) => x.startsWith("--resume="))?.slice(9);
const runId =
  resume ??
  new Date()
    .toISOString()
    .replace(/[^0-9a-z]/gi, "-")
    .toLowerCase();
if (!/^[a-z0-9-]{1,80}$/.test(runId)) throw new Error("Invalid run ID.");
const releaseLock = acquireLock(root);
const dir = resolve(root, "runs", runId);
await mkdir(resolve(dir, "reports"), { recursive: true });
console.log("Local index run: " + runId);
let state;
try {
  state = await readJson(resolve(dir, "state.json"));
} catch (e) {
  if (resume) throw new Error("Resume state is missing.");
}
if (!state) {
  const capturedAt = new Date().toISOString(),
    seed = parseRegistry(
      JSON.parse(await readFile("config/ai-agents.json", "utf8")),
    );
  const registry = await refreshAiRegistry(
      seed,
      read,
      Date.parse(capturedAt),
      verifySource,
    ),
    selected = [];
  const explicit = args.find((x) => x.startsWith("--repos="))?.slice(8);
  let cohort;
  if (explicit) selected.push(...explicit.split(",").map(parseRepository));
  else {
    cohort = JSON.parse(await readFile("config/repo-seed.json", "utf8"));
    if (
      cohort.version !== 2 ||
      cohort.repositories.length !== SEED_SIZE ||
      new Set(cohort.repositories.map((r) => r.id)).size !== SEED_SIZE
    )
      throw new Error("Invalid top-repo seed.");
    selected.push(
      ...cohort.repositories
        .slice(0, limit)
        .map((r) => parseRepository(r.repository)),
    );
    if (limit === SEED_SIZE && process.env.CLOUDFLARE_INDEX_TOKEN) {
      const { cloudflare, ACCOUNT } = await import("./release-guard.mjs");
      const d = await cloudflare(
        "/accounts/" +
          ACCOUNT +
          "/d1/database/afc39784-ac54-48f4-863b-c526be1c0ab4/query",
        process.env.CLOUDFLARE_INDEX_TOKEN,
        {
          method: "POST",
          body: JSON.stringify({
            sql: "SELECT name FROM repos WHERE seeded=0",
            params: [],
          }),
        },
      );
      selected.push(...d.result[0].results.map((r) => parseRepository(r.name)));
    } else if (limit === SEED_SIZE) {
      const { localRepoDb } = await import("./local-repo-db.mjs");
      const db = localRepoDb();
      const rows = await db
        .prepare("SELECT name FROM repos WHERE seeded=0")
        .all();
      selected.push(...rows.results.map((r) => parseRepository(r.name)));
      db.close();
    }
  }
  const pool = [...new Set(selected)].slice(0, selected.length);
  if (!pool.length || (!explicit && pool.length < limit))
    throw new Error("Repository pool is incomplete.");
  state = {
    runId,
    capturedAt,
    registry,
    registryId: digest(registry),
    classificationId: digest(
      registry.agents
        .map((a) => ({ id: a.id, name: a.name }))
        .sort((a, b) => a.id - b.id),
    ),
    selected: pool,
    expected: pool.length,
    pool: explicit
      ? "Selected repositories"
      : "Top 10,000 active software repos and submitted repos",
    seededCount: explicit ? 0 : Math.min(limit, SEED_SIZE),
    poolId: cohort ? digest(cohort) : undefined,
  };
  await atomicJson(resolve(dir, "state.json"), state);
}
parseRegistry(state.registry);
const pages = [],
  candidateCounts = new Map();
let failures = 0;
async function capture(repository) {
  const file = resolve(
    dir,
    "reports",
    repository.toLowerCase().replace("/", "--") + ".json",
  );
  try {
    let report,
      restored = false;
    try {
      report = parseReport(await readJson(file));
      if (
        report.capturedAt !== state.capturedAt ||
        report.collector !== "merged-window-v2" ||
        !report.coverage.periodComplete
      )
        report = null;
    } catch {}
    if (report) restored = true;
    if (!report) {
      const cachedRead = async (path, body) => {
        const key = digest({ collector: "merged-window-v2", path, body }),
          cache = resolve(
            dir,
            "reads",
            repository.toLowerCase().replace("/", "--"),
            key + ".json",
          );
        try {
          return await readJson(cache);
        } catch {}
        let value;
        if (path.startsWith("/repos/") && !body) {
          try {
            const file = resolve(
              ".data/repo-discovery/metadata",
              digest(path) + ".json",
            );
            if (Date.now() - (await stat(file)).mtimeMs < 3600000)
              value = await readJson(file);
          } catch {}
        }
        value ??= await read(path, body);
        if (!value.errors) await atomicJson(cache, value);
        return value;
      };
      report = await collectIndexedReport(repository, {
        read: cachedRead,
        now: Date.parse(state.capturedAt),
      });
      await atomicJson(file, report);
    }
    pages.push(aiPage(report, state.registry));
    for (const c of botCandidates([report], state.registry)) {
      const prior = candidateCounts.get(c.id);
      candidateCounts.set(c.id, {
        ...c,
        merges: c.merges + (prior?.merges ?? 0),
      });
    }
    if (!restored)
      console.log(
        `${pages.length}/${state.expected} ${repository}: ${analyzeAi(report, state.registry).total} merges`,
      );
  } catch (e) {
    failures++;
    console.warn(repository + ": " + e.message);
  }
}
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(6, state.selected.length) }, async () => {
    while (next < state.selected.length) await capture(state.selected[next++]);
  }),
);
pages.sort((a, b) => a.repository.localeCompare(b.repository));
const candidates = [...candidateCounts.values()].sort(
  (a, b) => b.merges - a.merges || a.id - b.id,
);
await atomicJson(resolve(dir, "candidates.json"), {
  registryId: state.registryId,
  status: "Unverified automation; excluded from AI counts",
  candidates,
});
if (failures || pages.length !== state.expected)
  throw new Error(
    `${failures} captures failed. Previous index preserved. Resume with --resume=${runId} --use-gh or the experiment token.`,
  );
let previous = null;
try {
  const p = await readJson(resolve(root, "current.json"));
  previous = await readJson(resolve(root, "runs", p.runId, "index.json"));
} catch {}
const history = { ...previous?.history };
for (const report of pages) {
  const a = report.analysis;
  if (a.eligible) {
    const points = history[report.repository] ?? [];
    history[report.repository] = [
      ...points.filter((p) => p.capturedAt !== report.capturedAt),
      {
        capturedAt: report.capturedAt,
        ai: a.ai,
        total: a.total,
        registryId: state.registryId,
        classificationId: state.classificationId,
        collector: report.collector,
      },
    ];
  }
}
const index = { ...state, complete: true, pages, history };
await publishLocal(root, runId, index);
releaseLock();
console.log(`Published complete local index (${pages.length} repos).`);
