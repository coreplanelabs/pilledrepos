import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler, type Dataset } from "../server/http.js";
import { ogSvg } from "../server/og.js";
import { aiPage } from "../src/ai.js";
import { registry, report } from "./fixtures.js";
const dataset: Dataset = {
  reports: [report(), report(100, 10, "other/repo")],
  registry,
  registryId: "digest",
  classificationId: "ids",
  history: {},
  pool: "Selected public repos",
  capturedAt: report().capturedAt,
  complete: true,
};
function handler(d = dataset) {
  return createHandler({
    dataset: async () => d,
    assets: async () => new Response("asset"),
    png: async (s) => new TextEncoder().encode(s),
  });
}
const req = (path: string, method = "GET") =>
  new Request("http://localhost:4189" + path, { method });
test("normal owner/repo URL carries the share sentence and canonical OG metadata", async () => {
  const r = await handler()(req("/org/repo"));
  const s = await r.text();
  assert.match(s, /27% of this repo’s merged PRs/);
  assert.match(
    s,
    /<link rel="canonical" href="http:\/\/localhost:4189\/org\/repo">/,
  );
  assert.match(s, /1200/);
  assert.match(s, /User accounts/);
  assert.doesNotMatch(s, /Merge Machine|award|human-written PRs/);
});
test("lookup and case aliases redirect to canonical URL", async () => {
  const h = handler();
  assert.equal(
    (await h(req("/?repo=org%2Frepo"))).headers.get("Location"),
    "/org/repo",
  );
  assert.equal(
    (await h(req("/ORG/REPO"))).headers.get("Location"),
    "/org/repo",
  );
});
test("comparison stays on canonical normal URL and shows both denominators", async () => {
  const s = await (
    await handler()(req("/org/repo?compare=other%2Frepo"))
  ).text();
  assert.match(s, /other\/repo/);
  assert.match(s, /10 \/ 100 merged PRs/);
  assert.doesNotMatch(s, /<link rel="canonical"[^>]+compare/);
});
test("legacy preview cannot supply ranking or claim repo-wide share", async () => {
  const d = {
    ...dataset,
    complete: false,
    reports: [{ ...report(), collector: "legacy-preview" as const }],
  };
  const h = handler(d),
    s = await (await h(req("/org/repo"))).text();
  assert.match(s, /Legacy preview/);
  assert.match(s, /Unranked/);
  assert.match(s, /observed merged PRs/);
  assert.deepEqual(
    JSON.parse(await (await h(req("/api/leaderboard"))).text()).rows,
    [],
  );
});
test("missing history never invents movement", async () => {
  const s = await (await handler()(req("/org/repo"))).text();
  assert.doesNotMatch(s, /<h2>Change over time<\/h2>/);
  assert.doesNotMatch(s, /Up [0-9]|Down [0-9]/);
});
test("untrusted titles and descriptions are escaped", async () => {
  const r = report();
  r.description = "<script>alert(1)</script>";
  const d = { ...dataset, reports: [r] };
  const s = await (await handler(d)(req("/org/repo"))).text();
  assert.match(s, /&lt;script&gt;/);
  assert.doesNotMatch(s, /<script>alert/);
});
test("HEAD has no body, methods are constrained and security headers exist", async () => {
  const h = handler(),
    r = await h(req("/org/repo", "HEAD"));
  assert.equal(await r.text(), "");
  assert.equal(r.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal((await h(req("/org/repo", "POST"))).status, 405);
});
test("OG includes count, scope and agent limits at 1200x630", () => {
  const s = ogSvg(aiPage(report(), registry), 1, 2);
  assert.match(s, /width="1200" height="630"/);
  assert.match(s, /27 \/ 100/);
  assert.match(s, /#1 of 2 eligible/);
  assert.match(s, /not all AI use/);
});
test("an incomplete capture uses observed-sample copy and has no rank", async () => {
  const r = report();
  r.coverage.periodComplete = false;
  const s = await (
    await handler({ ...dataset, reports: [r] })(req("/org/repo"))
  ).text();
  assert.match(s, /observed merged PRs/);
  assert.match(s, /Incomplete read/);
  assert.match(s, /Unranked/);
});
test("normal repo page compares with the actual #1 ranked repo by default", async () => {
  const h = handler({
    ...dataset,
    reports: [report(100, 10, "low/repo"), report(200, 100, "leader/repo")],
  });
  const html = await (await h(req("/low/repo"))).text();
  assert.match(html, /Against the #1 repo on the leaderboard/);
  assert.match(html, /leader\/repo/);
  assert.match(html, /100 \/ 200 merged PRs/);
  assert.doesNotMatch(html, /<h2>PR evidence<\/h2>|up to six/);
});
test("leader page avoids comparing itself twice and allows a custom comparison", async () => {
  const html = await (await handler()(req("/org/repo"))).text();
  assert.match(html, /This repo leads the leaderboard/);
  assert.match(html, /comparison-pair single/);
  assert.match(html, /Compare with another repo/);
  const chosen = await (
    await handler()(req("/org/repo?compare=other%2Frepo"))
  ).text();
  assert.match(chosen, /comparison-pair"/);
  assert.match(chosen, /other\/repo/);
});
test("header and footer use Polylane styling, accessible theme buttons, and attribution", async () => {
  const html = await (await handler()(req("/org/repo"))).text();
  assert.match(html, /class="masthead"/);
  assert.match(html, /Built for fun by/);
  assert.match(html, /polylane.com/);
  assert.match(html, /data-theme-choice="system"[^>]*aria-label="System"/);
  assert.doesNotMatch(html, /<select/);
  assert.match(html, /Jul 9 – Oct 7, 2026/);
  assert.doesNotMatch(html, />2026-10-07</);
});
test("a custom public repo outside the index is read on demand and stays outside pool ranks", async () => {
  let requested = "";
  const h = createHandler({
    dataset: async () => dataset,
    assets: async () => new Response("asset"),
    png: async () => new Uint8Array(),
    onDemand: async (repo) => {
      requested = repo;
      return report(100, 50, "outside/repo");
    },
  });
  const s = await (await h(req("/org/repo?compare=outside%2Frepo"))).text();
  assert.equal(requested, "outside/repo");
  assert.match(s, /Comparison repo/);
  assert.match(s, /50 \/ 100 merged PRs/);
  const board = JSON.parse(await (await h(req("/api/leaderboard"))).text());
  assert.equal(board.rows.length, 2);
});
test("small custom comparison windows show counts and an unranked label", async () => {
  const h = handler({
    ...dataset,
    reports: [report(), report(1, 1, "small/repo")],
  });
  const s = await (await h(req("/org/repo?compare=small%2Frepo"))).text();
  assert.match(s, /1 \/ 1 merged PRs/);
  assert.match(s, /Small window · unranked/);
});
