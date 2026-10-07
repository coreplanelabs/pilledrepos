import test from "node:test";
import assert from "node:assert/strict";
import { ArcadeError, buildReport, collectReport, parseDetail, parsePull, parseRepository, plainReport, replayReport, type Pull } from "../src/core.js";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const repository = "sample/project";
function row(number: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { number, title: `Change ${number}`, user: { id: number, login: `author${number}`, type: "User" },
    created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-05T12:00:00Z", merged_at: "2026-10-05T12:00:00Z",
    draft: false, author_association: "CONTRIBUTOR", head: { sha: "a".repeat(40) }, additions: 10, deletions: 30, review_comments: 4, ...overrides };
}
function response(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { status, headers });
}
type Handler = (url: string) => Response | Promise<Response>;
function mockFetch(handler: Handler, calls: string[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(typeof input, "string"); assert.equal(init?.redirect, "error");
    const url = String(input); assert.ok(url.startsWith("https://api.github.com/repos/sample/project"));
    calls.push(url); return handler(url);
  }) as typeof fetch;
}
function routes(closed: unknown[], open: unknown[] = [], custom?: Handler): Handler {
  return url => {
    if (url.endsWith("/sample/project")) return response({ private: false, full_name: repository, description: "A public test fixture" });
    if (url.includes("state=closed")) return response(closed);
    if (url.includes("state=open")) return response(open);
    if (url.endsWith("/community/profile")) return response({ files: { contributing: { html_url: "https://github.com/sample/project/blob/main/CONTRIBUTING.md" } } });
    if (custom) return custom(url);
    return response(closed.find(p => Number((p as Record<string, unknown>).number) === Number(url.split("/").at(-1))));
  };
}
function collect(handler: Handler, calls: string[] = []) {
  return collectReport(repository, { fetch: mockFetch(handler, calls), now: NOW, signal: new AbortController().signal });
}
function report(closed: Pull[], details = closed.map(p => parseDetail(row(p.number), repository)), open: Pull[] = []) {
  return buildReport({ repository, description: "", now: NOW, closed, details, open, periodComplete: true,
    notes: [], contributingUrl: null, requests: 0, openKnown: true, detailRequested: Math.min(10, closed.length) });
}
test("accepts canonical public repo URLs and rejects other hosts or path injection", () => {
  assert.equal(parseRepository(" https://github.com/sample/project.git/ "), repository);
  assert.equal(parseRepository("sample/.github"), "sample/.github");
  for (const value of ["https://github.com.evil.test/sample/project", "https://x@github.com/sample/project", "http://github.com/sample/project", "sample/project/../../other", "sample/..", "sample/project?url=secret", "https://github.com/sample/project/tree/main", "https://api.github.com/repos/sample/project"]) {
    assert.throws(() => parseRepository(value), ArcadeError);
  }
});
test("binds evidence links to the chosen repo and treats title prose as data", () => {
  const parsed = parsePull(row(1, { title: '<img src=x onerror="bad()">', html_url: "https://evil.test" }), repository);
  assert.equal(parsed.url, "https://github.com/sample/project/pull/1");
  assert.equal(parsed.title, '<img src=x onerror="bad()">');
});
test("missing merge state and malformed counts cannot become green or zero", () => {
  const invalid = row(1); delete invalid.merged_at;
  assert.throws(() => parsePull(invalid, repository), ArcadeError);
  for (const value of [-1, null, "12", NaN]) assert.throws(() => parseDetail(row(1, { deletions: value }), repository), ArcadeError);
});
test("merge credit follows the PR author, keeps bots, and reports tied leaders", () => {
  const closed = [parsePull(row(1, { user: { id: 1, login: "alpha[bot]", type: "Bot" }, merged_by: { login: "human" } }), repository), parsePull(row(2, { user: { id: 2, login: "bravo", type: "User" } }), repository)];
  const award = report(closed).awards[0];
  assert.equal(award.headline, "@alpha[bot]"); assert.match(award.description, /tied/); assert.match(award.description, /bot account/);
  assert.doesNotMatch(award.description, /AI/);
});
test("closed-unmerged and out-of-period PRs do not count as merges", () => {
  const closed = [parsePull(row(1, { merged_at: null }), repository), parsePull(row(2, { merged_at: "2024-01-01T00:00:00Z" }), repository), parsePull(row(3, { merged_at: "2027-01-01T00:00:00Z" }), repository)];
  const result = report(closed, []);
  assert.equal(result.coverage.mergedObserved, 0); assert.equal(result.awards[0].status, "empty");
});
test("Delete Club shows gross deletions alongside additions without claiming shrinkage", () => {
  const closed = [parsePull(row(1), repository), parsePull(row(2), repository)];
  const details = [parseDetail(row(1, { additions: 1000, deletions: 1001 }), repository), parseDetail(row(2, { additions: 0, deletions: 200 }), repository)];
  const award = report(closed, details).awards.find(x => x.id === "delete")!;
  assert.equal(award.evidence[0].number, 1); assert.equal(award.value, "1,001 lines deleted");
  assert.match(award.description, /added 1,000 lines/);
  assert.match(award.scope, /all file types/); assert.match(award.description, /among inspected/);
});
test("comments and contributor counts remain literal without inferring newcomer status", () => {
  const closed = [parsePull(row(1, { author_association: "FIRST_TIME_CONTRIBUTOR" }), repository), parsePull(row(2, { author_association: "NONE" }), repository)];
  const result = report(closed);
  assert.equal(result.awards.find(a => a.id === "cast")?.value, "2 contributor accounts");
  assert.match(result.awards.find(a => a.id === "cast")!.description, /not a count of new or external/);
  const magnet = result.awards.find(a => a.id === "comments")!;
  assert.match(magnet.description, /not a roast or a defect/); assert.equal(magnet.evidence[0].number, 1);
});
test("open age includes drafts and is distinct from review wait", () => {
  const old = parsePull(row(7, { merged_at: null, created_at: "2026-01-01T00:00:00Z", draft: true }), repository);
  const result = report([], [], [old]); const award = result.awards.find(a => a.id === "oldest")!;
  assert.equal(award.evidence[0].number, 7); assert.match(award.description, /draft/); assert.match(award.scope, /not time waiting for review/);
});
test("quiet repo gets empty awards; no fabricated winner", async () => {
  const result = await collect(routes([]));
  assert.equal(result.coverage.mergedObserved, 0); assert.ok(result.awards.every(a => a.status === "empty"));
  assert.equal(result.awards.length, 9); assert.equal(result.coverage.periodComplete, true);
});
test("private or unknown visibility stops before reading PRs", async () => {
  for (const privateValue of [true, undefined]) {
    const calls: string[] = [];
    await assert.rejects(collect(() => response({ private: privateValue, full_name: repository }), calls), /public repositories only/);
    assert.equal(calls.length, 1);
  }
});
test("complete small scan has bounded calls, readable JSON summary, and a guide", async () => {
  const calls: string[] = []; const result = await collect(routes([row(1), row(2)]), calls);
  assert.equal(calls.length, 6); assert.equal(result.coverage.detailsRead, 2);
  assert.equal(result.contributingUrl, "https://github.com/sample/project/blob/main/CONTRIBUTING.md");
  assert.match(result.summary, /Found 2 PRs/); assert.match(plainReport(result), /Scope:/);
  assert.match(JSON.stringify(result), /Found 2 PRs/);
});
test("large repo stays sampled and inspects at most ten merged PRs", async () => {
  const closed = Array.from({ length: 100 }, (_, i) => row(i + 1)); const calls: string[] = [];
  const result = await collect(routes(closed), calls);
  assert.equal(result.coverage.detailsRequested, 10); assert.equal(result.coverage.detailsRead, 10);
  assert.equal(result.coverage.periodComplete, false); assert.equal(calls.length, 14);
  assert.ok(result.notes.some(note => note.includes("one page")));
});
test("an unreadable open record prevents a false oldest-PR award", async () => {
  const result = await collect(routes([row(1)], [{ bad: "record" }, row(4, { merged_at: null })]));
  assert.equal(result.awards.find(a => a.id === "oldest")?.status, "unknown");
});
test("a changed head is excluded rather than joining different facts", async () => {
  const result = await collect(routes([row(1)], [], () => response(row(1, { head: { sha: "b".repeat(40) } }))));
  assert.equal(result.coverage.detailsRead, 0); assert.equal(result.awards.find(a => a.id === "delete")?.status, "unknown");
  assert.ok(result.notes.some(note => note.includes("changed")));
});
test("rate limit during inspection preserves facts and starts no later batch", async () => {
  const calls: string[] = [];
  const result = await collect(routes([row(1), row(2), row(3), row(4)], [], () => response({}, 429, { "retry-after": "60" })), calls);
  assert.equal(result.coverage.detailsRead, 0); assert.equal(result.coverage.mergedObserved, 4);
  assert.equal(calls.length, 5); assert.equal(result.awards.find(a => a.id === "comments")?.status, "unknown");
  assert.ok(result.notes.some(note => note.includes("read stopped early")));
});
test("expired deadline starts no network call", async () => {
  const controller = new AbortController(); controller.abort(); const calls: string[] = [];
  await assert.rejects(collectReport(repository, { now: NOW, signal: controller.signal, fetch: mockFetch(routes([]), calls) }), /too long/);
  assert.equal(calls.length, 0);
});
test("invalid reset header cannot turn a rate-limit error into a RangeError", async () => {
  await assert.rejects(collect(() => response({}, 429, { "x-ratelimit-reset": "9".repeat(30) })), error => error instanceof ArcadeError && error.code === "RATE_LIMIT");
});
test("contribution links cannot point to another repo or an executable scheme", async () => {
  for (const html_url of ["https://evil.test/guide", "javascript:alert(1)", "https://github.com/other/project/blob/main/guide.md"]) {
    const handler = routes([]);
    const result = await collect(url => url.endsWith("community/profile") ? response({ files: { contributing: { html_url } } }) : handler(url));
    assert.equal(result.contributingUrl, null);
  }
});
test("an entirely malformed listing is a failed read, not a quiet repository", async () => {
  await assert.rejects(collect(routes([{ bogus: true }])), /cannot deal reliable awards/);
});
test("saved facts reproduce the awards without trusting saved prose or links", () => {
  const original = report([parsePull(row(1), repository)]);
  const saved = JSON.parse(JSON.stringify(original));
  saved.summary = "Injected unsupported claim";
  saved.awards[0].value = "999 fake merges";
  saved.facts.closed[0].url = "https://evil.test";
  const replayed = replayReport(saved);
  assert.equal(replayed.summary, original.summary);
  assert.deepEqual(replayed.awards, original.awards);
});
test("malformed or oversized saved scopes cannot fabricate a replay", () => {
  assert.throws(() => replayReport({ version: 900 }), ArcadeError);
  const saved = report([parsePull(row(1), repository)]);
  saved.coverage.detailsRequested = 999;
  assert.throws(() => replayReport(saved), ArcadeError);
});
test("normal multi-megabyte GitHub records fit the bounded read and are normalized", async () => {
  const result = await collect(routes([row(1, { body: "x".repeat(3_000_000) })]));
  assert.equal(result.coverage.mergedObserved, 1);
  assert.ok(JSON.stringify(result).length < 20_000);
});
test("offline replay rejects a diff bound to a different PR head", () => {
  const saved = report([parsePull(row(1), repository)]);
  saved.facts.details[0].headSha = "c".repeat(40);
  const result = replayReport(saved);
  assert.equal(result.coverage.detailsRead, 0);
  assert.equal(result.awards.find(a => a.id === "delete")?.status, "unknown");
});
test("Fastest Lap uses the valid minimum and readable singular units", () => {
  const closed = [parsePull(row(1, { created_at: "2026-10-05T11:00:00Z" }), repository), parsePull(row(2), repository)];
  assert.equal(report(closed).awards.find(a => a.id === "fast")?.value, "1 hour");
});
test("bot app portraits preserve GitHub's in/ avatar source without accepting other hosts", () => {
  const pr = parsePull(row(1, { user: { id: 42, login: "helper[bot]", type: "Bot", avatar_url: "https://avatars.githubusercontent.com/in/1234?v=4" } }), repository);
  assert.equal(pr.author?.avatarUrl, "https://avatars.githubusercontent.com/in/1234?s=160&v=4");
  const malicious = parsePull(row(2, { user: { id: 42, login: "person", type: "User", avatar_url: "https://evil.test/u/42" } }), repository);
  assert.equal(malicious.author?.avatarUrl, "https://avatars.githubusercontent.com/u/42?s=160&v=4");
});
