import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";

const endpoint =
	"https://api.cloudflare.com/client/v4/accounts/3c7b28f23cc93f09e77bb0a9ffcb7e6f/storage/kv/namespaces/5ce3d8b4fad240a89542b35c99ea9153/bulk";

/** @typedef {{key:string,value:string,expiration_ttl?:number}} Entry */
/** @param {Entry[]} entries @returns {Entry[][]} */
export function publicationBatches(entries) {
	const pointer = entries.at(-1);
	if (
		pointer?.key !== "index:catalog" ||
		entries.slice(0, -1).some((entry) => entry.key === "index:catalog")
	)
		throw new Error("The dataset pointer must be written exactly once, last.");
	const batches = [];
	let batch = [],
		bytes = 0;
	for (const entry of entries.slice(0, -1)) {
		const size = Buffer.byteLength(JSON.stringify(entry));
		if (size > 4_000_000)
			throw new Error("Index entry exceeds the publication limit.");
		if (bytes + size > 4_000_000 && batch.length) {
			batches.push(batch);
			batch = [];
			bytes = 0;
		}
		batch.push(entry);
		bytes += size;
	}
	if (batch.length) batches.push(batch);
	return [...batches, [pointer]];
}

/**
 * Publish immutable dataset keys before switching the small catalog pointer.
 * A failed data batch never switches the active dataset. KV remains eventually
 * consistent; the grace period lets new keys propagate before the pointer.
 * @param {Entry[]} entries
 * @param {{token?:string,wrangler?:boolean,fetch?:typeof fetch,wait?:(ms:number)=>Promise<void>}} options
 */
export async function publishIndex(entries, options) {
	if (!options.wrangler && !options.token)
		throw new Error(
			"Daily publishing needs the scoped Cloudflare index token.",
		);
	const batches = publicationBatches(entries),
		request = options.fetch ?? fetch;
	const run = promisify(execFile),
		directory = new URL("../.data/index/publication/", import.meta.url);
	if (options.wrangler) await mkdir(directory, { recursive: true });
	for (let index = 0; index < batches.length; index++) {
		if (index === batches.length - 1)
			await (
				options.wait ??
				((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
			)(65_000);
		if (options.wrangler) {
			const path = new URL(`${index}.json`, directory);
			await writeFile(path, JSON.stringify(batches[index]));
			const env = { ...process.env };
			for (const key of [
				"CLOUDFLARE_API_TOKEN",
				"CLOUDFLARE_API_KEY",
				"CLOUDFLARE_EMAIL",
				"CF_API_TOKEN",
				"CF_API_KEY",
				"CF_EMAIL",
				"CLOUDFLARE_ACCOUNT_ID",
			])
				delete env[key];
			await run(
				"bun",
				[
					"run",
					"wrangler",
					"kv",
					"bulk",
					"put",
					path.pathname,
					"--binding",
					"REPORTS",
					"--remote",
				],
				{ env, maxBuffer: 1_000_000 },
			);
		} else {
			const response = await request(endpoint, {
				method: "PUT",
				redirect: "error",
				headers: {
					Authorization: `Bearer ${options.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(batches[index]),
			});
			let result = null;
			try {
				result = await response.json();
			} catch {
				/* Report the status without echoing an API response. */
			}
			if (
				!response.ok ||
				!result?.success ||
				result?.result?.unsuccessful_keys?.length ||
				(typeof result?.result?.successful_key_count === "number" &&
					result.result.successful_key_count !== batches[index].length)
			)
				throw new Error(
					`Index publication not confirmed: batch ${index + 1}/${batches.length}, HTTP ${response.status}, ${result?.result?.unsuccessful_keys?.length ?? "unknown"} unsuccessful keys. ${index < batches.length - 1 ? "Previous dataset stays selected." : "Read the current catalog before retrying."}`,
				);
		}
	}
}
