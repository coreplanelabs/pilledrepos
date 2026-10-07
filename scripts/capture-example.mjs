import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { collectReport, parseRepository } from "../dist/core.js";

// A maintainer's explicit public-data capture, not a runtime credential fallback.
const repository = parseRepository(process.argv[2] ?? "");
if (!["pytest-dev/pytest", "vitejs/vite"].includes(repository)) throw new Error("This capture is reserved for the two public example repositories.");
const run = promisify(execFile);
const started = performance.now();
const adapter = /** @type {typeof fetch} */ (async (url, options) => {
  const address = new URL(String(url));
  if (address.origin !== "https://api.github.com" || !address.pathname.startsWith(`/repos/${repository}`)) throw new Error("Unexpected public source");
  const result = await run("gh", ["api", "--hostname", "github.com", address.pathname.slice(1) + address.search], { signal: options?.signal ?? undefined, maxBuffer: 8_000_000 });
  return new Response(result.stdout, { headers: { "Content-Type": "application/json" } });
});
const report = await collectReport(repository, { fetch: adapter, now: Date.now(), signal: AbortSignal.timeout(24_000) });
await mkdir(new URL("../public/examples/", import.meta.url), { recursive: true });
await mkdir(new URL("../receipts/", import.meta.url), { recursive: true });
const filename = repository.replace("/", "-");
await writeFile(new URL(`../public/examples/${filename}.json`, import.meta.url), JSON.stringify(report, null, 2) + "\n");
const receipt = { repository, capturedAt: report.capturedAt, elapsedMs: Math.round(performance.now() - started),
  source: "Explicit read-only capture using the existing GitHub CLI authentication; public repository only", coverage: report.coverage };
await writeFile(new URL(`../receipts/${filename}-capture.json`, import.meta.url), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));
