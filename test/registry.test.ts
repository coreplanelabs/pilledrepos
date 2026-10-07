import { test } from "node:test";
import assert from "node:assert/strict";
import {
  partnerAgents,
  refreshAiRegistry,
  PARTNER_SOURCE,
  PARTNER_URL,
} from "../server/ai-registry.js";
import { registry, now } from "./fixtures.js";
const source = {
  encoding: "base64",
  sha: "a".repeat(40),
  content: btoa(
    "* **Allow Claude coding agent** will install `anthropic code agent`\n* **Allow Codex coding agent** will install `openai code agent`",
  ),
};
const read = async (path: string) => {
  if (path === PARTNER_SOURCE) return source;
  if (path === "/users/anthropic-code-agent%5Bbot%5D")
    return {
      id: 242468646,
      login: "Claude",
      type: "Bot",
      html_url: "https://github.com/apps/anthropic-code-agent",
    };
  if (path === "/users/openai-code-agent%5Bbot%5D")
    return {
      id: 242516109,
      login: "Codex",
      type: "Bot",
      html_url: "https://github.com/apps/openai-code-agent",
    };
  const a = registry.agents.find((a) => path === "/user/" + a.id);
  if (a)
    return { id: a.id, login: a.login, type: "Bot", html_url: a.accountUrl };
  throw new Error("Unexpected read");
};
const verify = async (url: string) => ({ url, sha: "b".repeat(64) });
test("only explicit coding-agent installation declarations generate candidates", () => {
  assert.equal(
    partnerAgents(
      "AI bot Alice\n* **Allow Claude coding agent** will install `anthropic code agent`",
    ).length,
    1,
  );
  assert.equal(partnerAgents("bio: AI assistant @random").length, 0);
});
test("daily refresh resolves partner identities and preserves two Codex IDs", async () => {
  const r = await refreshAiRegistry(registry, read, now, verify);
  assert.ok(r.agents.some((a) => a.id === 242468646));
  assert.equal(r.agents.filter((a) => a.name === "Codex").length, 2);
  assert.ok(r.sources.some((s) => s.url === PARTNER_URL));
  assert.equal(registry.agents.length, 3);
});
test("registered identity read failure stops refresh instead of silently retaining stale evidence", async () => {
  await assert.rejects(
    refreshAiRegistry(
      registry,
      async (p) => {
        if (p === "/user/198982749") throw new Error("Unavailable");
        return read(p);
      },
      now,
      verify,
    ),
  );
});
test("identity reassignment and source failure stop registry publication", async () => {
  await assert.rejects(
    refreshAiRegistry(
      registry,
      async (p) => (p === "/user/198982749" ? { id: 7, type: "Bot" } : read(p)),
      now,
      verify,
    ),
  );
  await assert.rejects(
    refreshAiRegistry(registry, read, now, async () => {
      throw new Error("404");
    }),
  );
});
test("changed declaration format fails closed", async () => {
  await assert.rejects(
    refreshAiRegistry(
      registry,
      async (p) =>
        p === PARTNER_SOURCE
          ? { ...source, content: btoa("New format") }
          : read(p),
      now,
      verify,
    ),
  );
});
