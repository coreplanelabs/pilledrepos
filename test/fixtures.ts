import type { Report, Pull } from "../src/core.js";
import type { AiRegistry } from "../src/ai.js";
export const now = Date.parse("2026-10-07T12:00:00Z");
export const registry: AiRegistry = {
  version: 1,
  verifiedAt: new Date(now).toISOString(),
  sources: [],
  agents: [
    {
      id: 198982749,
      login: "Copilot",
      aliases: ["copilot-swe-agent[bot]"],
      name: "Copilot",
      source: "https://docs.github.com/en/copilot",
      accountUrl: "https://github.com/apps/copilot-swe-agent",
    },
    {
      id: 199175422,
      login: "chatgpt-codex-connector[bot]",
      aliases: [],
      name: "Codex",
      source: "https://learn.chatgpt.com/docs/third-party/github",
      accountUrl: "https://github.com/apps/chatgpt-codex-connector",
    },
    {
      id: 242516109,
      login: "Codex",
      aliases: ["openai-code-agent[bot]"],
      name: "Codex",
      source:
        "https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents",
      accountUrl: "https://github.com/apps/openai-code-agent",
    },
  ],
};
export function pull(
  number: number,
  id = 1,
  bot = false,
  login = "person",
): Pull {
  return {
    number,
    title: "A change",
    url: `https://github.com/org/repo/pull/${number}`,
    author: { id, bot, login },
    createdAt: now - 4000,
    updatedAt: now - 1000,
    mergedAt: now - 2000,
    draft: false,
    association: "UNKNOWN",
    headSha: "a".repeat(40),
  };
}
export function report(count = 100, ai = 27, repository = "org/repo"): Report {
  return {
    repository,
    url: "https://github.com/" + repository,
    description: "An example",
    capturedAt: new Date(now).toISOString(),
    collector: "merged-window-v2",
    coverage: { days: 90, periodComplete: true, requests: 2 },
    facts: {
      closed: Array.from({ length: count }, (_, i) => ({
        ...pull(i + 1, i < ai ? 198982749 : 1, i < ai),
        url: `https://github.com/${repository}/pull/${i + 1}`,
      })),
    },
  };
}
