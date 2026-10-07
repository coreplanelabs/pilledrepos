import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, parseDetail } from "../src/core.js";
import { contributors, leaderboard, repositoryFromPath, repositoryPath } from "../src/catalog.js";
import { cardsMarkup, castFaces } from "../src/view.js";
const now = Date.parse("2026-10-06T12:00:00Z");
function report(repository: string, deletions: number) {
  const pr = parseDetail({ number: 1, title: '<script>alert("x")</script>', user: { id: 42, login: "person", type: "User", avatar_url: "https://evil.test/photo" }, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-06T00:00:00Z", merged_at: "2026-10-06T00:00:00Z", draft: false, head: { sha: "a".repeat(40) }, additions: 9, deletions, review_comments: 2 }, repository);
  return buildReport({ repository, now, description: "", closed: [pr], details: [pr], open: [], periodComplete: true, openKnown: true, detailRequested: 1, notes: [], requests: 1, contributingUrl: null });
}
test("canonical repo paths reject hidden slashes and reserve known board routes", () => {
  assert.equal(repositoryPath("vitejs/vite"), "/vitejs/vite");
  assert.equal(repositoryFromPath("/owner/.github"), "owner/.github");
  for (const path of ["/owner/repo/extra", "/owner%2fother/repo", "/owner/%5csecret", "/leaderboards/delete"]) assert.equal(repositoryFromPath(path), null);
});
test("cross-repo deletion ranks one verified PR rather than parsing display prose", () => {
  const small = report("one/repo", 50), big = report("two/repo", 500);
  small.awards[1].value = "999,999 pretend lines";
  const rows = leaderboard([small, big], "delete");
  assert.deepEqual(rows.map(row => row.repository), ["two/repo", "one/repo"]);
  assert.equal(rows[0].score, 500); assert.equal(rows[0].source, "https://github.com/two/repo/pull/1");
  assert.equal(rows[0].inspected, 1);
});
test("photos come from numeric GitHub identities and PR prose stays escaped", () => {
  const result = report("one/repo", 50), markup = cardsMarkup(result);
  assert.ok(markup.includes('/_avatar/u/42?size=160')); assert.ok(!markup.includes("evil.test"));
  assert.ok(markup.includes("&lt;script&gt;")); assert.ok(!markup.includes('<script>alert'));
  assert.ok(!markup.includes("Share"));
});
test("cast overlap and rest count use distinct observed author accounts", () => {
  const result = report("one/repo", 50), pr = result.facts.closed[0];
  result.facts.closed = Array.from({ length: 6 }, (_, index) => ({ ...pr, number: index + 1, author: { id: index + 1, login: `person${index}`, bot: index === 5 } }));
  result.coverage.mergedObserved = 6;
  assert.equal(contributors(result).length, 6);
  const faces = castFaces(result); assert.equal((faces.match(/<img /g) ?? []).length, 3); assert.match(faces, />\+3</);
});
