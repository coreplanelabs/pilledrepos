import { loadIndexedRepos } from "./indexed-repos.mjs";
import { batchMergeReader } from "./batch-merges.mjs";
import { retryCapture } from "./capture-retry.mjs";
import { SEED_SIZE } from "./repo-cohort.mjs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
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
    (x) =>
      !["--use-gh", "--discover"].includes(x) &&
      !/^--(limit|resume|repos)=/.test(x),
  )
)
  throw new Error(
    "Use --use-gh, --discover, --limit=1..10000, --resume=RUN_ID, or --repos=owner/repo,owner/repo.",
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
  const discovery = args.includes("--discover");
  let cohort;
  if (explicit) selected.push(...explicit.split(",").map(parseRepository));
  else if (discovery) {
    cohort = JSON.parse(await readFile("config/repo-seed.json", "utf8"));
    if (
      cohort.version !== 2 ||
      cohort.repositories.length !== SEED_SIZE ||
      new Set(cohort.repositories.map((r) => r.id)).size !== SEED_SIZE
    )
      throw new Error("Invalid discovery seed.");
    selected.push(
      ...cohort.repositories
        .slice(0, limit)
        .map((r) => parseRepository(r.repository)),
    );
  } else {
    cohort = await loadIndexedRepos();
    if (!cohort.length)
      throw new Error(
        "The active index is empty. Run one-off enrollment first; discovery will not run automatically.",
      );
    selected.push(...cohort.map((r) => parseRepository(r.name)));
    if (args.some((x) => x.startsWith("--limit="))) selected.splice(limit);
  }
  const pool = [...new Set(selected)].slice(0, selected.length);
  if (!pool.length || (discovery && pool.length < limit))
    throw new Error("Repository pool is incomplete.");
  state = {
    runId,
    kind: explicit ? "diagnostic" : discovery ? "discovery" : "indexed",
    capturedAt,
    registry,
    registryId: digest(registry),
    classificationId: digest(
      registry.agents
        .map((a) => ({ id: a.id, name: a.name }))
        .sort((a, b) => a.id - b.id),
    ),
    identities:
      !explicit && !discovery
        ? Object.fromEntries(cohort.map((r) => [r.name.toLowerCase(), r.id]))
        : undefined,
    selected: pool,
    expected: pool.length,
    pool: explicit
      ? "Selected repositories"
      : discovery
        ? "One-off software discovery"
        : "Tracked public repos",
    seededCount: discovery ? Math.min(limit, SEED_SIZE) : 0,
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
      const reads = resolve(
        dir,
        "reads",
        repository.toLowerCase().replace("/", "--"),
      );
      const cachedRead = async (path, body) => {
        const key = digest({ collector: "merged-window-v2", path, body }),
          cache = resolve(reads, key + ".json");
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
        if (
          state.kind === "indexed" &&
          path.startsWith("/repos/") &&
          state.identities &&
          value.id !== state.identities[repository.toLowerCase()]
        )
          throw new Error(
            "Indexed repository identity changed; membership is preserved.",
          );
        if (!value.errors) await atomicJson(cache, value);
        return value;
      };
      report = await retryCapture(
        () =>
          collectIndexedReport(repository, {
            read: cachedRead,
            now: Date.parse(state.capturedAt),
          }),
        {
          onRetry: async () => {
            await rm(reads, { recursive: true, force: true });
          },
        },
      );
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
await publishLocal(root, runId, index, {
  activate: state.kind === "indexed" || !state.kind,
});
releaseLock();
console.log(
  `${state.kind === "discovery" || state.kind === "diagnostic" ? "Saved one-off capture; active index unchanged" : "Published complete local index"} (${pages.length} repos).`,
);
