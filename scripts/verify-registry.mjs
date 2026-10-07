import { readFile, writeFile } from "node:fs/promises";
import { refreshAiRegistry } from "../.server-dist/server/ai-registry.js";
import { parseRegistry } from "../.server-dist/src/ai.js";
import { githubReader, verifySource, digest } from "./github-api.mjs";
const path = new URL("../config/ai-agents.json", import.meta.url),
  seed = parseRegistry(JSON.parse(await readFile(path, "utf8")));
const registry = await refreshAiRegistry(
  seed,
  githubReader(process.argv.includes("--use-gh")),
  Date.now(),
  verifySource,
);
await writeFile(path, JSON.stringify(registry, null, 2) + "\n");
console.log(
  `Verified ${registry.agents.length} accounts. Registry ${digest(registry).slice(0, 12)}.`,
);
