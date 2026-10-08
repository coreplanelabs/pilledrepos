import {
  parseRepository,
  type Author,
  type Report,
  type Evidence,
} from "./core.js";
export type AiAgent = {
  id: number;
  login: string;
  aliases: string[];
  name: string;
  source: string;
  accountUrl: string;
};
export type Source = { url: string; sha: string };
export type AiRegistry = {
  version: 1;
  verifiedAt: string;
  agents: AiAgent[];
  sources: Source[];
};
export type AiAnalysis = {
  total: number;
  ai: number;
  accounts: number;
  automation: number;
  unknown: number;
  share: number | null;
  eligible: boolean;
  complete: boolean;
  agents: {
    name: string;
    count: number;
    identities: AiAgent[];
    evidence: Evidence[];
  }[];
  registryAt: string;
};
export type AiPage = {
  repositoryId?: number;
  requestedRepository?: string;
  repository: string;
  url: string;
  description: string;
  capturedAt: string;
  collector: Report["collector"];
  profile?: Report["profile"];
  analysis: AiAnalysis;
};
export type AiRow = AiPage & { rank: number };
export const MIN_MERGES = 100;
export function httpsSource(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing evidence URL.");
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    throw new Error("Invalid evidence URL.");
  return u.href;
}
export function parseRegistry(value: unknown): AiRegistry {
  const r = value as AiRegistry;
  if (
    !r ||
    r.version !== 1 ||
    !Number.isFinite(Date.parse(r.verifiedAt)) ||
    !Array.isArray(r.agents) ||
    !r.agents.length ||
    r.agents.length > 100 ||
    !Array.isArray(r.sources)
  )
    throw new Error("The AI account registry is unavailable.");
  const ids = new Set<number>();
  for (const a of r.agents) {
    if (
      !Number.isSafeInteger(a.id) ||
      a.id <= 0 ||
      ids.has(a.id) ||
      typeof a.login !== "string" ||
      !/^[a-z0-9_.\[\]-]{1,100}$/i.test(a.login) ||
      typeof a.name !== "string" ||
      !a.name.trim() ||
      a.name.length > 100 ||
      !Array.isArray(a.aliases) ||
      a.aliases.some(
        (x) => typeof x !== "string" || !/^[a-z0-9_.\[\]-]{1,100}$/i.test(x),
      )
    )
      throw new Error("Invalid AI account registry.");
    httpsSource(a.source);
    const u = new URL(httpsSource(a.accountUrl));
    if (u.hostname !== "github.com" || !/^\/apps\/[a-z0-9-]+$/.test(u.pathname))
      throw new Error("Invalid account evidence.");
    ids.add(a.id);
  }
  for (const s of r.sources) {
    httpsSource(s.url);
    if (typeof s.sha !== "string" || !/^[a-f0-9]{40,64}$/.test(s.sha))
      throw new Error("Invalid source digest.");
  }
  return r;
}
export function parseReport(value: unknown): Report {
  const r = value as Report;
  if (
    !r ||
    parseRepository(r.repository) !== r.repository ||
    !Number.isFinite(Date.parse(r.capturedAt)) ||
    !["merged-window-v2", "legacy-preview"].includes(r.collector) ||
    typeof r.description !== "string" ||
    r.coverage?.days !== 90 ||
    typeof r.coverage.periodComplete !== "boolean" ||
    !Array.isArray(r.facts?.closed) ||
    r.facts.closed.length > 100000
  )
    throw new Error("Invalid repository capture.");
  const ids = new Set<number>();
  for (const p of r.facts.closed) {
    if (
      !Number.isSafeInteger(p.number) ||
      p.number < 1 ||
      ids.has(p.number) ||
      typeof p.title !== "string" ||
      !Number.isFinite(p.updatedAt) ||
      !(p.mergedAt === null || Number.isFinite(p.mergedAt))
    )
      throw new Error("Invalid PR evidence.");
    ids.add(p.number);
    if (p.url !== `https://github.com/${r.repository}/pull/${p.number}`)
      throw new Error("Invalid PR URL.");
    if (p.author === undefined) throw new Error("Missing author field.");
    if (
      p.author &&
      (!Number.isSafeInteger(p.author.id) ||
        p.author.id < 1 ||
        typeof p.author.bot !== "boolean" ||
        typeof p.author.login !== "string")
    )
      throw new Error("Invalid author identity.");
  }
  if (
    r.profile?.owner &&
    (!Number.isSafeInteger(r.profile.owner.id) || r.profile.owner.id < 1)
  )
    throw new Error("Invalid repository owner.");
  return { ...r, url: `https://github.com/${r.repository}` };
}
export function analyzeAi(report: Report, registry: AiRegistry): AiAnalysis {
  const known = new Map(registry.agents.map((a) => [a.id, a])),
    groups = new Map<string, AiAnalysis["agents"][number]>(),
    now = Date.parse(report.capturedAt);
  let total = 0,
    ai = 0,
    accounts = 0,
    automation = 0,
    unknown = 0;
  const seen = new Set<number>();
  for (const pr of report.facts.closed) {
    if (
      seen.has(pr.number) ||
      pr.mergedAt === null ||
      pr.mergedAt < now - 90 * 86400000 ||
      pr.mergedAt > now
    )
      continue;
    seen.add(pr.number);
    total++;
    const agent = pr.author ? known.get(pr.author.id) : undefined;
    if (agent) {
      ai++;
      const g = groups.get(agent.name) ?? {
        name: agent.name,
        count: 0,
        identities: [],
        evidence: [],
      };
      g.count++;
      if (!g.identities.some((x) => x.id === agent.id))
        g.identities.push(agent);
      if (g.evidence.length < 6)
        g.evidence.push({ number: pr.number, title: pr.title, url: pr.url });
      groups.set(agent.name, g);
    } else if (!pr.author) unknown++;
    else if (pr.author.bot) automation++;
    else accounts++;
  }
  const complete =
    report.collector === "merged-window-v2" && report.coverage.periodComplete;
  return {
    total,
    ai,
    accounts,
    automation,
    unknown,
    share: total ? (ai / total) * 100 : null,
    eligible: complete && total >= MIN_MERGES,
    complete,
    agents: [...groups.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    ),
    registryAt: registry.verifiedAt,
  };
}
export function aiPage(report: Report, registry: AiRegistry): AiPage {
  return {
    repositoryId: report.repositoryId,
    requestedRepository: report.requestedRepository,
    repository: report.repository,
    url: report.url,
    description: report.description,
    capturedAt: report.capturedAt,
    collector: report.collector,
    profile: report.profile,
    analysis: analyzeAi(report, registry),
  };
}
export function aiLeaderboard(
  reports: Report[],
  registry: AiRegistry,
): AiRow[] {
  return aiLeaderboardPages(reports.map((r) => aiPage(r, registry)));
}
export function aiLeaderboardPages(input: AiPage[]): AiRow[] {
  const pages = input
    .filter((p) => p.analysis.eligible)
    .sort(
      (a, b) =>
        b.analysis.share! - a.analysis.share! ||
        b.analysis.total - a.analysis.total ||
        a.repository.localeCompare(b.repository),
    );
  return pages.map((p, i) => ({ ...p, rank: i + 1 }));
}
export function formatShare(share: number | null): string {
  return share === null
    ? "—"
    : share > 0 && share < 0.1
      ? "<0.1%"
      : `${Number(share.toFixed(1))}%`;
}
export function aiSummary(page: AiPage): string {
  const a = page.analysis;
  if (!a.total) return "No merged PRs in this window.";
  return !page.analysis.complete
    ? `${a.ai} of ${a.total} observed merged PRs (${formatShare(a.share)}) came from known AI-agent accounts.`
    : `${formatShare(a.share)} of this repo’s merged PRs came from known AI-agent accounts.`;
}
export type HistoryPoint = {
  capturedAt: string;
  ai: number;
  total: number;
  registryId: string;
  classificationId: string;
  collector: "merged-window-v2";
};
export function comparableHistory(
  points: HistoryPoint[],
  registryId: string,
): HistoryPoint[] {
  return points
    .filter(
      (p) =>
        p.collector === "merged-window-v2" &&
        p.classificationId === registryId &&
        p.total >= MIN_MERGES &&
        Number.isFinite(Date.parse(p.capturedAt)) &&
        Number.isSafeInteger(p.ai) &&
        p.ai >= 0 &&
        p.ai <= p.total,
    )
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
}
export function botCandidates(
  reports: Report[],
  registry: AiRegistry,
): { id: number; login: string; merges: number }[] {
  const known = new Set(registry.agents.map((a) => a.id)),
    map = new Map<number, { id: number; login: string; merges: number }>();
  for (const r of reports)
    for (const p of r.facts.closed)
      if (
        p.author?.bot &&
        !known.has(p.author.id) &&
        p.mergedAt !== null &&
        p.mergedAt >= Date.parse(r.capturedAt) - 90 * 86400000 &&
        p.mergedAt <= Date.parse(r.capturedAt)
      ) {
        const c = map.get(p.author.id) ?? {
          id: p.author.id,
          login: p.author.login,
          merges: 0,
        };
        c.merges++;
        map.set(c.id, c);
      }
  return [...map.values()].sort((a, b) => b.merges - a.merges || a.id - b.id);
}
