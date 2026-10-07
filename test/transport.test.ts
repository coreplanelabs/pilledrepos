import test from "node:test";
import assert from "node:assert/strict";
import { edgeFetcher } from "../server/transport.js";
test("edge transport uses supported manual mode and refuses a credential-bearing redirect", async () => {
  let calls = 0;
  const transport = edgeFetcher((async (_input, init) => {
    calls++; assert.equal(init?.redirect, "manual");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-secret");
    return new Response(null, { status: 302, headers: { Location: "https://evil.test/collect" } });
  }) as typeof fetch);
  await assert.rejects(transport("https://api.github.com/repos/test/repo", { redirect: "error", headers: { Authorization: "Bearer test-secret" } }), /redirect refused/);
  assert.equal(calls, 1);
});
test("successful edge reads preserve the response and manual callers can inspect their own redirect", async () => {
  const ok = edgeFetcher((async () => new Response("photo")) as typeof fetch);
  assert.equal(await (await ok("https://avatars.githubusercontent.com/u/42", { redirect: "error" })).text(), "photo");
  const manual = edgeFetcher((async () => new Response(null, { status: 301 })) as typeof fetch);
  assert.equal((await manual("https://example.test", { redirect: "manual" })).status, 301);
});
