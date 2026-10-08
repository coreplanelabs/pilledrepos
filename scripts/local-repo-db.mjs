import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
export function localRepoDb(root = resolve(".data")) {
  mkdirSync(root, { recursive: true });
  const db = new DatabaseSync(resolve(root, "repos.sqlite"));
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec(
    readFileSync(new URL("../config/schema.sql", import.meta.url), "utf8"),
  );
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
