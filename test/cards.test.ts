import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, parsePull, replayReport, type Report } from "../src/core.js";
import { cardStandings } from "../src/neighbors.js";
import { leaderboard } from "../src/catalog.js";
import { cardsMarkup } from "../src/view.js";
const now = Date.parse("2026-10-06T12:00:00Z");
function report(repository: string, bots: number, humans = 1, minutes = 60): Report {
  const closed = Array.from({ length: bots + humans }, (_, index) => parsePull({ number: index + 1, title: "Change", user: { id: index + 1, login: `author${index}`, type: index < bots ? "Bot" : "User" }, created_at: new Date(now - 86_400_000 - minutes * 60_000).toISOString(), updated_at: new Date(now).toISOString(), merged_at: new Date(now - 86_400_000).toISOString(), draft: false, head: { sha: "a".repeat(40) } }, repository));
  return buildReport({ repository, description: "", now, closed, details: [], open: [], periodComplete: true, openKnown: true, detailRequested: 0, notes: [], requests: 0, contributingUrl: null });
}
test("bot award counts only bot account authors inside the merge window and survives legacy replay", () => {
  const result = report("test/repo", 2, 2), source = result.facts.closed;
  source.push({ ...source[0], number: 5, author: null });
  source.push({ ...source[0], number: 6, mergedAt: now - 91 * 86_400_000 });
  source[2].author!.login = "looks-like-a-bot[bot]";
  const rebuilt = replayReport(result), award = rebuilt.awards.find(row => row.id === "bots")!;
  assert.equal(award.value, "2 bot-authored merges"); assert.equal(award.headline, "40% bot cameos");
  assert.equal(award.evidence.length, 2); assert.match(award.scope, /1 merge has no readable author/);
  assert.equal(leaderboard([rebuilt], "bots")[0].score, 2);
});
test("bot-free merges get a truthful zero score but quiet repos get no invented rank", () => {
  const humans = report("human/repo", 0, 3), quiet = report("quiet/repo", 0, 0);
  assert.equal(leaderboard([humans, quiet], "bots").length, 1);
  assert.equal(leaderboard([humans], "bots")[0].score, 0);
  assert.equal(cardStandings(quiet, [humans]).bots, null);
});
test("neighbors deduplicate the queried repo and honor reverse Fastest Lap ordering", () => {
  const middle = report("middle/repo", 2, 1, 30), high = report("high/repo", 4, 1, 10), low = report("low/repo", 1, 1, 60);
  const nearby = cardStandings(middle, [middle, high, low]);
  assert.equal(nearby.bots!.total, 3); assert.equal(nearby.bots!.rank, 2);
  assert.equal(nearby.bots!.ahead!.repository, "high/repo"); assert.equal(nearby.bots!.behind!.repository, "low/repo");
  assert.equal(nearby.fast!.ahead!.repository, "high/repo"); assert.equal(nearby.fast!.behind!.repository, "low/repo");
});
test("adjacent ties share rank and say Level with, retaining the repo award link", () => {
  const mine = report("middle/repo", 2), first = report("alpha/repo", 2), last = report("zebra/repo", 2);
  const standings = cardStandings(mine, [first, last]), bots = standings.bots!;
  assert.equal(bots.rank, 1); assert.equal(bots.tied, true);
  const html = cardsMarkup(mine, standings);
  assert.match(html, /Level with/); assert.match(html, /Tied #1 of 3/); assert.match(html, /\/alpha\/repo#award-bots/);
});
import { topTenResult } from "../src/celebration.js";
test("celebration eligibility requires a top-ten observed result, not just any loaded repo", () => {
  assert.equal(topTenResult(), false);
  assert.equal(topTenResult({ bots: { rank: 1, total: 20, score: 0, tied: true, ahead: null, behind: null } }), false);
  assert.equal(topTenResult({ merge: { rank: 11, total: 100, score: 42, tied: false, ahead: null, behind: null } }), false);
  assert.equal(topTenResult({ merge: { rank: 10, total: 100, score: 42, tied: false, ahead: null, behind: null } }), true);
});
test("compact card footer preserves full scope, source links, and tie semantics", () => {
  const mine = report("middle/repo", 2), equal = report("alpha/repo", 2);
  const html = cardsMarkup(mine, cardStandings(mine, [equal]));
  assert.match(html, /class="rank-number">#1</); assert.match(html, /class="rank-tie">Tied</);
  assert.match(html, /aria-label="Level with:/); assert.match(html, /class="award-footer"/);
  assert.match(html, /What this award counts/); assert.ok(html.includes(mine.awards[0].scope));
  assert.match(html, /https:\/\/github.com\/middle\/repo\/pull\/1/);
  const zero = report("humans/repo", 0, 2);
  const bot = cardsMarkup(zero).split('id="award-bots"')[1];
  assert.ok(!bot.includes("The automation crew put in a shift."));
});
