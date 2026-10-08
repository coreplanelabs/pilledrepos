import { writeFile } from "node:fs/promises";
import { readJson } from "./index-storage.mjs";
import { localRepoDb } from "./local-repo-db.mjs";
import { aiPage } from "../.server-dist/src/ai.js";
const pointer = await readJson(".data/index/current.json"),
  index = await readJson(".data/index/runs/" + pointer.runId + "/index.json");
if (!index.complete)
  throw new Error("Only a complete capture can populate saved metrics.");
const remote = process.argv.includes("--remote"),
  db = remote ? null : localRepoDb(),
  sql = [];
const quote = (v) =>
  v === null
    ? "NULL"
    : typeof v === "number"
      ? String(v)
      : "'" + String(v).replace(/'/g, "''") + "'";
for (const r of index.pages ?? index.reports) {
  if (!r.repositoryId) throw new Error("Capture lacks its stable repo ID.");
  const snapshot = JSON.stringify({
    page: r.analysis ? r : aiPage(r, index.registry),
    agents: index.registry,
  });
  const insert =
      "INSERT INTO repos(id,name,description,owner_id,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
    iv = [
      r.repositoryId,
      r.repository,
      r.description,
      r.profile.owner.id,
      r.capturedAt,
    ];
  const update =
      "UPDATE repos SET snapshot=?,read_at=?,status='ready',last_error=NULL WHERE id=? AND (read_at IS NULL OR read_at<=?) AND lease_until<=?",
    uv = [snapshot, r.capturedAt, r.repositoryId, r.capturedAt, Date.now()];
  if (db) {
    await db
      .prepare(insert)
      .bind(...iv)
      .run();
    await db
      .prepare(update)
      .bind(...uv)
      .run();
  } else {
    sql.push(insert.replaceAll("?", () => quote(iv.shift())) + ";");
    sql.push(update.replaceAll("?", () => quote(uv.shift())) + ";");
  }
}
if (db) db.close();
else await writeFile(".data/repo-snapshots.sql", sql.join("\n") + "\n");
console.log("Saved completed repo metrics without expiring catalog records.");
