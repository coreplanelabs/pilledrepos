import { test } from "node:test";
import assert from "node:assert/strict";
import { GitHubReadError } from "../scripts/github-api.mjs";
import {
  RepositoryRefused,
  RepositoryRenamed,
  poolWithoutRefused,
  refusalStatus,
  refusedBound,
  refusedSummary,
} from "../scripts/repository-availability.mjs";
test("a provider refusal is separated from a transient read failure", () => {
  for (const status of [403, 404, 410])
    assert.equal(refusalStatus(new GitHubReadError(status)), status);
  for (const error of [
    new GitHubReadError(429),
    new GitHubReadError(500),
    new Error("Merge search counts changed during capture; retry."),
  ])
    assert.equal(refusalStatus(error), null);
});
test("the published pool drops only the members the provider refuses", () => {
  const selected = ["a/one", "B/two", "c/three"];
  assert.deepEqual(poolWithoutRefused(selected, []), selected);
  assert.deepEqual(
    poolWithoutRefused(selected, [
      { repository: "b/TWO", status: 404 },
      { repository: "a/one", status: 403 },
    ]),
    ["c/three"],
  );
});
test("a refusal share this large stops the run instead of shrinking the index", () => {
  assert.equal(refusedBound(0), 25);
  assert.equal(refusedBound(2401), 25);
  assert.equal(refusedBound(10000), 100);
  assert.ok(4 <= refusedBound(2401));
  assert.ok(2401 > refusedBound(2401));
});
test("a refused member names the repository and the provider status", () => {
  const refused = new RepositoryRefused("experientiallabs/experiential", 404);
  assert.equal(refused.repository, "experientiallabs/experiential");
  assert.equal(refused.status, 404);
  assert.match(refused.message, /will not serve this repository \(404\)/);
  assert.equal(
    refusedSummary([refused, new RepositoryRefused("PCA-SDS/operis", 404)]),
    "experientiallabs/experiential (404), PCA-SDS/operis (404)",
  );
});

test("a member whose indexed name now resolves to another repository is named and left out", () => {
  const renamed = new RepositoryRenamed(
    "feder-cr/invisible_dots",
    837911756,
    850759104,
  );
  assert.equal(renamed.repository, "feder-cr/invisible_dots");
  assert.match(renamed.message, /850759104/);
  assert.match(renamed.message, /837911756/);
  assert.deepEqual(
    poolWithoutRefused(
      ["feder-cr/invisible_dots", "c/three"],
      [{ repository: renamed.repository, status: renamed.status }],
    ),
    ["c/three"],
  );
  assert.equal(refusedSummary([renamed]), "feder-cr/invisible_dots (identity changed)");
});
