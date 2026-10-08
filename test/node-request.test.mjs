import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { nodeRequest } from "../scripts/node-request.mjs";
import { createHandler } from "../.server-dist/server/http.js";
import { registry, report } from "../.test-dist/test/fixtures.js";

test("real HTTP repo submissions forward JSON, Origin, and both repository formats", async () => {
  const seen = [];
  const handler = createHandler({
    dataset: async () => ({
      reports: [report()],
      registry,
      registryId: "digest",
      classificationId: "ids",
      history: {},
      pool: "ICP seed",
      capturedAt: report().capturedAt,
      complete: true,
    }),
    assets: async () => new Response(""),
    png: async () => new Uint8Array(),
    catalog: {
      extras: async () => [],
      add: async (name) => {
        seen.push(name);
        return { status: "queued", repository: name };
      },
    },
  });
  const server = createServer(async (req, res) => {
    const response = await handler(
      await nodeRequest(req, "http://127.0.0.1:" + server.address().port),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  try {
    for (const repository of [
      "coreplanelabs/switchboard",
      "https://github.com/coreplanelabs/switchboard",
    ]) {
      const r = await fetch(origin + "/api/repos", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ repository }),
      });
      assert.equal(r.status, 202);
      assert.equal((await r.json()).repository, "coreplanelabs/switchboard");
    }
    const crossOrigin = await fetch(origin + "/api/repos", {
      method: "POST",
      headers: {
        Origin: "https://elsewhere.example",
        "Content-Type": "application/json",
      },
      body: '{"repository":"org/repo"}',
    });
    assert.equal(crossOrigin.status, 403);
    assert.match((await crossOrigin.json()).error, /repo form/);
    assert.deepEqual(seen, [
      "coreplanelabs/switchboard",
      "coreplanelabs/switchboard",
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
});
test("a newer snapshot for the same stable repo ID replaces the old name rather than duplicating the index row", async () => {
  const { aiPage } = await import("../.server-dist/src/ai.js");
  const original = { ...report(100, 27, "org/old"), repositoryId: 17 };
  const renamed = { ...report(100, 27, "org/new"), repositoryId: 17 };
  const h = createHandler({
    dataset: async () => ({
      reports: [original],
      registry,
      registryId: "ids",
      classificationId: "ids",
      history: {},
      pool: "Tracked",
      capturedAt: original.capturedAt,
      complete: true,
    }),
    assets: async () => new Response(""),
    png: async () => new Uint8Array(),
    catalog: { extras: async () => [aiPage(renamed, registry)] },
  });
  const r = await (
    await h(new Request("http://localhost/api/leaderboard"))
  ).json();
  assert.equal(r.total, 1);
  assert.equal(r.rows[0].repository, "org/new");
});
