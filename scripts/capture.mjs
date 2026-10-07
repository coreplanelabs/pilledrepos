import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { collectReport, parseRepository } from "../dist/core.js";
import { POPULAR_REPOS } from "../dist/catalog.js";
const run = promisify(execFile), args = process.argv.slice(2);
const repositories = args.length === 1 && args[0] === "--popular" ? POPULAR_REPOS : args.map(parseRepository);
if (!repositories.length || repositories.length > 8) throw new Error("Choose owner/repo, or --popular. At most eight public repositories per capture.");
await mkdir(new URL("../.data/reports/", import.meta.url), { recursive: true });
for (const repository of repositories) {
  const adapter = /** @type {typeof fetch} */ (async (input, options) => {
    const url = new URL(String(input)), prefix = `/repos/${repository}`;
    if (url.origin !== "https://api.github.com" || !(url.pathname === prefix || url.pathname.startsWith(prefix + "/"))) throw new Error("Unexpected public GitHub source.");
    const result = await run("gh", ["api", "--hostname", "github.com", url.pathname.slice(1) + url.search], { signal: options?.signal ?? undefined, maxBuffer: 8_000_000 });
    return new Response(result.stdout, { headers: { "Content-Type": "application/json" } });
  });
  const report = await collectReport(repository, { fetch: adapter, now: Date.now(), signal: AbortSignal.timeout(24_000) });
  await writeFile(new URL(`../.data/reports/${repository.replace("/", "-")}.json`, import.meta.url), JSON.stringify(report) + "\n");
  console.log(`${repository}: ${report.coverage.mergedObserved} observed merges, ${report.coverage.detailsRead} PRs inspected`);
}
