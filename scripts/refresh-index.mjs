import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { collectIndexedReport } from "../.server-dist/server/github-index.js";
import { refreshAiRegistry } from "../.server-dist/server/ai-registry.js";
import {
  parseRegistry,
  parseReport,
  botCandidates,
  analyzeAi,
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
    "Use --use-gh, --limit=1..1000, --resume=RUN_ID, or --repos=owner/repo,owner/repo.",
  );
const limit = Number(
  args.find((x) => x.startsWith("--limit="))?.slice(8) ?? 1000,
);
if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
  throw new Error("Use --limit=1..1000.");
const read = githubReader(args.includes("--use-gh")),
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
  if (explicit) selected.push(...explicit.split(",").map(parseRepository));
  else
    for (let page = 1; page <= Math.ceil(limit / 100); page++) {
      const q = new URLSearchParams({
          q: "is:public fork:false archived:false stars:>500",
          sort: "stars",
          order: "desc",
          per_page: "100",
          page: String(page),
        }),
        data = await read("/search/repositories?" + q);
      if (data.incomplete_results || !Array.isArray(data.items))
        throw new Error("Incomplete repository discovery.");
      selected.push(
        ...data.items
          .filter((r) => r.private === false && !r.fork && !r.archived)
          .map((r) => parseRepository(r.full_name)),
      );
    }
  const pool = [...new Set(selected)].slice(
    0,
    explicit ? selected.length : limit,
  );
  if (!pool.length || (!explicit && pool.length !== limit))
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
      ? "Selected repositories (" + pool.length + " repos)"
      : "Top " + limit + " public non-fork, active repos by stars (500+ stars)",
  };
  await atomicJson(resolve(dir, "state.json"), state);
}
parseRegistry(state.registry);
const reports = [];
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
        const value = await read(path, body);
        if (!value.errors) await atomicJson(cache, value);
        return value;
      };
      report = await collectIndexedReport(repository, {
        read: cachedRead,
        now: Date.parse(state.capturedAt),
      });
      await atomicJson(file, report);
    }
    reports.push(report);
    if (!restored)
      console.log(
        `${reports.length}/${state.expected} ${repository}: ${analyzeAi(report, state.registry).total} merges`,
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
reports.sort((a, b) => a.repository.localeCompare(b.repository));
const candidates = botCandidates(reports, state.registry);
await atomicJson(resolve(dir, "candidates.json"), {
  registryId: state.registryId,
  status: "Unverified automation; excluded from AI counts",
  candidates,
});
if (failures || reports.length !== state.expected)
  throw new Error(
    `${failures} captures failed. Previous index preserved. Resume with --resume=${runId} --use-gh or the experiment token.`,
  );
let previous = null;
try {
  const p = await readJson(resolve(root, "current.json"));
  previous = await readJson(resolve(root, "runs", p.runId, "index.json"));
} catch {}
const history = { ...previous?.history };
for (const report of reports) {
  const a = analyzeAi(report, state.registry);
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
const index = { ...state, complete: true, reports, history };
await publishLocal(root, runId, index);
releaseLock();
console.log(`Published complete local index (${reports.length} repos).`);
