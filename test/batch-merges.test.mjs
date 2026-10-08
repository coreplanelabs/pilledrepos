import { test } from "node:test";
import assert from "node:assert/strict";
import { batchMergeReader } from "../scripts/batch-merges.mjs";
import { INDEX_QUERY } from "../.server-dist/server/github-index.js";
test("batched searches preserve each repo query, cursor, response, and error scope", async () => {
  let calls = 0;
  const read = batchMergeReader(async (path, body) => {
    calls++;
    assert.equal(path, "/graphql");
    assert.equal(body.variables.query0, "repo:org/a");
    assert.equal(body.variables.after1, "next");
    return {
      data: { r0: { issueCount: 3 }, r1: { issueCount: 4 } },
      errors: [{ path: ["r1"], message: "failed" }],
    };
  });
  const [a, b] = await Promise.all([
    read("/graphql", {
      query: INDEX_QUERY,
      variables: { query: "repo:org/a", after: null },
    }),
    read("/graphql", {
      query: INDEX_QUERY,
      variables: { query: "repo:org/b", after: "next" },
    }),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.data.search.issueCount, 3);
  assert.equal(a.errors, undefined);
  assert.equal(b.errors[0].message, "failed");
});
test("a transport failure rejects every affected search", async () => {
  const read = batchMergeReader(async () => {
    throw new Error("offline");
  });
  const rows = await Promise.allSettled(
    [1, 2].map((i) =>
      read("/graphql", {
        query: INDEX_QUERY,
        variables: { query: "repo:org/" + i, after: null },
      }),
    ),
  );
  assert.ok(rows.every((r) => r.status === "rejected"));
});
test("the next batch waits for GitHub budget reset rather than spending the reserve", async () => {
  let release,
    calls = 0,
    clock = 0;
  const read = batchMergeReader(
    async () => {
      calls++;
      return {
        data: {
          r0: { issueCount: 1 },
          rateLimit: { remaining: 1, resetAt: new Date(2000).toISOString() },
        },
      };
    },
    { now: () => clock, pause: () => new Promise((r) => (release = r)) },
  );
  await read("/graphql", {
    query: INDEX_QUERY,
    variables: { query: "repo:org/a", after: null },
  });
  const second = read("/graphql", {
    query: INDEX_QUERY,
    variables: { query: "repo:org/b", after: null },
  });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls, 1);
  clock = 3001;
  release();
  await second;
  assert.equal(calls, 2);
});
