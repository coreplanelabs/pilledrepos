import { readFile, writeFile } from "node:fs/promises";
import { parseRepository, replayReport } from "../.server-dist/src/core.js";
const endpoint =
	"https://api.cloudflare.com/client/v4/accounts/3c7b28f23cc93f09e77bb0a9ffcb7e6f/storage/kv/namespaces/5ce3d8b4fad240a89542b35c99ea9153/bulk/get";
/** Restore missing checkpoints from the last publication when the Actions cache is cold.
 * @param {{root:URL,token:string,fetch?:typeof fetch}} options */
export async function restorePublishedIndex(options) {
	const request = options.fetch ?? fetch;
	/** @param {string[]} keys */
	async function read(keys) {
		const response = await request(endpoint, {
			method: "POST",
			redirect: "error",
			signal: AbortSignal.timeout(30000),
			headers: {
				Authorization: `Bearer ${options.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ keys, type: "json" }),
		});
		if (!response.ok)
			throw new Error("Cannot read the published Repo Lore index.");
		const text = await response.text();
		if (text.length > 8_000_000)
			throw new Error("Published checkpoint batch too large.");
		const data = JSON.parse(text);
		if (!data.success || !data.result?.values)
			throw new Error("Published checkpoints unavailable.");
		return data.result.values;
	}
	const catalog = (await read(["index:catalog"]))["index:catalog"];
	if (!catalog?.datasetId) return 0;
	if (
		!/^\d{13}$/.test(catalog.datasetId) ||
		!Array.isArray(catalog.selected) ||
		catalog.selected.length > 1000
	)
		throw new Error("Invalid published checkpoint catalog.");
	/** @type {string[]} */
 const repositories = catalog.selected.map(parseRepository);
 const targets = repositories
		.flatMap((repository) =>
			["repo", "stars", "history"].map((kind) => ({
				key: `dataset:${catalog.datasetId}:${kind}:${repository.toLowerCase()}`,
				file: `${kind === "repo" ? "reports" : kind}/${repository.toLowerCase().replace("/", "--")}.json`,
				kind,
				repository,
			})),
		);
	let restored = 0;
	for (let offset = 0; offset < targets.length; offset += 90) {
		const batch = targets.slice(offset, offset + 90),
			values = await read(batch.map((row) => row.key));
		for (const target of batch) {
			const value = values[target.key];
			if (!value) continue;
			const path = new URL(target.file, options.root);
			try {
				await readFile(path);
				continue;
			} catch {}
			if (target.kind === "repo") {
				const report = replayReport(value);
				if (report.repository.toLowerCase() !== target.repository.toLowerCase())
					throw new Error("Checkpoint repository mismatch.");
			} else if (
				target.kind === "history" &&
				(!Array.isArray(value) || value.length > 90)
			)
				throw new Error("Invalid history checkpoint.");
			else if (
				target.kind === "stars" &&
				(!Array.isArray(value.days) || value.days.length > 30)
			)
				throw new Error("Invalid star checkpoint.");
			await writeFile(path, JSON.stringify(value));
			restored++;
		}
	}
	return restored;
}
