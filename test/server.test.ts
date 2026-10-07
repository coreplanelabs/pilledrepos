import test from "node:test";
import assert from "node:assert/strict";
import { buildReport } from "../src/core.js";
import { createHandler, type ServerOptions, type Store } from "../server/http.js";
import { pageHtml, safeJson } from "../server/html.js";
import { ogSvg, reportCard } from "../server/og.js";
const NOW = Date.parse("2026-10-06T12:00:00Z");
const template = `<html lang="en-US"><head><title>Home</title><meta name="description" content=""><link id="canonical" href=""><meta id="og-title" content=""><meta id="og-description" content=""><meta id="og-url" content=""><meta id="og-image" content=""><meta id="twitter-image" content=""></head><body><section id="result" class="result" aria-labelledby="result-title" hidden><h2 id="result-title"></h2><p id="repo-description"></p><p id="repo-hook"></p><p id="summary"></p><section id="standings"></section><div id="awards"></div></section><script id="repo-data" type="application/json">null</script></body></html>`;
function fixture() { return buildReport({ repository: "test/repo", now: NOW, description: '</script><img src=x onerror="bad()">', closed: [], details: [], open: [], notes: [], requests: 0, contributingUrl: null, openKnown: true, periodComplete: true, detailRequested: 0 }); }
function setup(fetcher?: typeof fetch) {
  const data = new Map<string, string>(), calls: string[] = [];
  const store: Store = { async get(key) { return data.get(key) ?? null; }, async put(key, value) { data.set(key, value); } };
  const options: ServerOptions = { assets: { async fetch(request) { return new URL(request.url).pathname === "/index.html" ? new Response(template) : new Response("Not found", { status: 404 }); } }, store,
    fetch: fetcher ?? (async input => { calls.push(String(input)); throw new Error("No network expected"); }), now: () => NOW,
    png: async () => new Uint8Array([137, 80, 78, 71]), deadline: () => new AbortController().signal };
  return { data, calls, options };
}
test("server renders canonical metadata, real results, and escaped bootstrap before JS", () => {
  const result = fixture(), html = pageHtml(template, "https://repolore.fun", result);
  assert.match(html, /href="https:\/\/repolore.fun\/test\/repo"/);
  assert.match(html, /_og\/test\/repo.png\?v=/);
  assert.match(html, /application\/ld\+json/); assert.ok(html.includes("No winner this round"));
  assert.ok(!html.includes('</script><img src=x')); assert.ok(safeJson(result).includes("\\u003c"));
});
test("a cached repo path and its versioned OG image need no GitHub reads", async () => {
  const { data, options, calls } = setup(), result = fixture(), body = JSON.stringify(result);
  data.set("repo:test/repo", body); data.set(`snapshot:test/repo:${NOW}`, body);
  const handler = createHandler(options);
  assert.equal((await handler(new Request("https://repolore.fun/test/repo"))).status, 200);
  const image = await handler(new Request(`https://repolore.fun/_og/test/repo.png?v=${NOW}`));
  assert.equal(image.headers.get("Content-Type"), "image/png"); assert.equal(image.status, 200); assert.deepEqual(calls, []);
});
test("legacy query URLs redirect to the clean path; unknown paths and methods stay closed", async () => {
  const { options } = setup(), handler = createHandler(options);
  const moved = await handler(new Request("https://repolore.fun/?repo=test%2Frepo&awards=delete"));
  assert.equal(moved.status, 301); assert.equal(moved.headers.get("Location"), "/test/repo");
  assert.equal((await handler(new Request("https://repolore.fun/other/path/extra"))).status, 404);
  assert.equal((await handler(new Request("https://repolore.fun/", { method: "POST" }))).status, 405);
});
test("server credentials remain on GitHub API requests and never reach the browser or cache", async () => {
  const { data, options } = setup((async (input, init) => {
    const url = String(input); assert.ok(url.startsWith("https://api.github.com/repos/test/repo") || url === "https://api.github.com/graphql");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-secret");
    if (url.endsWith("/test/repo")) return new Response(JSON.stringify({ private: false, full_name: "test/repo", description: "", owner: { id: 42, login: "owner", type: "User" }, stargazers_count: 2, forks_count: 1, language: "TypeScript" }));
    if (url === "https://api.github.com/graphql") return new Response(JSON.stringify({data:{repository:{isPrivate:false,nameWithOwner:"test/repo",merged:{nodes:[],pageInfo:{hasNextPage:false}},oldest:{nodes:[]}},discussed:{nodes:[]}}}));
    return new Response(JSON.stringify([]));
  }) as typeof fetch);
  options.githubToken = "test-secret";
  const response = await createHandler(options)(new Request("https://repolore.fun/api/repos/test/repo"));
  assert.equal(response.status, 200); assert.ok(!(await response.text()).includes("test-secret"));
  assert.ok([...data.values()].every(value => !value.includes("test-secret")));
});
test("an authenticated private-repo read cannot become a cached public snapshot", async () => {
  let calls = 0;
  const { data, options } = setup((async () => { calls++; return new Response(JSON.stringify({ private: true, full_name: "test/repo" })); }) as typeof fetch);
  options.githubToken = "test-secret";
  const response = await createHandler(options)(new Request("https://repolore.fun/api/repos/test/repo"));
  assert.equal(response.status, 404); assert.equal(calls, 1); assert.equal(data.size, 0);
});
test("avatar proxy accepts only bounded numeric identities and does not forward the token", async () => {
  const { options } = setup((async (input, init) => { assert.equal(String(input), "https://avatars.githubusercontent.com/u/42?s=160&v=4"); assert.equal(new Headers(init?.headers).get("Authorization"), null); return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/png" } }); }) as typeof fetch);
  options.githubToken = "test-secret"; const handler = createHandler(options);
  assert.equal((await handler(new Request("https://repolore.fun/_avatar/https%3A%2F%2Fevil.test"))).status, 404);
  assert.equal((await handler(new Request("https://repolore.fun/_avatar/u/42?size=9000"))).status, 404);
  assert.equal((await handler(new Request("https://repolore.fun/_avatar/u/42"))).status, 200);
});
test("OG model has standard dimensions, repo identity, and no supporter logo", () => {
  const svg = ogSvg(reportCard(fixture()), new Map());
  assert.match(svg, /width="1200" height="630"/); assert.match(svg, /test\/repo/);
  assert.ok(!svg.includes("polylane")); assert.ok(!svg.includes("<filter"));
});
test("moved repositories redirect using the validated canonical identity", async () => {
  const { options } = setup((async () => new Response(JSON.stringify({ private: false, full_name: "new/repo", description: "" }))) as typeof fetch);
  const response = await createHandler(options)(new Request("https://repolore.fun/api/repos/test/repo"));
  assert.equal(response.status, 301); assert.equal(response.headers.get("Location"), "/api/repos/new/repo");
});
test("an expired OG version cannot quietly use a different current snapshot", async () => {
  const { data, options, calls } = setup(); data.set("repo:test/repo", JSON.stringify(fixture()));
  const response = await createHandler(options)(new Request(`https://repolore.fun/_og/test/repo.png?v=${NOW - 1000}`));
  assert.equal(response.status, 404); assert.deepEqual(calls, []);
});
test("repeated previews rasterize once and keep the same source snapshot", async () => {
  const { data, options } = setup(); data.set("repo:test/repo", JSON.stringify(fixture())); let renders = 0;
  options.png = async () => { renders++; return new Uint8Array([137, 80, 78, 71]); };
  const handler = createHandler(options);
  for (let i = 0; i < 2; i++) assert.equal((await handler(new Request("https://repolore.fun/_og/test/repo.png"))).status, 200);
  assert.equal(renders, 1);
});
test("every leaderboard's declared OG path returns a PNG", async () => {
  const { options } = setup(), handler = createHandler(options);
  for (const category of ["merge", "delete", "comments", "cast", "oldest", "fast", "bots"]) {
    const response = await handler(new Request(`https://repolore.fun/_og/leaderboards/${category}.png`));
    assert.equal(response.status, 200, category); assert.equal(response.headers.get("Content-Type"), "image/png");
  }
});
import { parsePull } from "../src/core.js";
test("SPA leaderboard API and home suggestions use saved Trending facts, with suggestions ranked by Merge Machine", async () => {
  const { data, options, calls } = setup();
  const examples = [ ['large/repo', 9, 0], ['first/repo', 5, 4], ['second/repo', 3, 8], ['third/repo', 4, 2] ] as const;
  data.set('index:catalog', JSON.stringify({ selected: examples.map(row => row[0]), discoveredAt: new Date(NOW).toISOString(), cursor: 0 }));
  for (const [repository, merges, added] of examples) {
    const closed = Array.from({ length: merges }, (_, i) => parsePull({ number: i + 1, title: 'Change', user: { id: 1, login: 'author', type: 'User' }, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-05T00:00:00Z', merged_at: '2026-10-05T00:00:00Z', draft: false, head: { sha: 'a'.repeat(40) } }, repository));
    const report = buildReport({ repository, description: '', now: NOW, closed, details: [], open: [], notes: [], requests: 0, contributingUrl: null, periodComplete: true, openKnown: true, detailRequested: 0 });
    data.set(`repo:${repository}`, JSON.stringify(report));
    data.set(`stars:${repository}`, JSON.stringify({ capturedAt: new Date(NOW).toISOString(), days: [{ day: '2026-10-05', added }] }));
  }
  const handler = createHandler(options);
  const home = await (await handler(new Request('https://repolore.fun/api/home'))).json() as { suggestions: { repository: string }[] };
  assert.deepEqual(home.suggestions.map(row => row.repository), ['first/repo', 'third/repo', 'second/repo']);
  const board = await (await handler(new Request('https://repolore.fun/api/leaderboards/merge'))).json() as { category: string; cohort: string; rows: { repository: string }[] };
  assert.equal(board.category, 'merge'); assert.equal(board.cohort, 'trending'); assert.equal(board.rows.length, 3);
  assert.deepEqual(calls, []);
});
