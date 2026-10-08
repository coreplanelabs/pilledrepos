import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localRepoDb } from "../scripts/local-repo-db.mjs";
import { indexedRepos } from "../scripts/indexed-repos.mjs";
test("daily selection uses fixed database membership, including low-score user entries, and never enrolls new high scores", async () => {
  const root = await mkdtemp(join(tmpdir(), "pilled-membership-")),
    db = localRepoDb(root);
  try {
    for (const [id, name, indexed, total, ai] of [
      [1, "org/tracked", 1, 200, 50],
      [2, "org/archive", 0, 1000, 900],
      [3, "org/submitted", 1, 0, 0],
    ])
      await db
        .prepare(
          "INSERT INTO repos(id,name,owner_id,indexed,created_at,snapshot) VALUES(?,?,1,?,'2026-10-08',?)",
        )
        .bind(
          id,
          name,
          indexed,
          JSON.stringify({ page: { analysis: { complete: true, total, ai } } }),
        )
        .run();
    assert.deepEqual(
      (await indexedRepos(db)).map((r) => r.name),
      ["org/submitted", "org/tracked"],
    );
    await db
      .prepare("UPDATE repos SET snapshot=? WHERE id=1")
      .bind(
        JSON.stringify({
          page: { analysis: { complete: true, total: 10, ai: 0 } },
        }),
      )
      .run();
    assert.deepEqual(
      (await indexedRepos(db)).map((r) => r.name),
      ["org/submitted", "org/tracked"],
    );
    assert.equal(
      (await db.prepare("SELECT indexed FROM repos WHERE id=2").first())
        .indexed,
      0,
    );
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("one-off enrollment admits active zero-score repos and user overrides but leaves small archived samples out", async () => {
  const root = await mkdtemp(join(tmpdir(), "pilled-enroll-")),
    db = localRepoDb(join(root, ".data"));
  for (const [id, name, seeded, total] of [
    [1, "org/zero", 1, 100],
    [2, "org/small", 1, 10],
    [3, "org/user", 0, 0],
  ])
    await db
      .prepare(
        "INSERT INTO repos(id,name,owner_id,seeded,created_at,snapshot) VALUES(?,?,1,?,'2026-10-08',?)",
      )
      .bind(
        id,
        name,
        seeded,
        JSON.stringify({
          page: { analysis: { complete: true, total, ai: 0 } },
        }),
      )
      .run();
  const { spawnSync } = await import("node:child_process");
  const entry = new URL("../scripts/enroll-index.mjs", import.meta.url);
  try {
    const result = spawnSync(process.execPath, [entry.pathname], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      (await db.prepare("SELECT indexed FROM repos WHERE id=1").first())
        .indexed,
      1,
    );
    assert.equal(
      (await db.prepare("SELECT indexed FROM repos WHERE id=2").first())
        .indexed,
      0,
    );
    assert.equal(
      (await db.prepare("SELECT indexed FROM repos WHERE id=3").first())
        .indexed,
      1,
    );
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("local database startup waits for a short existing writer lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "pilled-lock-"));
  const { spawn } = await import("node:child_process");
  const { once } = await import("node:events");
  const holder = spawn(
    process.execPath,
    [
      "-e",
      `const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec('PRAGMA journal_mode=DELETE;CREATE TABLE hold(n INTEGER);BEGIN EXCLUSIVE;INSERT INTO hold VALUES(1)');process.send('locked');process.on('message',()=>setTimeout(()=>{db.exec('COMMIT');db.close();process.exit(0)},50));`,
      join(root, "repos.sqlite"),
    ],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  await once(holder, "message");
  const done = once(holder, "exit");
  holder.send("release");
  let db;
  try {
    db = localRepoDb(root);
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM repos").first()).n,
      0,
    );
  } finally {
    db?.close();
    await done;
    await rm(root, { recursive: true, force: true });
  }
});
