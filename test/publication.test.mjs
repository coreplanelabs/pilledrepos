import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  atomicJson,
  readJson,
  publishLocal,
} from "../scripts/index-storage.mjs";
function index() {
  return {
    complete: true,
    expected: 1,
    selected: ["org/repo"],
    registryId: "verified",
    capturedAt: "2026-10-07T12:00:00Z",
    reports: [
      {
        repository: "org/repo",
        capturedAt: "2026-10-07T12:00:00Z",
        collector: "merged-window-v2",
        coverage: { periodComplete: true },
      },
    ],
  };
}
test("failed partial publication preserves the previous complete pointer", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ai-pilled-test-"));
  try {
    await publishLocal(root, "old", index());
    await assert.rejects(
      publishLocal(root, "new", { ...index(), reports: [] }),
    );
    assert.deepEqual(await readJson(resolve(root, "current.json")), {
      runId: "old",
    });
    assert.equal(
      (await readJson(resolve(root, "runs/old/index.json"))).complete,
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("mixed timestamps, collectors, duplicate repos and traversal run IDs are refused", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ai-pilled-test-"));
  try {
    await assert.rejects(publishLocal(root, "../evil", index()));
    await assert.rejects(
      publishLocal(root, "new", {
        ...index(),
        reports: [{ ...index().reports[0], capturedAt: "yesterday" }],
      }),
    );
    await assert.rejects(
      publishLocal(root, "new", {
        ...index(),
        reports: [{ ...index().reports[0], collector: "legacy-preview" }],
      }),
    );
    await assert.rejects(
      publishLocal(root, "new", {
        ...index(),
        expected: 2,
        selected: ["org/repo", "org/repo"],
        reports: [...index().reports, ...index().reports],
      }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("publication write failure keeps the prior index", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ai-pilled-test-"));
  try {
    await publishLocal(root, "old", index());
    await atomicJson(
      resolve(root, "runs/blocked"),
      "file prevents directory creation",
    );
    await assert.rejects(publishLocal(root, "blocked", index()));
    assert.equal((await readJson(resolve(root, "current.json"))).runId, "old");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("pool identity mismatch cannot publish even with the right count", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ai-pilled-test-"));
  try {
    await assert.rejects(
      publishLocal(root, "new", { ...index(), selected: ["other/repo"] }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("a published dataset stays immutable even when its run is retried", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "ai-pilled-test-"));
  try {
    const first = index();
    await publishLocal(root, "same", first);
    await assert.rejects(
      publishLocal(root, "same", { ...first, registryId: "changed" }),
    );
    assert.equal(
      (await readJson(resolve(root, "runs/same/index.json"))).registryId,
      "verified",
    );
    assert.equal((await readJson(resolve(root, "current.json"))).runId, "same");
    await publishLocal(root, "same", first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
