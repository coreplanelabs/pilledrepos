import test from "node:test";
import assert from "node:assert/strict";
import {
	publicationBatches,
	publishIndex,
} from "../scripts/index-publication.mjs";
const entries = [
	{ key: "dataset:new:board:top:comments", value: "[]" },
	{ key: "index:catalog", value: '{"datasetId":"new"}' },
];
test("failed data publication leaves the catalog pointer untouched", async () => {
	const written = [];
	await assert.rejects(
		publishIndex(entries, {
			token: "test-only",
			fetch: async (_, init) => {
				written.push(JSON.parse(init.body));
				return new Response('{"success":false}', { status: 403 });
			},
			wait: async () => {},
		}),
	);
	assert.deepEqual(written, [entries.slice(0, 1)]);
});
test("successful publication switches the pointer after data propagation", async () => {
	const events = [];
	await publishIndex(entries, {
		token: "test-only",
		fetch: async (_, init) => {
			events.push(JSON.parse(init.body)[0].key);
			return new Response('{"success":true}');
		},
		wait: async (ms) => events.push(ms),
	});
	assert.deepEqual(events, [
		"dataset:new:board:top:comments",
		65000,
		"index:catalog",
	]);
	assert.throws(() => publicationBatches([...entries, entries[1]]));
});
test("partial KV success cannot switch the active dataset", async () => {
	const writes = [];
	await assert.rejects(
		publishIndex(entries, {
			token: "test-only",
			fetch: async (_, init) => {
				writes.push(JSON.parse(init.body));
				return new Response(
					'{"success":true,"result":{"unsuccessful_keys":["dataset:new:board:top:comments"]}}',
				);
			},
			wait: async () => {},
		}),
	);
	assert.equal(writes.length, 1);
});
test("a cold daily job restores published checkpoints without replacing newer local captures", async () => {
	const { restorePublishedIndex } = await import(
		"../scripts/index-restore.mjs"
	);
	const { mkdtemp, mkdir, readFile, writeFile, rm } = await import(
		"node:fs/promises"
	);
	const { tmpdir } = await import("node:os");
	const { pathToFileURL } = await import("node:url");
	const folder = await mkdtemp(tmpdir() + "/repolore-index-"),
		root = pathToFileURL(folder + "/");
	try {
		for (const kind of ["reports", "stars", "history"])
			await mkdir(new URL(kind + "/", root));
		await writeFile(
			new URL("stars/test--repo.json", root),
			"newer-local-stars",
		);
		const history = [{ day: "2026-10-06", stars: 5, merges: 1, botMerges: 0 }],
			stars = { capturedAt: "2026-10-06T12:00:00Z", days: [] };
		const values = {
			"index:catalog": { datasetId: "1760000000000", selected: ["test/repo"] },
			"dataset:1760000000000:stars:test/repo": stars,
			"dataset:1760000000000:history:test/repo": history,
		};
		const restored = await restorePublishedIndex({
			root,
			token: "test-only",
			fetch: async (_, init) => {
				const keys = JSON.parse(init.body).keys;
				assert.ok(keys.length <= 100);
				return new Response(
					JSON.stringify({
						success: true,
						result: {
							values: Object.fromEntries(
								keys.map((key) => [key, values[key] ?? null]),
							),
						},
					}),
				);
			},
		});
		assert.equal(restored, 1);
		assert.deepEqual(
			JSON.parse(
				await readFile(new URL("history/test--repo.json", root), "utf8"),
			),
			history,
		);
		assert.equal(
			await readFile(new URL("stars/test--repo.json", root), "utf8"),
			"newer-local-stars",
		);
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});
test('capture diagnostics never echo arbitrary provider errors or credentials',async()=>{
 const {captureReason}=await import('../scripts/index-diagnostics.mjs');
 assert.equal(captureReason(new Error('Bearer secret-value from a response')),'Read could not be completed.');
 assert.equal(captureReason(new Error('GitHub read failed (403).')),'GitHub returned HTTP 403.');
 await assert.rejects(publishIndex(entries,{token:'test-only',fetch:async()=>new Response('untrusted secret-value body',{status:503}),wait:async()=>{}}),error=>error instanceof Error && /batch 1\/2, HTTP 503/.test(error.message)&&!error.message.includes('secret-value'));
});
