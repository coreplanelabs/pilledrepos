import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { registry, report } from "../.test-dist/test/fixtures.js";
import { compactDataset } from "../.server-dist/server/edge-data.js";

let directory;
const require = createRequire(import.meta.url);
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "pilledrepos-worker-test-"));
  await build({
    entryPoints: ["worker/entry.ts"],
    outfile: join(directory, "entry.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    plugins: [{
      name: "worker-wasm",
      setup(builder) {
        builder.onResolve({ filter: /\.wasm$/ }, async (args) => {
          const source = args.path.startsWith(".")
            ? resolve(args.resolveDir, args.path)
            : require.resolve(args.path);
          await copyFile(source, join(directory, "render.wasm"));
          return { path: "./render.wasm", external: true };
        });
      },
    }],
  });
});
after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function worker(redirect = false) {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: [
      { type: "ESModule", path: join(directory, "entry.js") },
      { type: "CompiledWasm", path: join(directory, "render.wasm") },
    ],
    modulesRoot: directory,
    compatibilityDate: "2026-10-07",
    cf: false,
    telemetry: { enabled: false },
    kvNamespaces: ["DATA"],
    d1Databases: ["REPOS"],
    bindings: { GITHUB_READ_TOKEN: "test-public-read" },
    serviceBindings: { ASSETS: () => new Response("unused asset") },
    outboundService: async (request) => {
      const url = new URL(request.url);
      assert.equal(url.origin, "https://api.github.com");
      assert.equal(request.headers.get("Authorization"), "Bearer test-public-read");
      if (redirect) return new Response(null, {
        status: 302,
        headers: { Location: "https://foreign.invalid/token-sink" },
      });
      if (url.pathname === "/repos/org/repo") return Response.json({
        id: 17, private: false, full_name: "org/repo", description: "Public app",
        stargazers_count: 100, language: "TypeScript",
        owner: { id: 7, login: "org", type: "Organization" },
      });
      assert.equal(url.pathname, "/graphql");
      assert.equal(request.method, "POST");
      const body = await request.json();
      assert.match(body.variables.query, /repo:org\/repo/);
      return Response.json({ data: { search: {
        issueCount: 0, nodes: [], pageInfo: { hasNextPage: false, endCursor: null },
      } } });
    },
  }));
  try {
    const dataset = compactDataset({
      reports: [{ ...report(), repositoryId: 17 }], registry,
      registryId: "digest", classificationId: "ids", history: {}, pool: "Test",
      capturedAt: registry.verifiedAt, complete: true,
    });
    const text = JSON.stringify(dataset), sha = createHash("sha256").update(text).digest("hex");
    const kv = await mf.getKVNamespace("DATA");
    await kv.put("dataset:" + sha, text);
    await kv.put("current", JSON.stringify({
      version: 1, key: "dataset:" + sha, sha, repositories: 1,
    }));
    const db = await mf.getD1Database("REPOS");
    await db.exec((await readFile("config/schema.sql", "utf8")).replaceAll("\n", " "));
    await db.prepare("INSERT INTO repos(id,name,owner_id,indexed,created_at,read_at,snapshot,status) VALUES(17,'org/repo',7,1,?,?,?,'ready')")
      .bind(registry.verifiedAt, registry.verifiedAt, JSON.stringify({ page: dataset.pages[0], agents: registry })).run();
    return { mf, db };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}
function refresh(mf) {
  return mf.dispatchFetch("https://pilledrepos.test/api/repos/refresh", {
    method: "POST", headers: {
      Origin: "https://pilledrepos.test", "Content-Type": "application/json",
    }, body: JSON.stringify({ repository: "org/repo" }),
  });
}
test("Refresh completes authenticated REST and GraphQL reads in the actual Worker runtime", async () => {
  const { mf, db } = await worker();
  try {
    const response = await refresh(mf), body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, "ready");
    assert.equal(body.repository, "org/repo");
    assert.equal(body.page.analysis.complete, true);
    assert.equal(body.page.analysis.total, 0);
    const saved = await db.prepare("SELECT indexed,read_at,snapshot FROM repos WHERE id=17").first();
    assert.equal(saved.indexed, 1);
    assert.notEqual(saved.read_at, registry.verifiedAt);
    assert.equal(JSON.parse(saved.snapshot).page.analysis.total, 0);
  } finally { await mf.dispose(); }
});
test("Worker reads reject redirects without forwarding the token or replacing saved metrics", async () => {
  const { mf, db } = await worker(true);
  try {
    const response = await refresh(mf);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "GitHub read unavailable (302)." });
    const saved = await db.prepare("SELECT indexed,read_at,snapshot FROM repos WHERE id=17").first();
    assert.equal(saved.indexed, 1);
    assert.equal(saved.read_at, registry.verifiedAt);
    assert.equal(JSON.parse(saved.snapshot).page.analysis.ai, 27);
    assert.equal(JSON.parse(saved.snapshot).page.analysis.total, 100);
  } finally { await mf.dispose(); }
});
