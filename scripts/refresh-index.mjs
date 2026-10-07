import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
	collectIndexedReport,
	INDEX_QUERY,
	ARTWORK_QUERY,
	collectRepositoryArtwork,
} from "../.server-dist/server/github-index.js";
import { parseRepository, replayReport } from "../.server-dist/src/core.js";
import {
	parseStarHistory,
	starMetric,
} from "../.server-dist/src/star-history.js";
import { appendPoint } from "../.server-dist/src/analytics.js";
import { restorePublishedIndex } from "./index-restore.mjs";
import { captureReason } from "./index-diagnostics.mjs";
import { publishIndex } from "./index-publication.mjs";
import { CATEGORIES, leaderboard } from "../.server-dist/src/catalog.js";
const args = process.argv.slice(2),
	useGh = args.includes("--use-gh"),
	limitArg = args.find((arg) => arg.startsWith("--limit=")),
	limit = limitArg ? Number(limitArg.slice(8)) : 1000;
if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
	throw new Error("Use --limit=1..1000.");
if (!useGh && !process.env.GH_TOKEN)
	throw new Error(
		"Provide the read-only GH_TOKEN, or explicitly choose --use-gh for maintainer captures.",
	);
if (args.includes("--publish") && !process.env.CLOUDFLARE_INDEX_TOKEN)
	throw new Error(
		"Set the dedicated CLOUDFLARE_INDEX_TOKEN before publishing.",
	);
if (
	(args.includes("--publish") || args.includes("--publish-via-wrangler")) &&
	limit !== 1000
)
	throw new Error(
		"Publication requires the full 1,000-repo pool. Smaller limits are for local checks.",
	);
const run = promisify(execFile),
	root = new URL("../.data/index/", import.meta.url);
await mkdir(new URL("history/", root), { recursive: true });
await mkdir(new URL("reports/", root), { recursive: true });
await mkdir(new URL("stars/", root), { recursive: true });
if (process.env.CLOUDFLARE_INDEX_TOKEN)
	console.log(
		`Restored ${await restorePublishedIndex({ root, token: process.env.CLOUDFLARE_INDEX_TOKEN })} published checkpoints.`,
	);
const now = Date.now(),
	stamp = new Date(now).toISOString();
/** @param {number} ms */ const pause = (ms) =>
	new Promise((resolve) => setTimeout(resolve, ms));
/** @param {string} path @param {RequestInit} [init] */
async function api(path, init = {}) {
	if (
		!(
			path.startsWith("/repos/") ||
			path.startsWith("/search/repositories") ||
			path === "/graphql" ||
			path === "/rate_limit"
		)
	)
		throw new Error("Unexpected GitHub source.");
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			if (useGh) {
				const command = ["api", "--hostname", "github.com", path.slice(1)];
				if (init.body) {
					const body = JSON.parse(String(init.body));
					if (body.query !== INDEX_QUERY && body.query !== ARTWORK_QUERY)
						throw new Error("Unexpected GraphQL operation.");
					command.push("-f", `query=${body.query}`);
					for (const [key, value] of Object.entries(body.variables))
						command.push("-f", `${key}=${value}`);
				}
				const result = await run("gh", command, {
					signal: init.signal ?? undefined,
					maxBuffer: 8_000_000,
					timeout: 60_000,
				});
				return JSON.parse(result.stdout);
			}
			const response = await fetch("https://api.github.com" + path, {
				...init,
				redirect: "error",
				headers: {
					...init.headers,
					Authorization: `Bearer ${process.env.GH_TOKEN}`,
					"User-Agent": "RepoLoreDailyIndex",
					"X-GitHub-Api-Version": "2026-03-10",
				},
			});
			if (!response.ok) {
				const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000,
					retry = Number(response.headers.get("retry-after")) * 1000;
				if ([403, 429].includes(response.status) && attempt < 3) {
					await pause(
						Math.min(3_700_000, Math.max(10_000, retry || reset - Date.now())),
					);
					continue;
				}
				throw new Error(`GitHub read failed (${response.status}).`);
			}
			const body = await response.text();
			if (body.length > 8_000_000) throw new Error("Oversized response.");
			return JSON.parse(body);
		} catch (error) {
			if (attempt === 3) throw error;
			await pause(5000 * (attempt + 1));
		}
	}
	throw new Error("Read unavailable.");
}
/** @type {{capturedAt:string,selected:string[]}|null} */
let discovered = null;
try {
	discovered = JSON.parse(
		await readFile(new URL("discovery.json", root), "utf8"),
	);
	if (
		!discovered ||
		discovered.capturedAt.slice(0, 10) !== stamp.slice(0, 10) ||
		discovered.selected.length < limit
	)
		discovered = null;
} catch {
	discovered = null;
}
if (!discovered) {
	const selected = [];
	for (let page = 1; page <= Math.ceil(limit / 100); page++) {
		const query = new URLSearchParams({
			q: "is:public fork:false archived:false stars:>500",
			sort: "stars",
			order: "desc",
			per_page: "100",
			page: String(page),
		});
		const data = await api("/search/repositories?" + query);
		if (data.incomplete_results || !Array.isArray(data.items))
			throw new Error("Incomplete discovery.");
		for (const row of data.items)
			if (row.private === false && !row.fork && !row.archived)
				selected.push(parseRepository(row.full_name));
	}
	discovered = {
		capturedAt: stamp,
		selected: [...new Set(selected)].slice(0, limit),
	};
	await writeFile(new URL("discovery.json", root), JSON.stringify(discovered));
}
const selected = discovered.selected.slice(0, limit);
/** @type {string[]} */ const failures = [];
let done = 0;
const captured = new Set();
for (let offset = 0; offset < selected.length; offset += 6) {
	const batch = selected.slice(offset, offset + 6);
	await Promise.all(
		batch.map(async (repository) => {
			const file = repository.toLowerCase().replace("/", "--") + ".json";
			let phase = "PR facts";
			try {
				let report;
				try {
					const saved = replayReport(
						JSON.parse(
							await readFile(new URL("reports/" + file, root), "utf8"),
						),
					);
					if (
						saved.version === 2 &&
						saved.capturedAt.slice(0, 10) === stamp.slice(0, 10)
					)
						report = saved;
				} catch {
					/* Capture a missing/stale report. */
				}
				const adapter = /** @type {typeof fetch} */ (
					async (input, init) => {
						const url = new URL(String(input));
						if (url.origin !== "https://api.github.com")
							throw new Error("Unexpected host.");
						return new Response(
							JSON.stringify(await api(url.pathname + url.search, init)),
							{ headers: { "Content-Type": "application/json" } },
						);
					}
				);
				if (!report) {
					report = await collectIndexedReport(repository, {
						fetch: adapter,
						now: Date.now(),
						signal: AbortSignal.timeout(60_000),
					});
					await writeFile(
						new URL("reports/" + file, root),
						JSON.stringify(report),
					);
				}
				if (!report.profile?.artworkChecked) {
					phase = "Repository artwork";
					try {
						report = await collectRepositoryArtwork(
							report,
							adapter,
							AbortSignal.timeout(15_000),
						);
						await writeFile(
							new URL("reports/" + file, root),
							JSON.stringify(report),
						);
					} catch (cause) {
						console.warn("Optional index read unavailable", {
							repository,
							phase,
							reason: captureReason(cause),
						});
					}
				}

				phase = "Star history";
				try {
					let fresh = false;
					try {
						const saved = JSON.parse(
							await readFile(new URL("stars/" + file, root), "utf8"),
						);
						fresh = saved.capturedAt.slice(0, 10) === stamp.slice(0, 10);
					} catch {}
					if (!fresh) {
						const raw = await api(
							`/repos/${repository}/stargazers/history?per_page=6`,
						);
						await writeFile(
							new URL("stars/" + file, root),
							JSON.stringify(parseStarHistory(raw, Date.now())),
						);
					}
				} catch (cause) {
					console.warn("Optional index read unavailable", {
						repository,
						phase,
						reason: captureReason(cause),
					});
				}
				phase = "Daily history";
				let history = [];
				try {
					history = JSON.parse(
						await readFile(new URL("history/" + file, root), "utf8"),
					);
				} catch {}
				await writeFile(
					new URL("history/" + file, root),
					JSON.stringify(appendPoint(history, report)),
				);
				captured.add(repository);
				done++;
			} catch (cause) {
				console.error("Index capture failed", {
					repository,
					phase,
					reason: captureReason(cause),
				});
				failures.push(repository);
			}
		}),
	);
	if (offset % 30 === 0)
		console.log(
			`Captured ${done}/${selected.length}; ${failures.length} unavailable.`,
		);
	if (offset % 30 === 0) {
		const limits = await api("/rate_limit");
		const budgets = [limits.resources?.core, limits.resources?.graphql].filter(
			Boolean,
		);
		const low = budgets.filter((row) => row.remaining < 150);
		if (low.length) {
			const wait =
				Math.max(...low.map((row) => row.reset * 1000)) - Date.now() + 2000;
			console.log(
				"Quota window exhausted; checkpoint saved. Waiting for reset.",
			);
			await pause(Math.max(1000, Math.min(wait, 3_700_000)));
		}
	}
}
/** @type {import("../.server-dist/src/core.js").Report[]} */ const reports =
	[];
const stars = new Map(),
	entries = [];
for (const repository of selected.filter((name) => captured.has(name))) {
	const key = repository.toLowerCase(),
		file = key.replace("/", "--") + ".json";
	try {
		const report = replayReport(
			JSON.parse(await readFile(new URL("reports/" + file, root), "utf8")),
		);
		reports.push(report);
		entries.push(
			{ key: "repo:" + key, value: JSON.stringify(report) },
			{
				key: `snapshot:${key}:${Date.parse(report.capturedAt)}`,
				value: JSON.stringify(report),
				expiration_ttl: 604800,
			},
		);
	} catch {
		continue;
	}
	try {
		const history = JSON.parse(
			await readFile(new URL("stars/" + file, root), "utf8"),
		);
		if (history.capturedAt.slice(0, 10) === stamp.slice(0, 10))
			stars.set(repository, history);
		entries.push({ key: "stars:" + key, value: JSON.stringify(history) });
	} catch {
		/* No invented star history. */
	}
}
for (const repository of selected.filter((name) => captured.has(name))) {
	const key = repository.toLowerCase(),
		file = key.replace("/", "--") + ".json";
	try {
		entries.push({
			key: "history:" + key,
			value: await readFile(new URL("history/" + file, root), "utf8"),
		});
	} catch {}
}
const rankings = Object.fromEntries(
	Object.keys(CATEGORIES).map((category) => [
		category,
		leaderboard(reports, category).map((row) => {
			const metric = starMetric(stars.get(row.repository) ?? null);
			return { ...row, starAdded: metric?.added, starDays: metric?.days };
		}),
	]),
);
const finishedAt = new Date().toISOString(),
	datasetId = String(Date.now());
for (const cohort of ["top", "trending"])
	for (const [category, rows] of Object.entries(rankings))
		entries.push({
			key: `board:${cohort}:${category}`,
			value: JSON.stringify({
				category,
				rows: rows.filter(
					(row) => cohort === "top" || (row.starAdded ?? 0) > 0,
				),
				cohort,
				selected: selected.length,
				indexed: reports.length,
				refreshedAt: finishedAt,
			}),
		});
const snapshotRefs = entries
	.filter((entry) => entry.key.startsWith("snapshot:"))
	.map((entry) => ({
		key: entry.key.replace("snapshot:", "snapshot-ref:"),
		value: datasetId,
		expiration_ttl: 604800,
	}));
for (const entry of entries) {
	if (!entry.expiration_ttl) entry.expiration_ttl = 604800;
	entry.key = `dataset:${datasetId}:${entry.key}`;
}
entries.push(...snapshotRefs);
entries.push({
	key: "index:catalog",
	value: JSON.stringify({
		selected: reports.map((report) => report.repository),
		discoveredAt: discovered.capturedAt,
		cursor: 0,
		lastRefresh: finishedAt,
		status: "daily",
		datasetId,
		indexed: reports.length,
	}),
});
await writeFile(new URL("seed.json", root), JSON.stringify(entries));
await writeFile(
	new URL("summary.json", root),
	JSON.stringify(
		{
			selected: selected.length,
			indexed: reports.length,
			failures,
			counts: Object.fromEntries(
				Object.entries(rankings).map(([category, rows]) => [
					category,
					rows.length,
				]),
			),
			capturedAt: finishedAt,
		},
		null,
		2,
	),
);
console.log(
	JSON.stringify({
		indexed: reports.length,
		counts: Object.fromEntries(
			Object.entries(rankings).map(([category, rows]) => [
				category,
				rows.length,
			]),
		),
	}),
);
if (
	reports.length < Math.min(100, selected.length) ||
	failures.length > selected.length * 0.1
)
	throw new Error("Index incomplete; preserve the previous published dataset.");

if (args.includes("--publish") || args.includes("--publish-via-wrangler"))
	for (const [category, rows] of Object.entries(rankings)) {
		if (
			rows.length < 100 ||
			rows.filter((row) => (row.starAdded ?? 0) > 0).length < 100
		)
			throw new Error(
				`Not enough readable results for ${CATEGORIES[category].name}'s top 100. Previous dataset stays selected.`,
			);
	}

if (args.includes("--publish") || args.includes("--publish-via-wrangler")) {
	await publishIndex(entries, {
		token: process.env.CLOUDFLARE_INDEX_TOKEN,
		wrangler: args.includes("--publish-via-wrangler"),
	});
	console.log("Published the complete daily index.");
}

if (process.env.GITHUB_STEP_SUMMARY)
	await writeFile(
		process.env.GITHUB_STEP_SUMMARY,
		`## Daily index refreshed\n\nCaptured ${reports.length} of ${selected.length} public repos. ${failures.length} unavailable.\n\n| Award | Ranked repos |\n| --- | --- |\n${Object.entries(
			rankings,
		)
			.map(
				([category, rows]) =>
					`| ${CATEGORIES[category].name} | ${rows.length} |`,
			)
			.join("\n")}\n\nRefresh: ${finishedAt}\nDataset: ${datasetId}\n`,
		{ flag: "a" },
	);
