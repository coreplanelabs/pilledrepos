import { test } from "node:test";
import assert from "node:assert/strict";
import { retryCapture } from "../scripts/capture-retry.mjs";
test("a capture that fails on a transient read then succeeds is retried, not failed", async () => {
  let calls = 0;
  const reverted = [];
  const waits = [];
  const result = await retryCapture(
    async () => {
      if (++calls < 2)
        throw new Error("Merge search scope or pagination changed; retry.");
      return { ok: true };
    },
    {
      pause: async (ms) => waits.push(ms),
      onRetry: async (_error, attempt) => reverted.push(attempt),
    },
  );
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
  assert.deepEqual(reverted, [1]);
  assert.deepEqual(waits, [1000]);
});
test("the cached reads are dropped before each retry so an inconsistent page is re-read", async () => {
  const order = [];
  let calls = 0;
  await retryCapture(
    async () => {
      if (++calls < 3) throw new Error("fetch failed");
      return "done";
    },
    {
      onRetry: async () => order.push("clear-cache"),
      pause: async () => order.push("wait"),
    },
  );
  assert.deepEqual(order, ["clear-cache", "wait", "clear-cache", "wait"]);
});
test("a persistent provider failure still fails closed after the bounded attempts", async () => {
  let calls = 0;
  await assert.rejects(
    retryCapture(
      async () => {
        calls++;
        throw new Error("GitHub read failed (403)");
      },
      { pause: async () => {} },
    ),
  );
  assert.equal(calls, 4);
});
