import {
  parseRegistry,
  type AiAgent,
  type AiRegistry,
  type Source,
} from "../src/ai.js";
export const PARTNER_SOURCE =
  "/repos/github/docs/contents/content/copilot/concepts/agents/about-third-party-coding-agents.md";
export const PARTNER_URL =
  "https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents";
/** Names are used only to resolve explicit install declarations, never to classify observed bots. */
export function partnerAgents(
  markdown: string,
): { login: string; name: string; source: string }[] {
  return [
    ...markdown.matchAll(
      /\*\*Allow ([a-z0-9 -]+) coding agent\*\* will install `([a-z0-9 -]+)`/gi,
    ),
  ].map((m) => ({
    login: m[2].trim().replace(/\s+/g, "-") + "[bot]",
    name: m[1].trim(),
    source: PARTNER_URL,
  }));
}
export async function refreshAiRegistry(
  seed: AiRegistry,
  read: (path: string) => Promise<unknown>,
  now: number,
  verifySource: (url: string) => Promise<Source>,
): Promise<AiRegistry> {
  parseRegistry(seed);
  const raw = (await read(PARTNER_SOURCE)) as {
    content?: string;
    sha?: string;
    encoding?: string;
  };
  if (
    raw.encoding !== "base64" ||
    !raw.content ||
    !raw.sha ||
    raw.content.length > 500000
  )
    throw new Error("Cannot read the official agent declarations.");
  const discovered = partnerAgents(atob(raw.content.replace(/\s/g, "")));
  if (!discovered.length)
    throw new Error("GitHub agent declarations changed; review the parser.");
  const verified = new Map<number, AiAgent>();
  // ID endpoint avoids display-login versus GraphQL-alias differences. A failed check stops this run.
  for (const agent of seed.agents) {
    const a = (await read("/user/" + agent.id)) as {
      id: number;
      login: string;
      type: string;
      html_url: string;
    };
    if (
      a.id !== agent.id ||
      a.type !== "Bot" ||
      a.html_url !== agent.accountUrl
    )
      throw new Error(`Account evidence changed: ${agent.name}.`);
    verified.set(a.id, { ...agent, login: a.login });
  }
  for (const entry of discovered) {
    const a = (await read("/users/" + encodeURIComponent(entry.login))) as {
      id: number;
      login: string;
      type: string;
      html_url: string;
    };
    const slug = entry.login.replace(/\[bot\]$/, "");
    if (
      !Number.isSafeInteger(a.id) ||
      a.id < 1 ||
      a.type !== "Bot" ||
      a.html_url !== `https://github.com/apps/${slug}`
    )
      throw new Error(`New agent identity cannot be verified: ${entry.name}.`);
    if (!verified.has(a.id))
      verified.set(a.id, {
        ...entry,
        id: a.id,
        login: a.login,
        aliases: [entry.login],
        accountUrl: a.html_url,
      });
  }
  const sources: Source[] = [{ url: PARTNER_URL, sha: raw.sha }];
  for (const url of new Set([...verified.values()].map((a) => a.source)))
    if (url !== PARTNER_URL) sources.push(await verifySource(url));
  return parseRegistry({
    version: 1,
    verifiedAt: new Date(now).toISOString(),
    agents: [...verified.values()],
    sources,
  });
}
