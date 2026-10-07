import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAi,
  aiLeaderboard,
  aiSummary,
  aiPage,
  parseRegistry,
  parseReport,
  botCandidates,
  comparableHistory,
} from "../src/ai.js";
import { registry, report, pull, now } from "./fixtures.js";
test("stable ID wins over display login or bot flag; lookalike names do not count", () => {
  const r = report(0);
  r.facts.closed = [
    pull(1, 198982749, false, "renamed"),
    pull(2, 4, true, "Copilot"),
    pull(3, 5, false, "claude[bot]"),
  ];
  assert.deepEqual(
    [
      analyzeAi(r, registry).ai,
      analyzeAi(r, registry).automation,
      analyzeAi(r, registry).accounts,
    ],
    [1, 1, 1],
  );
});
test("other bots, user accounts and missing authors have neutral counts", () => {
  const r = report(0);
  r.facts.closed = [
    pull(1, 2, true, "dependabot[bot]"),
    pull(2, 3, true, "github-actions[bot]"),
    pull(3, 4, true, "copybara"),
    pull(4, 5, true, "release-bot"),
    pull(5),
    { ...pull(6), author: null },
  ];
  const a = analyzeAi(r, registry);
  assert.deepEqual(
    [a.ai, a.automation, a.accounts, a.unknown, a.total],
    [0, 4, 1, 1, 6],
  );
  assert.equal(a.share, 0);
});
test("denominator includes bots and unknowns; evidence stays attached", () => {
  const r = report(0);
  r.facts.closed = [
    pull(1, 198982749, true),
    pull(2, 4, true),
    pull(3),
    { ...pull(4), author: null },
  ];
  const a = analyzeAi(r, registry);
  assert.equal(a.share, 25);
  assert.equal(
    a.agents[0].evidence[0].url,
    "https://github.com/org/repo/pull/1",
  );
});
test("Codex identities aggregate into one mix entry", () => {
  const r = report(0);
  r.facts.closed = [pull(1, 199175422, true), pull(2, 242516109, true)];
  const a = analyzeAi(r, registry);
  assert.equal(a.agents.length, 1);
  assert.equal(a.agents[0].identities.length, 2);
  assert.equal(a.agents[0].count, 2);
});
test("only merges inside inclusive 90-day boundary count; duplicate cannot inflate", () => {
  const r = report(0),
    p = pull(1);
  r.facts.closed = [
    p,
    p,
    { ...pull(2), mergedAt: now - 90 * 86400000 },
    { ...pull(3), mergedAt: now - 90 * 86400000 - 1 },
    { ...pull(4), mergedAt: null },
    { ...pull(5), mergedAt: now + 1 },
  ];
  assert.equal(analyzeAi(r, registry).total, 2);
});
test("zero and small samples have no eligible score", () => {
  assert.equal(analyzeAi(report(0), registry).share, null);
  assert.equal(analyzeAi(report(99), registry).eligible, false);
  assert.equal(analyzeAi(report(100), registry).eligible, true);
});
test("legacy and incomplete reads never rank despite large samples", () => {
  const legacy = { ...report(), collector: "legacy-preview" as const },
    r = report();
  r.coverage.periodComplete = false;
  assert.equal(aiLeaderboard([legacy, r], registry).length, 0);
  assert.match(aiSummary(aiPage(legacy, registry)), /observed/);
});
test("share ranking uses denominator, ties share rank, and pool is explicit", () => {
  const rows = aiLeaderboard(
    [
      report(100, 50, "a/one"),
      report(200, 100, "b/two"),
      report(100, 10, "c/three"),
    ],
    registry,
  );
  assert.deepEqual(
    rows.map((r) => r.rank),
    [1, 1, 3],
  );
});
test("registry rejects duplicate IDs and insecure evidence", () => {
  assert.throws(() =>
    parseRegistry({
      ...registry,
      agents: [registry.agents[0], registry.agents[0]],
    }),
  );
  assert.throws(() =>
    parseRegistry({
      ...registry,
      agents: [{ ...registry.agents[0], source: "javascript:alert(1)" }],
    }),
  );
});
test("capture validation rejects duplicate PRs and foreign evidence", () => {
  const r = report();
  assert.throws(() =>
    parseReport({
      ...r,
      facts: { closed: [r.facts.closed[0], r.facts.closed[0]] },
    }),
  );
  assert.throws(() =>
    parseReport({
      ...r,
      facts: { closed: [{ ...r.facts.closed[0], url: "https://evil.test" }] },
    }),
  );
});
test("unverified AI-looking bot stays in neutral candidate list", () => {
  const r = report(0);
  r.facts.closed = [
    pull(1, 42, true, "super-ai-agent"),
    pull(2, 198982749, true),
  ];
  assert.deepEqual(botCandidates([r], registry), [
    { id: 42, login: "super-ai-agent", merges: 1 },
  ]);
  assert.equal(analyzeAi(r, registry).ai, 1);
});
test("history requires real complete reads with matching account classification", () => {
  const point = {
    capturedAt: new Date(now).toISOString(),
    ai: 27,
    total: 100,
    registryId: "evidence-v1",
    classificationId: "identities-v1",
    collector: "merged-window-v2" as const,
  };
  assert.equal(
    comparableHistory(
      [point, { ...point, classificationId: "other" }, { ...point, total: 20 }],
      "identities-v1",
    ).length,
    1,
  );
});
test("a very small positive AI share cannot round to a false zero", () => {
  const r = report(10000, 1);
  assert.match(aiSummary(aiPage(r, registry)), /<0\.1%/);
});
