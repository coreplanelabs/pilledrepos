import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { localRepoDb } from "../scripts/local-repo-db.mjs";
import { RepoStore } from "../.server-dist/server/repo-store.js";
const meta = {
  id: 17,
  private: false,
  full_name: "org/repo",
  description: "A public app",
  stargazers_count: 100,
  language: "TypeScript",
  owner: { id: 7, login: "org", type: "Organization" },
};
const agents = {
  version: 1,
  verifiedAt: "2026-10-07T12:00:00Z",
  sources: [],
  agents: [
    {
      id: 1,
      login: "agent",
      aliases: [],
      name: "Agent",
      source: "https://docs.github.com/a",
      accountUrl: "https://github.com/apps/agent",
    },
  ],
};
const empty = {
  data: {
    search: {
      issueCount: 0,
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  },
};
async function context() {
  const root = await mkdtemp(resolve(tmpdir(), "pilledrepos-db-"));
  return {
    root,
    db: localRepoDb(root),
    cleanup: async (db) => {
      db.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test("submitted public repos survive a restart and duplicate submissions keep one record", async () => {
  const c = await context();
  let queries = 0;
  const read = async (path) => {
    if (path === "/graphql") {
      queries++;
      return empty;
    }
    return meta;
  };
  const store = new RepoStore(c.db, read, async () => agents);
  const first = await store.add("org/repo");
  assert.equal(first.status, "ready");
  await store.add("ORG/REPO");
  assert.equal(queries, 1);
  assert.equal(
    (await c.db.prepare("SELECT COUNT(*) n FROM repos").first()).n,
    1,
  );
  c.db.close();
  const reopened = localRepoDb(c.root);
  assert.equal(
    (await new RepoStore(reopened, read, async () => agents).page("org/repo"))
      .analysis.total,
    0,
  );
  await c.cleanup(reopened);
});
test("refresh captures new data and failed captures keep the previous completed snapshot", async () => {
  const c = await context();
  let fail = false,
    now = Date.parse("2026-10-07T12:00:00Z");
  const read = async (path) => {
    if (path === "/graphql") {
      if (fail) throw new Error("Service failure");
      return empty;
    }
    return meta;
  };
  const store = new RepoStore(
    c.db,
    read,
    async () => agents,
    () => now,
  );
  await store.add("org/repo");
  const before = (await store.page("org/repo")).capturedAt;
  now += 3600000;
  await store.add("org/repo", true);
  const refreshed = (await store.page("org/repo")).capturedAt;
  assert.notEqual(refreshed, before);
  fail = true;
  now += 3600000;
  assert.equal((await store.add("org/repo", true)).status, "queued");
  assert.equal((await store.page("org/repo")).capturedAt, refreshed);
  assert.equal(
    (await c.db.prepare("SELECT COUNT(*) n FROM repos").first()).n,
    1,
  );
  await c.cleanup(c.db);
});
test("private metadata is never persisted", async () => {
  const c = await context(),
    store = new RepoStore(
      c.db,
      async () => ({ ...meta, private: true }),
      async () => agents,
    );
  await assert.rejects(store.add("org/repo"));
  assert.equal(
    (await c.db.prepare("SELECT COUNT(*) n FROM repos").first()).n,
    0,
  );
  await c.cleanup(c.db);
});
test("an active capture lease prevents another caller from starting a duplicate read", async () => {
  const c = await context();
  await c.db
    .prepare(
      "INSERT INTO repos(id,name,owner_id,created_at,status,lease,lease_until) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(
      17,
      "org/repo",
      7,
      agents.verifiedAt,
      "indexing",
      "owner",
      Date.now() + 300000,
    )
    .run();
  let reads = 0;
  const store = new RepoStore(
    c.db,
    async (path) => {
      if (path === "/graphql") reads++;
      return meta;
    },
    async () => agents,
  );
  assert.equal((await store.add("org/repo", true)).status, "indexing");
  assert.equal(reads, 0);
  await c.cleanup(c.db);
});
test("a canonical rename refreshes the saved snapshot under the same repo ID", async () => {
  const c = await context();
  let name = "org/repo";
  const store = new RepoStore(
    c.db,
    async (path) =>
      path === "/graphql" ? empty : { ...meta, full_name: name },
    async () => agents,
  );
  await store.add(name);
  name = "org/renamed";
  const saved = await store.add("org/repo");
  assert.equal(saved.repository, name);
  assert.equal(saved.page.repository, name);
  assert.equal(
    (await c.db.prepare("SELECT COUNT(*) n FROM repos").first()).n,
    1,
  );
  await c.cleanup(c.db);
});
