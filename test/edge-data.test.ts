import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compactDataset,
  edgeDatasetReader,
  sha256,
  validatePage,
  type DataStore,
} from "../server/edge-data.js";
import { aiPage } from "../src/ai.js";
import { registry, report } from "./fixtures.js";
function dataset() {
  return {
    reports: Array.from({ length: 1000 }, (_, i) =>
      report(100, 27, `org/repo-${i}`),
    ),
    registry,
    registryId: "verified",
    classificationId: "ids",
    history: {},
    pool: "1000 public repos",
    capturedAt: report().capturedAt,
    complete: true,
  };
}
function store(map: Map<string, string>): DataStore {
  return {
    get: async (k) => map.get(k) ?? null,
    put: async (k, v) => {
      map.set(k, v);
    },
  };
}
test("compact data preserves counts and evidence without raw PR bodies", () => {
  const d = compactDataset(dataset());
  assert.equal(d.pages!.length, 1000);
  assert.equal(d.pages![0].analysis.ai, 27);
  assert.equal(d.pages![0].analysis.agents[0].evidence.length, 6);
  assert.equal(d.reports, undefined);
  assert.doesNotMatch(JSON.stringify(d), /headSha|facts/);
});
test("compact validation rejects altered ratios, unverified identities, and foreign PR URLs", () => {
  const p = aiPage(report(), registry);
  assert.throws(() =>
    validatePage({ ...p, analysis: { ...p.analysis, share: 99 } }, registry),
  );
  const other = structuredClone(p);
  other.analysis.agents[0].identities[0].id = 999;
  assert.throws(() => validatePage(other, registry));
  const foreign = structuredClone(p);
  foreign.analysis.agents[0].evidence[0].url = "https://evil.test";
  assert.throws(() => validatePage(foreign, registry));
});
test("cold edge uses prior complete data when KV pointer arrives before its new value", async () => {
  const text = JSON.stringify(compactDataset(dataset())),
    sha = await sha256(text),
    next = "a".repeat(64),
    m = new Map([
      ["dataset:" + sha, text],
      [
        "current",
        JSON.stringify({
          version: 1,
          key: "dataset:" + next,
          sha: next,
          previousKey: "dataset:" + sha,
          previousSha: sha,
          repositories: 10000,
          previousRepositories: 1000,
          capturedAt: report().capturedAt,
        }),
      ],
    ]);
  const read = edgeDatasetReader(store(m));
  assert.equal((await read()).pages!.length, 1000);
});
test("warm edge keeps the last complete index on pointer corruption or read failure", async () => {
  const text = JSON.stringify(compactDataset(dataset())),
    sha = await sha256(text),
    map = new Map([
      ["dataset:" + sha, text],
      [
        "current",
        JSON.stringify({
          version: 1,
          key: "dataset:" + sha,
          sha,
          repositories: 1000,
          capturedAt: report().capturedAt,
        }),
      ],
    ]);
  let now = 0;
  const read = edgeDatasetReader(store(map), () => now),
    first = await read();
  map.set("current", "broken");
  now = 31000;
  assert.equal(await read(), first);
});
test("cold edge rejects tampered or incomplete data instead of showing partial ranks", async () => {
  const text = JSON.stringify({
      ...compactDataset(dataset()),
      complete: false,
    }),
    sha = await sha256(text),
    map = new Map([
      ["dataset:" + sha, text],
      [
        "current",
        JSON.stringify({
          version: 1,
          key: "dataset:" + sha,
          sha,
          repositories: 1000,
        }),
      ],
    ]);
  await assert.rejects(edgeDatasetReader(store(map))());
});
