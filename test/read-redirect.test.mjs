import { test } from "node:test";
import assert from "node:assert/strict";
import { GitHubReadError, githubReader } from "../scripts/github-api.mjs";
function stubFetch(handler) {
  const calls = [],
    original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
      delete process.env.AI_PILLED_GITHUB_TOKEN;
    },
  };
}
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
test("a renamed repository read follows the rename redirect on the same host", async () => {
  process.env.AI_PILLED_GITHUB_TOKEN = "test-token";
  const { calls, restore } = stubFetch((url) =>
    url === "https://api.github.com/repos/GrayCodeAI/rho"
      ? new Response(null, {
          status: 301,
          headers: { location: "https://api.github.com/repositories/1225263558" },
        })
      : json({ id: 1225263558, full_name: "GrayCodeAI/reflect" }),
  );
  try {
    const meta = await githubReader()("/repos/GrayCodeAI/rho");
    assert.equal(meta.full_name, "GrayCodeAI/reflect");
    assert.deepEqual(
      calls.map((c) => c.url),
      [
        "https://api.github.com/repos/GrayCodeAI/rho",
        "https://api.github.com/repositories/1225263558",
      ],
    );
    for (const call of calls)
      assert.equal(call.options.headers.Authorization, "Bearer test-token");
  } finally {
    restore();
  }
});
test("a read that redirects off host is refused without a second request", async () => {
  process.env.AI_PILLED_GITHUB_TOKEN = "test-token";
  const { calls, restore } = stubFetch(
    () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://token-sink.invalid/collect" },
      }),
  );
  try {
    await assert.rejects(
      githubReader()("/repos/org/name"),
      (error) =>
        error instanceof GitHubReadError &&
        error.status === 302 &&
        error.transient === false &&
        /moves away from api.github.com/.test(error.message),
    );
    assert.equal(calls.length, 1);
  } finally {
    restore();
  }
});
test("a refused read keeps the provider's own reason", async () => {
  process.env.AI_PILLED_GITHUB_TOKEN = "test-token";
  const { calls, restore } = stubFetch(() =>
    json({ message: "API rate limit exceeded for user ID 1." }, 403),
  );
  try {
    await assert.rejects(
      githubReader()("/repos/coreplanelabs/cli"),
      (error) =>
        error instanceof GitHubReadError &&
        error.status === 403 &&
        /API rate limit exceeded/.test(error.message),
    );
    assert.equal(calls.length, 1);
  } finally {
    restore();
  }
});
test("a search read never follows a redirect", async () => {
  process.env.AI_PILLED_GITHUB_TOKEN = "test-token";
  const { calls, restore } = stubFetch(
    () =>
      new Response(null, {
        status: 301,
        headers: { location: "https://api.github.com/repositories/1" },
      }),
  );
  try {
    await assert.rejects(
      githubReader()("/graphql", { query: "{ rateLimit { remaining } }" }),
      (error) => error instanceof GitHubReadError && error.status === 301,
    );
    assert.equal(calls.length, 1);
  } finally {
    restore();
  }
});
