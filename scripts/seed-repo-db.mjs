import { SEED_SIZE } from "./repo-cohort.mjs";
import { aiPage } from "../.server-dist/src/ai.js";
import { readFile, writeFile } from "node:fs/promises";
import { localRepoDb } from "./local-repo-db.mjs";
import { readJson } from "./index-storage.mjs";
import { digest } from "./github-api.mjs";
const seed = JSON.parse(await readFile("config/repo-seed.json", "utf8"));
if (
  seed.repositories.length !== SEED_SIZE ||
  new Set(seed.repositories.map((r) => r.id)).size !== SEED_SIZE
)
  throw new Error("Seed must have 10,000 unique GitHub IDs.");
const db = localRepoDb();
let index;
try {
  const pointer = await readJson(".data/index/current.json");
  index = await readJson(".data/index/runs/" + pointer.runId + "/index.json");
} catch {}
const sql = [];
for (const r of seed.repositories) {
  const stmt =
    "INSERT INTO repos(id,name,description,owner_id,seeded,fit_score,fit_evidence,created_at) VALUES(?,?,?,?,1,?,?,?) ON CONFLICT(id) DO UPDATE SET seeded=1,fit_score=excluded.fit_score,fit_evidence=excluded.fit_evidence";
  const values = [
    r.id,
    r.repository,
    r.description,
    r.ownerId,
    r.score,
    JSON.stringify(r.evidence),
    seed.capturedAt,
  ];
  await db
    .prepare(stmt)
    .bind(...values)
    .run();
  const literal = (v) =>
    v === null
      ? "NULL"
      : typeof v === "number"
        ? String(v)
        : "'" + String(v).replace(/'/g, "''") + "'";
  sql.push(stmt.replaceAll("?", () => literal(values.shift())) + ";");
  const report = index?.reports?.find((p) => p.repository === r.repository);
  if (report) {
    const request = report.requestedRepository ?? report.repository;
    try {
      const hash = digest({
          collector: "merged-window-v2",
          path: "/repos/" + request,
        }),
        meta = await readJson(
          ".data/index/runs/" +
            index.runId +
            "/reads/" +
            request.toLowerCase().replace("/", "--") +
            "/" +
            hash +
            ".json",
        );
      if (meta.id === r.id) {
        const bound = { ...report, repositoryId: r.id };
        await db
          .prepare(
            "UPDATE repos SET snapshot=?,read_at=?,status='ready' WHERE id=? AND snapshot IS NULL",
          )
          .bind(
            JSON.stringify({
              page: aiPage(bound, index.registry),
              agents: index.registry,
            }),
            report.capturedAt,
            r.id,
          )
          .run();
      }
    } catch {}
  }
}
await writeFile(".data/repo-seed.sql", sql.join("\n") + "\n");
db.close();
console.log("Seeded 10,000 top repos without removing saved submissions.");
