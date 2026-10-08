import { curatedRepos } from "../.server-dist/src/curated-repos.js";
import { localRepoDb } from "./local-repo-db.mjs";
import { writeFile } from "node:fs/promises";
const remote = process.argv.includes("--remote"),
  db = remote ? null : localRepoDb(),
  sql = [];
const quote = (v) =>
  typeof v === "number"
    ? String(v)
    : "'" + String(v).replaceAll("'", "''") + "'";
for (const r of curatedRepos) {
  const text =
    "INSERT INTO repos(id,name,description,owner_id,seeded,indexed,created_at) VALUES(?,?,?,?,1,1,?) ON CONFLICT(id) DO UPDATE SET indexed=1";
  const values = [
    r.id,
    r.repository,
    r.reason,
    r.ownerId,
    new Date().toISOString(),
  ];
  if (db)
    await db
      .prepare(text)
      .bind(...values)
      .run();
  else {
    let i = 0;
    sql.push(text.replaceAll("?", () => quote(values[i++])) + ";");
  }
}
// One-off enrollment only. Daily refresh never executes this membership rule.
const enrollment = `UPDATE repos SET indexed=1 WHERE seeded=0 OR (json_extract(snapshot,'$.page.analysis.complete')=1 AND json_extract(snapshot,'$.page.analysis.total')>=100)`;
if (db) {
  await db.prepare(enrollment).run();
  console.log(
    await db
      .prepare("SELECT COUNT(*) active FROM repos WHERE indexed=1")
      .first(),
  );
  db.close();
} else {
  sql.push(enrollment + ";");
  await writeFile(".data/enroll-index.sql", sql.join("\n") + "\n");
  console.log(
    "Generated one-off membership SQL; daily jobs do not enroll repositories.",
  );
}
