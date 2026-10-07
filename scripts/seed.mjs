import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { atomicJson } from "./index-storage.mjs";
import { digest } from "./github-api.mjs";
const directory = resolve(".data/seed/repolore/reports"),
  reports = [];
for (const file of await readdir(directory))
  if (file.endsWith(".json")) {
    const r = JSON.parse(await readFile(resolve(directory, file), "utf8"));
    reports.push({
      repository: r.repository,
      url: r.url,
      description: r.description,
      capturedAt: r.capturedAt,
      profile: r.profile,
      collector: "legacy-preview",
      coverage: {
        days: 90,
        periodComplete: false,
        requests: r.coverage.requests,
      },
      facts: { closed: r.facts.closed },
    });
  }
const registry = JSON.parse(await readFile("config/ai-agents.json", "utf8"));
await atomicJson(resolve(".data/preview.json"), {
  reports,
  registry,
  registryId: digest(registry),
  classificationId: digest(
    registry.agents
      .map((a) => ({ id: a.id, name: a.name }))
      .sort((a, b) => a.id - b.id),
  ),
  history: {},
  complete: false,
  pool: "Copied Repo Lore checkpoints",
  capturedAt: reports
    .map((r) => r.capturedAt)
    .sort()
    .at(-1),
});
console.log(
  `${reports.length} legacy previews. No eligible ranks or fabricated history.`,
);
