import { readFile, readdir, writeFile } from "node:fs/promises";
import { replayReport } from "../dist/core.js";
const directory = new URL("../.data/reports/", import.meta.url), entries = [];
for (const name of await readdir(directory)) {
  if (!name.endsWith(".json")) continue;
  const report = replayReport(JSON.parse(await readFile(new URL(name, directory), "utf8"))), key = report.repository.toLowerCase(), value = JSON.stringify(report);
  entries.push({ key: `repo:${key}`, value }, { key: `snapshot:${key}:${Date.parse(report.capturedAt)}`, value, expiration_ttl: 604800 });
}
await writeFile(new URL("../.data/seed.json", import.meta.url), JSON.stringify(entries));
console.log(`Prepared ${entries.length / 2} public snapshots. Upload .data/seed.json with Wrangler KV bulk put.`);
