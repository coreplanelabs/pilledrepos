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
test("repo descriptions render GitHub emoji aliases while escaping markup and preserving unknown names", async () => {
  const r = report();
  r.description = ":hedgehog: Ship :rocket: :octocat: :constructor: <script>bad</script>";
  const response = await handler({ ...dataset, reports: [r] })(req("/org/repo"));
  const s = await response.text();
  assert.match(s, /class="description">🦔 Ship 🚀/);
  assert.match(s, /class="github-emoji"[^>]*alt=":octocat:"/);
  assert.match(s, /:constructor: &lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(s, /<script>bad<\/script>/);
  assert.match(response.headers.get("Content-Security-Policy")!, /https:\/\/github\.githubassets\.com/);
});
test("write endpoints require a same-origin JSON request", async () => {
  assert.equal((await handler()(req("/api/repos", "POST"))).status, 403);
  assert.equal((await handler()(req("/", "POST"))).status, 405);
});
test("small complete windows get a rank without invented history", async () => {
  const s = await (
    await handler({ ...dataset, reports: [report(1, 1)] })(req("/org/repo"))
  ).text();
  assert.match(s, /class="ranking"[^>]*>#1/);
  assert.doesNotMatch(s, /Unranked|unranked/);
  assert.doesNotMatch(s, /<h2>Over time/);
});
test("repo details omit historical sections even when daily reads exist", async () => {
  const s = await (
    await handler({
      ...dataset,
      history: {
        "org/repo": ["2026-10-06T12:00:00Z", "2026-10-07T12:00:00Z"].map(
          (capturedAt) => ({
            capturedAt,
            ai: 27,
            total: 100,
            registryId: "digest",
            classificationId: "ids",
            collector: "merged-window-v2" as const,
          }),
        ),
      },
    })(req("/org/repo"))
  ).text();
  assert.match(s, /27%<\/strong><span>Merged PRs by AI agents/);
  assert.match(s, /<h2>Agents<\/h2>/);
  assert.doesNotMatch(s, /Over time|class="history"/);
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
    assert.equal(first.total, 71);
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
      sort === "asc" ? "org/repo-0" : "org/small-window",
    );
    const home = await (await h(req(`/?sort=${sort}`))).text();
    assert.match(
      home,
      new RegExp(`aria-sort="${sort === "asc" ? "ascending" : "descending"}"`),
    );
    assert.match(home, new RegExp(`data-sort="${sort}"`));
    assert.match(home, /data-offset/);
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
test("only the leader gets a motif and detail ranks drive the top-ten celebration", async () => {
  const h = handler({
    ...dataset,
    reports: Array.from({ length: 12 }, (_, i) =>
      report(100, 80 - i, `org/r${i + 1}`),
    ),
  });
  const home = await (await h(req("/"))).text();
  assert.equal((home.match(/class="leader-row"/g) ?? []).length, 1);
  const leader = await (await h(req("/org/r1"))).text();
  assert.match(leader, /class="repo-result leader-repo"[^>]*data-rank="1"/);
  const tenth = await (await h(req("/org/r10"))).text();
  assert.match(tenth, /data-rank="10"/);
  assert.doesNotMatch(tenth, /leader-repo/);
  const eleventh = await (await h(req("/org/r11"))).text();
  assert.match(eleventh, /data-rank="11"/);
  assert.equal(await (await h(req("/confetti.js"))).text(), "asset");
});
test("all complete nonempty tracked repos rank without a percentage or row cap", async () => {
  const h = handler({
    ...dataset,
    reports: [
      ...Array.from({ length: 120 }, (_, i) =>
        report(200, 120 - i, `org/r${i + 1}`),
      ),
      report(100, 0, "kubernetes/kubernetes"),
      report(1, 0, "org/submitted"),
      report(0, 0, "org/empty"),
    ],
  });
  const rows = await (
    await h(req("/api/leaderboard?sort=asc&limit=100"))
  ).json();
  assert.equal(rows.total, 122);
  assert.equal(rows.rows[0].repository, "kubernetes/kubernetes");
  assert.equal(rows.nextOffset, 100);
  const tail = await (await h(req("/api/leaderboard?offset=100"))).json();
  assert.equal(tail.rows.length, 22);
  assert.ok(tail.rows.every((r: { rank: number }) => Number.isInteger(r.rank)));
  const small = await (await h(req("/org/submitted"))).text();
  assert.match(small, /class="ranking"/);
  assert.doesNotMatch(small, /Unranked/);
  const home = await (await h(req("/"))).text();
  assert.doesNotMatch(home, /repo-filter|list-controls/);
  assert.match(home, /e.g. usestrix\/strix/);
  const badge = /class="ranking" href="([^"]+)"/.exec(
    await (await h(req("/org/r101"))).text(),
  )![1];
  const anchor = new URL(badge, "http://localhost");
  const landing = await (await h(req(anchor.pathname + anchor.search))).text();
  assert.match(
    landing,
    new RegExp(`id="${anchor.hash.slice(1)}"[^>]*data-href="/org/r101"`),
  );
});
