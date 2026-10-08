import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
export function localRepoDb(root = resolve(".data")) {
  mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(resolve(root, "repos.sqlite"));
  db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
  db.exec(
    readFileSync(new URL("../config/schema.sql", import.meta.url), "utf8"),
  );
  if (
    !db
      .prepare("PRAGMA table_info(repos)")
      .all()
      .some((c) => c.name === "indexed")
  )
    db.exec(
      "ALTER TABLE repos ADD COLUMN indexed INTEGER NOT NULL DEFAULT 0 CHECK(indexed IN (0,1))",
    );
  db.exec("CREATE INDEX IF NOT EXISTS repos_indexed ON repos(indexed,name)");
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let values = [];
      const bound = {
        bind(...args) {
          values = args;
          return bound;
        },
        async run() {
          const r = stmt.run(...values);
          return { meta: { changes: Number(r.changes) } };
        },
        async first() {
          return stmt.get(...values) ?? null;
        },
        async all() {
          return { results: stmt.all(...values) };
        },
      };
      return bound;
    },
    close() {
      db.close();
    },
    raw: db,
  };
}
