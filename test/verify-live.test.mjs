import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyLive, REVISION_HEADER } from "../scripts/verify-live.mjs";

const ORIGIN = "https://pilledrepos.com";
const PREVIOUS = "4077c6ac0ab37bfc542464e7ec918c0fedfe3823";
const PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 4, 176,
  0, 0, 2, 118,
]);

function clock() {
  let t = 0;
  return { now: () => t, advance: (ms) => (t += ms) };
}

// A fake edge. `lagPath` serves `PREVIOUS` for its first `lagPolls` responses,
// then serves `sha`; every other path serves `sha` at once.
function edge(sha, { lagPath = null, lagPolls = 0 } = {}) {
  const counts = new Map();
  const routes = {
    "/": { type: "text/html", body: '<main></main><form id="repo-form"></form>' },
    "/api/leaderboard?limit=1": {
      type: "application/json",
      body: JSON.stringify({
        total: 1,
        rows: [
          {
            repository: "org/a",
            analysis: { complete: true, total: 4, ai: 1, accounts: 1, automation: 1, unknown: 1 },
          },
        ],
      }),
    },
    "/org/a": { type: "text/html", body: '<div data-repository="org/a"></div>' },
    "/_og/org/a.png": { type: "image/png", body: PNG },
    "/styles.css": { type: "text/css", body: "x".repeat(101) },
    "/app.js": { type: "text/javascript", body: "y".repeat(101) },
  };
  return async (url) => {
    const path = url.replace(ORIGIN, "");
    const route = routes[path];
    assert.ok(route, "unexpected path " + path);
    const n = (counts.get(path) ?? 0) + 1;
    counts.set(path, n);
    const revision = path === lagPath && n <= lagPolls ? PREVIOUS : sha;
    return new Response(route.body, {
      status: 200,
      headers: { [REVISION_HEADER]: revision, "Content-Type": route.type },
    });
  };
}

test("a subpath that lags the home revision is waited for, not failed", async () => {
  const sha = "a".repeat(40);
  const c = clock();
  const waits = [];
  const result = await verifyLive(ORIGIN, sha, edge(sha, { lagPath: "/_og/org/a.png", lagPolls: 2 }), {
    wait: async (ms) => {
      waits.push(ms);
      c.advance(ms);
    },
    now: c.now,
  });
  assert.equal(result.revision, sha);
  assert.deepEqual(waits, [2000, 2000]);
});

test("a path that never serves the new revision still fails the check", async () => {
  const sha = "a".repeat(40);
  const c = clock();
  await assert.rejects(
    verifyLive(ORIGIN, sha, edge(sha, { lagPath: "/_og/org/a.png", lagPolls: Infinity }), {
      wait: async (ms) => c.advance(ms),
      now: c.now,
    }),
    /Live revision mismatch: \/_og\/org\/a\.png \(observed 4077c6ac0ab37bfc542464e7ec918c0fedfe3823 after 60000ms\)/,
  );
});

test("the home path is still waited for until it serves the new revision", async () => {
  const sha = "a".repeat(40);
  const c = clock();
  const result = await verifyLive(ORIGIN, sha, edge(sha, { lagPath: "/", lagPolls: 1 }), {
    wait: async (ms) => c.advance(ms),
    now: c.now,
  });
  assert.equal(result.revision, sha);
});
