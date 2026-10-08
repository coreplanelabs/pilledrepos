import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler, type Dataset } from "../server/http.js";
import { registry, report } from "./fixtures.js";
import { ogSvg } from "../server/og.js";
import { aiPage } from "../src/ai.js";
const dataset: Dataset = {
  reports: [report(), report(100, 10, "other/repo")],
  registry,
  registryId: "digest",
  classificationId: "ids",
  history: {},
  pool: "ICP seed",
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
test("detail headline is concise while count and scope remain visible", async () => {
  const s = await (await handler()(req("/org/repo"))).text();
  assert.match(s, /27%<\/strong><span>Merged PRs by AI agents/);
  assert.match(s, /27 \/ 100 merged PRs/);
  assert.doesNotMatch(
    s,
    /Copy repo link|Public GitHub repository|Compare repos|view sources|User accounts may/,
  );
  assert.match(s, /id="refresh"/);
  assert.match(s, /data-timestamp/);
  assert.match(s, /class="repo-identity"><a/);
});
test("old list pages redirect to the home page and the public registry page is gone", async () => {
  const h = handler();
  for (const path of ["/leaderboard", "/leaderboard/top-100"])
    assert.equal((await h(req(path))).headers.get("Location"), "/");
  assert.equal((await h(req("/registry"))).status, 404);
});
test("home provides paged rows without beta, extra copy, or a second list route", async () => {
  const s = await (await handler()(req("/"))).text();
  assert.match(s, /repo-rows/);
  assert.doesNotMatch(
    s,
    /BETA|Count known AI|IDs, not guesses|Ranked by share|View leaderboard/,
  );
  assert.match(s, /viewBox="0 0 496 512"/);
  assert.match(s, /theme-picker/);
});
test("pagination is bounded and refuses to mix different snapshot versions", async () => {
  const h = handler(),
    first = JSON.parse(await (await h(req("/api/leaderboard?limit=1"))).text());
  assert.equal(first.rows.length, 1);
  assert.equal(first.nextOffset, 1);
  const next = JSON.parse(
    await (
      await h(
        req(
          "/api/leaderboard?limit=1&offset=1&v=" +
            encodeURIComponent(first.version),
        ),
      )
    ).text(),
  );
  assert.equal(next.rows[0].repository, "other/repo");
  assert.equal(next.nextOffset, null);
  assert.equal((await h(req("/api/leaderboard?v=wrong"))).status, 409);
  assert.equal((await h(req("/api/leaderboard?limit=10000"))).status, 400);
});
test("untrusted repo descriptions are escaped and canonical URLs omit query parameters", async () => {
  const r = report();
  r.description = "<script>alert(1)</script>";
  const s = await (
    await handler({ ...dataset, reports: [r] })(
      req("/org/repo?compare=anything"),
    )
  ).text();
  assert.match(s, /&lt;script&gt;/);
  assert.doesNotMatch(s, /<script>alert/);
  assert.match(
    s,
    /<link rel="canonical" href="http:\/\/localhost:4189\/org\/repo">/,
  );
});
test("write endpoints require a same-origin JSON request", async () => {
  assert.equal((await handler()(req("/api/repos", "POST"))).status, 403);
  assert.equal((await handler()(req("/", "POST"))).status, 405);
});
test("small windows remain unranked and no empty history claims movement", async () => {
  const s = await (
    await handler({ ...dataset, reports: [report(1, 1)] })(req("/org/repo"))
  ).text();
  assert.match(s, /small window · unranked/);
  assert.doesNotMatch(s, /<h2>Over time/);
});
test("HEAD has no body and OG output remains 1200 by 630", async () => {
  assert.equal(await (await handler()(req("/org/repo", "HEAD"))).text(), "");
  const s = ogSvg(aiPage(report(), registry), 1, 2);
  assert.match(s, /width="1200" height="630"/);
  assert.match(s, /27 \/ 100/);
});
test("sorting covers the full leaderboard before pagination and keeps ranks while sorting", async () => {
  const h = handler({
    ...dataset,
    reports: [
      ...Array.from({ length: 70 }, (_, i) => report(100, i, `org/repo-${i}`)),
      report(2, 2, "org/small-window"),
      report(0, 0, "org/no-merges"),
    ],
  });
  for (const sort of ["asc", "desc"]) {
    const first = await (
      await h(req(`/api/leaderboard?sort=${sort}&limit=30`))
    ).json();
    const next = await (
      await h(
        req(
          `/api/leaderboard?sort=${sort}&limit=30&offset=30&v=${first.version}`,
        ),
      )
    ).json();
    assert.equal(first.total, 70);
    const shares = [...first.rows, ...next.rows].map(
      (r: { analysis: { share: number } }) => r.analysis.share,
    );
    assert.ok(
      shares.every(
        (s, i) =>
          !i || (sort === "asc" ? s >= shares[i - 1] : s <= shares[i - 1]),
      ),
    );
    assert.equal(
      first.rows[0].repository,
      sort === "asc" ? "org/repo-0" : "org/repo-69",
    );
    const home = await (await h(req(`/?sort=${sort}`))).text();
    assert.match(
      home,
      new RegExp(`aria-sort="${sort === "asc" ? "ascending" : "descending"}"`),
    );
    assert.match(home, new RegExp(`data-sort="${sort}"`));
    assert.doesNotMatch(home, /org\/small-window|org\/no-merges/);
  }
  assert.equal((await h(req("/api/leaderboard?sort=wrong"))).status, 400);
  const tie = handler({
    ...dataset,
    reports: [report(100, 10, "org/a"), report(200, 20, "org/b")],
  });
  const rows = await (await tie(req("/api/leaderboard?sort=asc"))).json();
  assert.deepEqual(
    rows.rows.map((r: { rank: number }) => r.rank),
    [1, 2],
  );
});
