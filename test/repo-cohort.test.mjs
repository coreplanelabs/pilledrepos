import { test } from "node:test";
import assert from "node:assert/strict";
import { selectTopRepos, isSeedRepo } from "../scripts/repo-cohort.mjs";
test("star partitions reach beyond the search cap without requiring AI config files", async () => {
  const items = Array.from({ length: 1500 }, (_, i) => ({
    id: i + 1,
    full_name:
      i === 0
        ? "kubernetes/kubernetes"
        : i === 1
          ? "PostHog/posthog"
          : `org/repo-${i}`,
    private: false,
    fork: false,
    archived: false,
    disabled: false,
    language: "Go",
    stargazers_count: 4000 - i,
  }));
  let calls = 0;
  const search = async (q, page) => {
    calls++;
    const band = /stars:(\d+)\.\.(\d+)/.exec(q);
    const filtered = band
      ? items.filter(
          (r) =>
            r.stargazers_count >= +band[1] && r.stargazers_count <= +band[2],
        )
      : items;
    return {
      total_count: filtered.length,
      incomplete_results: false,
      items: filtered.slice((page - 1) * 100, page * 100),
    };
  };
  const rows = await selectTopRepos(search, {
    count: 1100,
    since: "2026-07-10",
  });
  assert.equal(rows.length, 1100);
  assert.equal(new Set(rows.map((r) => r.id)).size, 1100);
  assert.equal(rows[0].full_name, "kubernetes/kubernetes");
  assert.equal(rows[1].full_name, "PostHog/posthog");
  assert.equal(rows.at(-1).stargazers_count, 2901);
  assert.ok(calls > 10);
});
test("small lists, forks, archives, and insufficient pools cannot replace the seed", async () => {
  const r = {
    id: 1,
    full_name: "org/app",
    private: false,
    fork: false,
    archived: false,
    language: "TypeScript",
    stargazers_count: 500,
  };
  assert.equal(isSeedRepo(r), true);
  for (const extra of [
    { fork: true },
    { archived: true },
    { private: true },
    { language: null },
    { full_name: "org/awesome-tools" },
  ])
    assert.equal(isSeedRepo({ ...r, ...extra }), false);
  await assert.rejects(
    selectTopRepos(
      async () => ({ items: [r], total_count: 1, incomplete_results: false }),
      { count: 2, since: "2026-07-10" },
    ),
    /previous seed preserved/,
  );
});
