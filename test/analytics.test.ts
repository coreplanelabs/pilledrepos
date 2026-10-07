import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, parsePull } from "../src/core.js";
import { activity, appendPoint, splitMerges, starGrowth } from "../src/analytics.js";
import { refreshIndex, readCatalog } from "../server/indexing.js";
const now = Date.parse("2026-10-06T12:00:00Z");
function fixture() {
  const rows = [1, 2].map(id => parsePull({ number: id, title: "change", user: { id, login: `author${id}`, type: id === 2 ? "Bot" : "User" }, created_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-06T00:00:00Z", merged_at: "2026-10-06T00:00:00Z", head: { sha: "a".repeat(40) }, draft: false }, "test/repo"));
  return buildReport({ repository: "test/repo", description: "", now, closed: rows, details: [], open: [], notes: [], requests: 0, contributingUrl: null, openKnown: true, periodComplete: true, detailRequested: 0 });
}
test("bot and human slices and daily activity use the same observed merges", () => {
  const report = fixture(); assert.deepEqual(splitMerges(report), { humans: 1, bots: 1, unknown: 0 });
  const days = activity(report); assert.equal(days.length, 14); assert.deepEqual(days.at(-1), { day: "2026-10-06", humans: 1, bots: 1, unknown: 0 });
});
test("daily capture replacement does not invent extra history or star growth", () => {
  const report = fixture(); report.profile = { owner: null, stars: 100, forks: 0, language: null };
  let history = appendPoint([], report); assert.equal(starGrowth(history), null);
  report.profile.stars = 105; history = appendPoint(history, report); assert.equal(history.length, 1); assert.equal(starGrowth(history), null);
  report.capturedAt = "2026-10-07T12:00:00Z"; report.profile.stars = 120; history = appendPoint(history, report); assert.equal(starGrowth(history), 15);
});
test("the scheduler performs no quota-consuming discovery or scans without a dedicated credential", async () => {
  let requests = 0, writes = 0;
  const result = await refreshIndex({ store: { async get() { return null; }, async put() { writes++; } }, now: () => now, fetch: (async () => { requests++; throw new Error("No network"); }) as typeof fetch });
  assert.equal(result.status, "needs-public-read-credential"); assert.equal(requests, 0); assert.equal(writes, 0);
});
test("malformed catalog entries cannot choose arbitrary hosts or unbounded scans", async () => {
  const catalog = await readCatalog({ async get() { return JSON.stringify({ selected: ["https://evil.test/token"], cursor: 0 }); }, async put() {} });
  assert.ok(catalog.selected.length <= 100); assert.ok(catalog.selected.every(name => !name.includes("://")));
});
test("authenticated index discovery stays public, rotates four repos, and preserves the prior daily reading", async () => {
  const data = new Map<string, string>();
  const prior = fixture(); prior.repository = "sample/r0"; prior.capturedAt = "2026-10-05T12:00:00Z"; prior.profile = { owner: null, stars: 100, forks: 0, language: null };
  data.set("repo:sample/r0", JSON.stringify(prior));
  const calls: string[] = [];
  const store = { async get(key: string) { return data.get(key) ?? null; }, async put(key: string, value: string) { data.set(key, value); } };
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url.pathname);
    assert.equal(url.origin, "https://api.github.com"); assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer offline-token"); assert.equal(init?.redirect, "error");
    if (url.pathname === "/search/repositories") return new Response(JSON.stringify({ incomplete_results: false, items: [...Array.from({ length: 6 }, (_, id) => ({ full_name: `sample/r${id}`, private: false, fork: false, archived: false })), { full_name: "secret/repo", private: true, fork: false, archived: false }] }));
    if (/^\/repos\/sample\/r\d$/.test(url.pathname)) return new Response(JSON.stringify({ full_name: url.pathname.slice(7), private: false, description: "", stargazers_count: 120, forks_count: 0 }));
    return new Response(JSON.stringify(url.pathname.endsWith("community/profile") ? { files: {} } : []));
  };
  assert.deepEqual(await refreshIndex({ store, fetch: fetcher, now: () => now, token: "offline-token" }), { status: "active", captured: 4 });
  const catalog = await readCatalog(store); assert.equal(catalog.cursor, 4); assert.equal(catalog.selected.length, 6); assert.ok(!calls.some(path => path.includes("secret")));
  const history = JSON.parse(data.get("history:sample/r0")!); assert.equal(history.length, 2); assert.equal(starGrowth(history), 20);
  calls.length = 0;
  await refreshIndex({ store, fetch: fetcher, now: () => now, token: "offline-token" });
  assert.ok(!calls.includes("/search/repositories")); assert.equal((await readCatalog(store)).cursor, 2);
});
