import { test } from "node:test";
import assert from "node:assert/strict";
import { GitHubReadError, retryRead } from "../scripts/github-api.mjs";
test("transient read failures retry the same read within a fixed bound", async () => {
  let calls = 0;
  const waits = [];
  const r = await retryRead(
    async () => {
      if (++calls < 3) throw new GitHubReadError(502);
      return { ok: true };
    },
    async (ms) => waits.push(ms),
  );
  assert.equal(r.ok, true);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
});
test("access refusals and semantic capture failures do not retry", async () => {
  for (const error of [
    new GitHubReadError(403),
    new GitHubReadError(404),
    new Error("Count mismatch"),
  ]) {
    let calls = 0;
    await assert.rejects(
      retryRead(
        async () => {
          calls++;
          throw error;
        },
        async () => {},
      ),
    );
    assert.equal(calls, 1);
  }
});
test("repeated service failure stops after three attempts", async () => {
  let calls = 0;
  await assert.rejects(
    retryRead(
      async () => {
        calls++;
        throw new GitHubReadError(503);
      },
      async () => {},
    ),
  );
  assert.equal(calls, 3);
});
