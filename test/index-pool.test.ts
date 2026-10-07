import test from "node:test";
import assert from "node:assert/strict";
import { collectIndexedReport } from "../server/github-index.js";
import { replayReport } from "../src/core.js";
import { createHandler, type ServerOptions } from "../server/http.js";
const now = Date.parse("2026-10-07T12:00:00Z");
const raw = {
	number: 1,
	title: "Change",
	createdAt: "2026-10-01T00:00:00Z",
	updatedAt: "2026-10-07T00:00:00Z",
	mergedAt: "2026-10-06T00:00:00Z",
	isDraft: false,
	headRefOid: "a".repeat(40),
	additions: 10,
	deletions: 3,
	totalCommentsCount: 163,
	author: {
		databaseId: 1,
		login: "author",
		avatarUrl: "https://avatars.githubusercontent.com/u/1",
		__typename: "User",
	},
};
test("indexed collector checks public identity before aggregate reads and retains unknown inline counts", async () => {
	let calls = 0;
	const fetcher: typeof fetch = async () => {
		calls++;
		return new Response(
			JSON.stringify(
				calls === 1
					? {
							private: false,
							full_name: "test/repo",
							description: "",
							owner: { id: 1, login: "test", type: "User" },
							stargazers_count: 42,
							forks_count: 1,
							language: "TS",
						}
					: {
							data: {
								repository: {
									isPrivate: false,
									nameWithOwner: "test/repo",
									merged: { nodes: [raw], pageInfo: { hasNextPage: false } },
									oldest: { nodes: [] },
								},
								discussed: { nodes: [] },
							},
						},
			),
		);
	};
	const report = await collectIndexedReport("test/repo", {
		fetch: fetcher,
		now,
		signal: new AbortController().signal,
	});
	assert.equal(report.version, 2);
	assert.equal(report.facts.details[0].reviewComments, null);
	assert.equal(
		report.awards.find((row) => row.id === "comments")?.value,
		"163 PR comments",
	);
	assert.deepEqual(replayReport(report).awards, report.awards);
	calls = 0;
	await assert.rejects(
		collectIndexedReport("test/repo", {
			fetch: async () => {
				calls++;
				return new Response(
					JSON.stringify({ private: true, full_name: "test/repo" }),
				);
			},
			now,
			signal: new AbortController().signal,
		}),
	);
	assert.equal(calls, 1);
});
test("top-ten and dedicated top-100 routes slice the completed dataset without rescanning repos", async () => {
	const map = new Map<string, string>(),
		selected = Array.from({ length: 120 }, (_, i) => `team/repo${i}`);
	map.set(
		"index:catalog",
		JSON.stringify({
			selected,
			discoveredAt: new Date(now).toISOString(),
			datasetId: "1760000000000",
			cursor: 0,
			lastRefresh: new Date(now).toISOString(),
		}),
	);
	const rows = selected.map((repository, i) => ({
		repository,
		person: null,
		score: 120 - i,
		value: `${120 - i} PR comments`,
		source: `https://github.com/${repository}/pull/1`,
		capturedAt: new Date(now).toISOString(),
		sampled: true,
		inspected: 100,
	}));
	for (const cohort of ["top", "trending"])
		map.set(
			`dataset:1760000000000:board:${cohort}:comments`,
			JSON.stringify({
				rows,
				selected: 1000,
				indexed: 120,
				refreshedAt: new Date(now).toISOString(),
			}),
		);
	const options: ServerOptions = {
		store: {
			async get(key) {
				return map.get(key) ?? null;
			},
			async put() {},
		},
		assets: {
			async fetch() {
				return new Response(
					'<html lang="en-US"><head><title>Test</title></head><body><div id="board-rows"></div></body></html>',
				);
			},
		},
		fetch: async () => {
			throw new Error("No network");
		},
		now: () => now,
		png: async (svg) => { assert.match(svg, /team\/repo0/); return new Uint8Array([137,80,78,71]); },
	};
	const handle = createHandler(options);
	const ten = (await (
		await handle(new Request("https://repolore.fun/api/leaderboards/comments"))
	).json()) as { rows: unknown[]; total: number };
	const hundred = (await (
		await handle(
			new Request("https://repolore.fun/api/leaderboards/comments?limit=100"),
		)
	).json()) as { rows: unknown[] };
	assert.equal((await handle(new Request("https://repolore.fun/_og/leaderboards/comments.png"))).status,200);
    const sitemap=await (await handle(new Request("https://repolore.fun/sitemap.xml"))).text();
    assert.match(sitemap,/team\/repo119/);assert.match(sitemap,/comments\/top-100/);

	assert.equal(ten.rows.length, 10);
	assert.equal(ten.total, 120);
	assert.equal(hundred.rows.length, 100);
	assert.equal(
		(
			await handle(
				new Request("https://repolore.fun/leaderboards/comments/top-100"),
			)
		).status,
		200,
	);
    map.delete('dataset:1760000000000:board:trending:comments');
    assert.equal((await handle(new Request("https://repolore.fun/api/leaderboards/comments"))).status,503);
});
test('homepage winners match each leaderboard and chip identities never use a personal owner portrait',async()=>{
 const {championsMarkup,suggestionsMarkup,boardMarkup}=await import('../src/view.js');
 const row={repository:'person/project',person:null,score:12,value:'12 PR comments',source:'https://github.com/person/project/pull/1',capturedAt:new Date(now).toISOString(),sampled:true,inspected:17,repoOwner:{id:99,login:'person',bot:false}};
 assert.ok(!suggestionsMarkup([row]).includes('/_avatar/u/99'));assert.match(suggestionsMarkup([row]),/repo-monogram/);
 const tile=championsMarkup([{category:'comments',row}]);assert.match(tile,/href="\/leaderboards\/comments"/);assert.ok(!tile.includes("champion-rank"));assert.match(tile,/person\/project/);
 const help=boardMarkup([row]);assert.ok(!help.includes('Stars added: Not available'));assert.ok(!help.includes('PRs read:'));assert.match(help,/PRs checked: 17/);
});
test('repository artwork accepts only GitHub image sources and never forwards server credentials',async()=>{
 const {repositoryImageUrl,buildReport}=await import('../src/core.js');
 const source='https://repository-images.githubusercontent.com/123/abcd-1234';
 assert.equal(repositoryImageUrl('https://evil.example/logo.png'),undefined);
 assert.equal(repositoryImageUrl('https://repository-images.githubusercontent.com.evil.example/123/abcd'),undefined);
 assert.equal(repositoryImageUrl('https://user:pass@repository-images.githubusercontent.com/123/abcd'),undefined);
 const report=buildReport({repository:'test/repo',now,description:'',closed:[],open:[],details:[],requests:0,periodComplete:true,openKnown:true,detailRequested:0,contributingUrl:null,notes:[],profile:{owner:null,stars:1,forks:0,language:null,imageUrl:source}});
 let reads=0;
 const handle=createHandler({store:{async get(key){return key==='repo:test/repo'?JSON.stringify(report):null;},async put(){}},assets:{async fetch(){return new Response('');}},fetch:async(input,init)=>{reads++;assert.equal(String(input),source);assert.equal(new Headers(init?.headers).get('Authorization'),null);assert.equal(init?.redirect,'error');return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/png'}});},githubToken:'test-secret',now:()=>now,png:async()=>new Uint8Array()});
 assert.equal((await handle(new Request('https://repolore.fun/_repo-art/test/repo'))).status,200);
 assert.equal(reads,1);
});
