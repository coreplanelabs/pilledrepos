import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyLive } from "../scripts/verify-live.mjs";
const sha = "a".repeat(40);
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
function clock() {
  let elapsed = 0;
  return {
    now: () => elapsed,
    wait: async (ms) => {
      elapsed += ms;
    },
    elapsed: () => elapsed,
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
  const stale = clock();
  await assert.rejects(
    verifyLive(
      "https://pilledrepos.com",
      sha,
      site({ revision: "b".repeat(40) }),
      { wait: stale.wait, now: stale.now },
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
test("a stale edge revision is waited out before the strict checks", async () => {
  const previous = "b".repeat(40);
  const stale = site({ revision: previous });
  const fresh = site();
  let calls = 0;
  const read = async (url, init) => {
    calls += 1;
    return calls <= 2 ? stale(url, init) : fresh(url, init);
  };
  const c = clock();
  const result = await verifyLive("https://pilledrepos.com", sha, read, {
    intervalMs: 1000,
    timeoutMs: 60000,
    wait: c.wait,
    now: c.now,
  });
  assert.equal(result.revision, sha);
  assert.equal(calls, 8);
  assert.equal(c.elapsed(), 2000);
});
test("an edge that never serves the new revision fails inside the bounded wait", async () => {
  const previous = "b".repeat(40);
  let calls = 0;
  const read = async (url, init) => {
    calls += 1;
    return site({ revision: previous })(url, init);
  };
  const c = clock();
  await assert.rejects(
    verifyLive("https://pilledrepos.com", sha, read, {
      intervalMs: 1000,
      timeoutMs: 5000,
      wait: c.wait,
      now: c.now,
    }),
    /Live revision mismatch: \/ \(observed b{40} after 5000ms\)/,
  );
  assert.equal(calls, 6);
  assert.equal(c.elapsed(), 5000);
});
