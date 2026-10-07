import { test } from "node:test";
import assert from "node:assert/strict";
import { collectIndexedReport, INDEX_QUERY } from "../server/github-index.js";
import { now } from "./fixtures.js";
const meta = {
  private: false,
  full_name: "org/repo",
  description: "Test",
  stargazers_count: 200,
  language: "TypeScript",
  owner: {
    id: 7,
    login: "org",
    type: "Organization",
    avatar_url: "https://avatars.githubusercontent.com/u/7",
  },
};
function row(n: number, merged = now - 2000) {
  return {
    repository: { isPrivate: false, nameWithOwner: "org/repo" },
    number: n,
    title: "Change",
    createdAt: new Date(now - 200 * 86400000).toISOString(),
    updatedAt: new Date(now - 1000).toISOString(),
    mergedAt: new Date(merged).toISOString(),
    isDraft: false,
    headRefOid: "a".repeat(40),
    author: {
      databaseId: 198982749,
      __typename: "Bot",
      login: "Copilot",
      avatarUrl: "https://avatars.githubusercontent.com/u/198982749",
    },
  };
}
function page(
  nodes: ReturnType<typeof row>[],
  count = nodes.length,
  next = false,
  cursor: string | null = "end",
) {
  return {
    data: {
      search: {
        nodes,
        issueCount: count,
        pageInfo: { hasNextPage: next, endCursor: cursor },
      },
    },
  };
}
test("collector pages through all merge matches regardless of creation or update order", async () => {
  let i = 0;
  const r = await collectIndexedReport("org/repo", {
    now,
    read: async (path, body) => {
      if (path.startsWith("/repos/")) return meta;
      assert.equal((body as { query: string }).query, INDEX_QUERY);
      assert.match(
        (body as { variables: { query: string } }).variables.query,
        /merged:[^ ]+\.\.[^ ]+/,
      );
      return i++ === 0
        ? page([row(1)], 2, true)
        : page([row(2, now - 3000)], 2);
    },
  });
  assert.deepEqual(
    r.facts.closed.map((p) => p.number),
    [1, 2],
  );
  assert.equal(r.coverage.periodComplete, true);
  assert.equal(i, 2);
  assert.doesNotMatch(INDEX_QUERY, /totalComments|oldest|UPDATED_AT/);
});
test("search window larger than 1000 is split and reconciled, not truncated", async () => {
  const early = now - 70 * 86400000,
    late = now - 2000;
  let i = 0;
  const r = await collectIndexedReport("org/repo", {
    now,
    read: async (path) => {
      if (path.startsWith("/repos/")) return meta;
      i++;
      if (i === 1) return page([], 1001, true);
      if (i === 2)
        return page(
          Array.from({ length: 100 }, (_, k) => row(k + 1, early)),
          500,
          true,
          "a",
        );
      if (i < 7)
        return page(
          Array.from({ length: 100 }, (_, k) =>
            row((i - 2) * 100 + k + 1, early),
          ),
          500,
          i < 6,
          String(i),
        );
      const offset = (i - 7) * 100;
      return page(
        Array.from({ length: i === 12 ? 1 : 100 }, (_, k) =>
          row(501 + offset + k, late),
        ),
        501,
        i < 12,
        String(i),
      );
    },
  });
  assert.equal(r.facts.closed.length, 1001);
  assert.equal(i, 12);
});
test("deleted authors remain in denominator", async () => {
  const p = page([
    { ...row(1), author: null as unknown as ReturnType<typeof row>["author"] },
  ]);
  const r = await collectIndexedReport("org/repo", {
    now,
    read: async (path) => (path.startsWith("/repos/") ? meta : p),
  });
  assert.equal(r.facts.closed[0].author, null);
});
test("private metadata is refused; public canonical repository rename is accepted", async () => {
  await assert.rejects(
    collectIndexedReport("org/repo", {
      now,
      read: async () => ({ ...meta, private: true }),
    }),
  );
  const r = await collectIndexedReport("old/name", {
    now,
    read: async (path) => (path.startsWith("/repos/") ? meta : page([])),
  });
  assert.equal(r.repository, "org/repo");
});
test("missing author ID cannot silently become human or unknown", async () => {
  const p = page([row(1)]);
  delete (p.data.search.nodes[0].author as { databaseId?: number }).databaseId;
  await assert.rejects(
    collectIndexedReport("org/repo", {
      now,
      read: async (path) => (path.startsWith("/repos/") ? meta : p),
    }),
  );
});
test("page cap, stalled pagination, duplicates and count mismatch fail closed", async () => {
  for (const result of [
    page([row(1)], 2, true),
    page([], 1, true),
    page([row(1), row(1)]),
    page([row(1)], 2),
  ])
    await assert.rejects(
      collectIndexedReport("org/repo", {
        now,
        maxPages: 1,
        read: async (path) => (path.startsWith("/repos/") ? meta : result),
      }),
    );
});
test("partial GraphQL failure and out-of-scope PR reject a page", async () => {
  await assert.rejects(
    collectIndexedReport("org/repo", {
      now,
      read: async (path) =>
        path.startsWith("/repos/")
          ? meta
          : { ...page([row(1)]), errors: [{ message: "Partial failure" }] },
    }),
  );
  await assert.rejects(
    collectIndexedReport("org/repo", {
      now,
      read: async (path) =>
        path.startsWith("/repos/")
          ? meta
          : page([row(1, now - 100 * 86400000)]),
    }),
  );
});
test("collector uses a single inclusive merge range; repeated merge qualifiers are forbidden", async () => {
  await collectIndexedReport("org/repo", {
    now,
    read: async (path, body) => {
      if (path.startsWith("/repos/")) return meta;
      const q = (body as { variables: { query: string } }).variables.query;
      assert.equal((q.match(/merged:/g) ?? []).length, 1);
      assert.match(
        q,
        /merged:2026-07-09T12:00:00\+00:00\.\.2026-10-07T12:00:00\+00:00/,
      );
      return page([]);
    },
  });
});
