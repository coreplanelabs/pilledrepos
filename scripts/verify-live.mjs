import assert from "node:assert/strict";
export const REVISION_HEADER = "X-Pilledrepos-Revision";
// Activation is proven through the Cloudflare API, but the public edge can keep
// serving the previous Worker version for a short time after it. Wait for the
// new revision to reach the edge before the strict per-path checks, and fail if
// it does not converge inside this window.
export const PROPAGATION_TIMEOUT_MS = 60000;
export const PROPAGATION_INTERVAL_MS = 2000;
export async function verifyLive(
  origin,
  sha,
  read = fetch,
  {
    timeoutMs = PROPAGATION_TIMEOUT_MS,
    intervalMs = PROPAGATION_INTERVAL_MS,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = () => Date.now(),
  } = {},
) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  async function load(path) {
    return read(origin + path, {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
  }
  async function get(path, type) {
    const r = await load(path);
    assert.equal(r.status, 200, "Public request failed: " + path);
    assert.equal(
      r.headers.get(REVISION_HEADER),
      sha,
      "Live revision mismatch: " + path,
    );
    assert.match(r.headers.get("Content-Type") ?? "", type);
    return r;
  }
  const deadline = now() + timeoutMs;
  let home, served, status;
  for (;;) {
    home = await load("/");
    status = home.status;
    served = home.headers.get(REVISION_HEADER);
    if ((status === 200 && served === sha) || now() >= deadline) break;
    await wait(intervalMs);
  }
  assert.equal(status, 200, "Public request failed: /");
  assert.equal(
    served,
    sha,
    "Live revision mismatch: / (observed " +
      (served ?? "no revision header") +
      " after " +
      timeoutMs +
      "ms)",
  );
  assert.match(home.headers.get("Content-Type") ?? "", /text\/html/);
  const html = await home.text();
  assert.match(html, /<main/);
  assert.match(html, /id="repo-form"/);
  const data = await (
    await get("/api/leaderboard?limit=1", /application\/json/)
  ).json();
  assert.ok(Number.isSafeInteger(data.total) && data.total > 0);
  const row = data.rows?.[0];
  assert.ok(row?.analysis?.complete && row.analysis.total > 0);
  assert.match(row.repository, /^[\w.-]+\/[\w.-]+$/);
  assert.equal(
    row.analysis.ai +
      row.analysis.accounts +
      row.analysis.automation +
      row.analysis.unknown,
    row.analysis.total,
  );
  const repo =
    "/" + row.repository.split("/").map(encodeURIComponent).join("/");
  const detail = await (await get(repo, /text\/html/)).text();
  assert.match(detail, /data-repository=/);
  const image = new Uint8Array(
    await (await get("/_og" + repo + ".png", /image\/png/)).arrayBuffer(),
  );
  assert.deepEqual([...image.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(image.length >= 24);
  assert.equal(new TextDecoder().decode(image.slice(12, 16)), "IHDR");
  const dimensions = new DataView(
    image.buffer,
    image.byteOffset,
    image.byteLength,
  );
  assert.equal(dimensions.getUint32(16), 1200);
  assert.equal(dimensions.getUint32(20), 630);
  assert.ok(
    (await (await get("/styles.css", /text\/css/)).text()).length > 100,
  );
  assert.ok(
    (await (await get("/app.js", /(java|ecma)script/)).text()).length > 100,
  );
  return {
    revision: sha,
    repository: row.repository,
    total: data.total,
    checks: ["home", "leaderboard", "repo", "png", "styles", "script"],
  };
}
