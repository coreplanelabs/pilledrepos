import { test } from "node:test";
import assert from "node:assert/strict";
import { GitHubReadError } from "../scripts/github-api.mjs";
import { RepositoryRefused } from "../scripts/repository-availability.mjs";
import { resolveIndexedIdentity } from "../scripts/indexed-identity.mjs";

test("a stored name that still resolves to the tracked id is used unchanged", async () => {
  const value = { id: 42, full_name: "org/repo" };
  const resolved = await resolveIndexedIdentity({
    read: async () => {
      throw new Error("the tracked id already matched");
    },
    requested: "org/repo",
    trackedId: 42,
    value,
  });
  assert.equal(resolved, value);
});

test("a stored name reused by another repository follows the tracked stable id", async () => {
  const calls = [];
  const moved = {
    id: 837911756,
    full_name: "feder-cr/Jobs_Applier_AI_Agent_AIHawk",
  };
  const resolved = await resolveIndexedIdentity({
    read: async (path) => {
      calls.push(path);
      return moved;
    },
    requested: "feder-cr/invisible_dots",
    trackedId: 837911756,
    value: { id: 850759104, full_name: "feder-cr/invisible_dots" },
  });
  assert.deepEqual(calls, ["/repositories/837911756"]);
  assert.equal(resolved.full_name, "feder-cr/Jobs_Applier_AI_Agent_AIHawk");
  assert.equal(resolved.id, 837911756);
});

test("a refused stable-id read names the member and preserves the last page", async () => {
  for (const status of [403, 404, 410]) {
    await assert.rejects(
      resolveIndexedIdentity({
        read: async () => {
          throw new GitHubReadError(status);
        },
        requested: "feder-cr/invisible_dots",
        trackedId: 837911756,
        value: { id: 850759104 },
      }),
      (error) =>
        error instanceof RepositoryRefused &&
        error.repository === "feder-cr/invisible_dots" &&
        error.status === status,
    );
  }
});

test("a stable-id read that still mismatches fails closed", async () => {
  await assert.rejects(
    resolveIndexedIdentity({
      read: async () => ({ id: 999 }),
      requested: "feder-cr/invisible_dots",
      trackedId: 837911756,
      value: { id: 850759104 },
    }),
    /Indexed repository identity changed/,
  );
});
