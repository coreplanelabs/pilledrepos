import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeVersion } from "../scripts/publish-package.mjs";
import { verifyLive } from "../scripts/verify-live.mjs";
const sha = "a".repeat(40);
test("merge packages get a reproducible source-bound version, distinct across checked runs", () => {
  assert.equal(mergeVersion("0.1.0", sha, 42), "0.1.0-main.42.gaaaaaaaaaaaa");
  assert.equal(
    mergeVersion("0.1.0", "b".repeat(40), 43),
    "0.1.0-main.43.gbbbbbbbbbbbb",
  );
  assert.throws(() => mergeVersion("0.1.0", sha, "0"));
  assert.throws(() => mergeVersion("0.1.0", "wrong", 42));
});
function site({ revision = sha, empty = false, badPng = false } = {}) {
  return async (url) => {
    const path = new URL(url).pathname;
    let type = "text/html",
      body =
        '<html><main id="repo-form" data-repository="org/repo">Ready</main></html>';
    if (path.startsWith("/api/")) {
      type = "application/json";
      body = JSON.stringify({
        total: empty ? 0 : 1,
        rows: empty
          ? []
          : [
              {
                repository: "org/repo",
                analysis: {
                  complete: true,
                  total: 100,
                  ai: 27,
                  accounts: 73,
                  automation: 0,
                  unknown: 0,
                },
              },
            ],
      });
    }
    if (path.endsWith(".png")) {
      type = "image/png";
      body = badPng
        ? "not an image"
        : new Uint8Array([
            137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0,
            4, 176, 0, 0, 2, 118,
          ]);
    }
    if (path.endsWith(".css")) {
      type = "text/css";
      body = "x".repeat(200);
    }
    if (path.endsWith(".js")) {
      type = "text/javascript";
      body = "x".repeat(200);
    }
    return new Response(body, {
      headers: { "Content-Type": type, "X-Pilledrepos-Revision": revision },
    });
  };
}
test("public validation proves the requested source and real payload shapes, not only HTTP 200", async () => {
  const result = await verifyLive("https://pilledrepos.com", sha, site());
  assert.equal(result.revision, sha);
  assert.equal(result.repository, "org/repo");
  assert.deepEqual(result.checks, [
    "home",
    "leaderboard",
    "repo",
    "png",
    "styles",
    "script",
  ]);
  await assert.rejects(
    verifyLive(
      "https://pilledrepos.com",
      sha,
      site({ revision: "b".repeat(40) }),
    ),
    /revision mismatch/,
  );
  await assert.rejects(
    verifyLive("https://pilledrepos.com", sha, site({ empty: true })),
  );
  await assert.rejects(
    verifyLive("https://pilledrepos.com", sha, site({ badPng: true })),
  );
});
