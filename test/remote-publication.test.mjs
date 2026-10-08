import { test } from "node:test";
import assert from "node:assert/strict";
import { publishSnapshot } from "../scripts/publish-index.mjs";
import { aiPage } from "../.server-dist/src/ai.js";
const reg = {
  version: 1,
  verifiedAt: "2026-10-07T12:00:00Z",
  sources: [],
  agents: [
    {
      id: 1,
      login: "agent",
      aliases: [],
      name: "Agent",
      source: "https://docs.github.com/example",
      accountUrl: "https://github.com/apps/agent",
    },
  ],
};
function dataset() {
  return {
    kind: "indexed",
    expected: 1000,
    selected: Array.from({ length: 1000 }, (_, i) => `org/r${i}`),
    pages: Array.from({ length: 1000 }, (_, i) => ({
      repository: `org/r${i}`,
      url: `https://github.com/org/r${i}`,
      description: "",
      capturedAt: reg.verifiedAt,
      collector: "merged-window-v2",
      analysis: {
        total: 0,
        ai: 0,
        accounts: 0,
        automation: 0,
        unknown: 0,
        share: null,
        eligible: false,
        complete: true,
        agents: [],
        registryAt: reg.verifiedAt,
      },
    })),
    registry: reg,
    registryId: "version",
    classificationId: "ids",
    pool: "1000 repos",
    capturedAt: reg.verifiedAt,
    history: {},
    complete: true,
  };
}
test("remote dataset must pass readback before the public pointer changes", async () => {
  const old = JSON.stringify({ key: "dataset:old", sha: "old" }),
    m = new Map([["current", old]]);
  const store = {
    get: async (k) => (k.startsWith("dataset:") ? null : (m.get(k) ?? null)),
    put: async (k, v) => m.set(k, v),
  };
  await assert.rejects(publishSnapshot(dataset(), store));
  assert.equal(m.get("current"), old);
});
test("verified publication retains a prior complete key for edge-region fallback", async () => {
  const m = new Map([
    ["current", JSON.stringify({ key: "dataset:old", sha: "old" })],
  ]);
  const r = await publishSnapshot(dataset(), {
    get: async (k) => m.get(k) ?? null,
    put: async (k, v) => {
      m.set(k, v);
    },
  });
  assert.equal(r.previousKey, "dataset:old");
  assert.equal(JSON.parse(m.get("current")).key, r.key);
  assert.equal(
    (
      await publishSnapshot(dataset(), {
        get: async (k) => m.get(k) ?? null,
        put: async () => {
          throw new Error("Unexpected rewrite");
        },
      })
    ).unchanged,
    true,
  );
});

test("a small complete fixed index publishes, while partial or discovery cohorts do not", async () => {
  const d = dataset();
  d.pages = d.pages.slice(0, 2);
  d.selected = d.selected.slice(0, 2);
  d.expected = 2;
  const map = new Map(),
    store = {
      get: async (k) => map.get(k) ?? null,
      put: async (k, v) => map.set(k, v),
    };
  assert.equal((await publishSnapshot(d, store)).repositories, 2);
  await assert.rejects(
    publishSnapshot({ ...d, expected: 3 }, store),
    /complete indexed cohort/,
  );
  await assert.rejects(
    publishSnapshot({ ...d, kind: "discovery" }, store),
    /complete indexed cohort/,
  );
});
