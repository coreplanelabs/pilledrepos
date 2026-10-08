import assert from "node:assert/strict";
export async function verifyLive(origin, sha, read = fetch) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  async function get(path, type) {
    const r = await read(origin + path, {
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(r.status, 200, "Public request failed: " + path);
    assert.equal(
      r.headers.get("X-Pilledrepos-Revision"),
      sha,
      "Live revision mismatch: " + path,
    );
    assert.match(r.headers.get("Content-Type") ?? "", type);
    return r;
  }
  const html = await (await get("/", /text\/html/)).text();
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
