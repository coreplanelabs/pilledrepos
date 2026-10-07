import {
  parsePull,
  parseRepository,
  type Report,
  type Pull,
} from "../src/core.js";
export const INDEX_QUERY = `query AiPilledMerges($query:String!,$after:String) {
 search(query:$query,type:ISSUE,first:100,after:$after) { issueCount
 nodes { ... on PullRequest { repository {isPrivate nameWithOwner} number title createdAt updatedAt mergedAt isDraft headRefOid author { __typename login avatarUrl ... on User {databaseId} ... on Bot {databaseId} } } }
 pageInfo {hasNextPage endCursor} }
}`;
type RawPull = {
  repository: { isPrivate: boolean; nameWithOwner: string };
  number: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string;
  isDraft: boolean;
  headRefOid: string;
  author: null | {
    databaseId?: number;
    __typename: string;
    login: string;
    avatarUrl: string;
  };
};
type Search = {
  issueCount: number;
  nodes: RawPull[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};
const iso = (ms: number) =>
  new Date(ms).toISOString().replace(".000Z", "+00:00");
/** Complete, date-partitioned search census. Never truncate at GitHub's 1,000-result cap. */
export async function collectIndexedReport(
  repository: string,
  options: {
    read: (path: string, body?: unknown) => Promise<unknown>;
    now: number;
    maxPages?: number;
  },
): Promise<Report> {
  const requested = parseRepository(repository),
    meta = (await options.read("/repos/" + requested)) as {
      private: boolean;
      full_name: string;
      description: string | null;
      stargazers_count: number;
      language: string | null;
      owner: { id: number; login: string; type: string; avatar_url: string };
    };
  if (meta.private !== false)
    throw new Error("Only public repositories can be read.");
  const name = parseRepository(meta.full_name),
    since = options.now - 90 * 86400000;
  if (
    !Number.isSafeInteger(meta.stargazers_count) ||
    meta.stargazers_count < 0 ||
    !Number.isSafeInteger(meta.owner?.id) ||
    meta.owner.id < 1
  )
    throw new Error("Invalid repository identity.");
  const closed = new Map<number, Pull>();
  let requests = 1,
    pages = 0;
  async function readPage(
    query: string,
    after: string | null,
  ): Promise<Search> {
    if (++pages > (options.maxPages ?? 1000))
      throw new Error(
        "Merge census exceeds the query limit; previous index is preserved.",
      );
    const raw = (await options.read("/graphql", {
      query: INDEX_QUERY,
      variables: { query, after },
    })) as { errors?: unknown; data?: { search: Search } };
    requests++;
    const p = raw.data?.search;
    if (
      raw.errors ||
      !p ||
      !Number.isSafeInteger(p.issueCount) ||
      p.issueCount < 0 ||
      !Array.isArray(p.nodes) ||
      p.nodes.length > 100 ||
      typeof p.pageInfo?.hasNextPage !== "boolean"
    )
      throw new Error("Incomplete merge search page.");
    return p;
  }
  async function window(start: number, end: number): Promise<number> {
    const query = `repo:${name} is:pr is:merged merged:${iso(start)}..${iso(end - 1000)} sort:created-asc`;
    let p = await readPage(query, null);
    const expected = p.issueCount;
    if (expected > 1000) {
      const mid = Math.floor((start + end) / 2000) * 1000;
      if (mid <= start || mid >= end)
        throw new Error(
          "More than 1,000 merges in one second; cannot complete census.",
        );
      const count = (await window(start, mid)) + (await window(mid, end));
      if (count !== expected)
        throw new Error("Merge search counts changed during capture; retry.");
      return count;
    }
    const seen = new Set<number>(),
      cursors = new Set<string>();
    for (;;) {
      if (p.issueCount !== expected)
        throw new Error("Merge search counts changed during capture; retry.");
      for (const row of p.nodes) {
        if (
          row.repository?.isPrivate !== false ||
          row.repository.nameWithOwner !== name
        )
          throw new Error("Foreign or private PR in public census.");
        if (
          row.author &&
          (!row.author.databaseId ||
            !["User", "Bot"].includes(row.author.__typename))
        )
          throw new Error("Author ID is missing.");
        const pr = parsePull(
          {
            number: row.number,
            title: row.title,
            user: row.author
              ? {
                  id: row.author.databaseId,
                  login: row.author.login,
                  type: row.author.__typename,
                  avatar_url: row.author.avatarUrl,
                }
              : null,
            created_at: row.createdAt,
            updated_at: row.updatedAt,
            merged_at: row.mergedAt,
            draft: row.isDraft,
            head: { sha: row.headRefOid },
          },
          name,
        );
        if (
          pr.mergedAt === null ||
          pr.mergedAt < start ||
          pr.mergedAt >= end ||
          seen.has(pr.number) ||
          closed.has(pr.number)
        )
          throw new Error("Merge search scope or pagination changed; retry.");
        seen.add(pr.number);
        if (pr.mergedAt >= since && pr.mergedAt <= options.now)
          closed.set(pr.number, pr);
      }
      if (!p.pageInfo.hasNextPage) break;
      const cursor = p.pageInfo.endCursor;
      if (
        !p.nodes.length ||
        !cursor ||
        cursors.has(cursor) ||
        seen.size >= expected
      )
        throw new Error("Merge pagination stalled or count mismatched.");
      cursors.add(cursor);
      p = await readPage(query, cursor);
    }
    if (seen.size !== expected)
      throw new Error("Merge search count does not match captured PRs.");
    return seen.size;
  }
  await window(
    Math.floor(since / 1000) * 1000,
    Math.floor(options.now / 1000) * 1000 + 1000,
  );
  return {
    requestedRepository: requested,
    repository: name,
    url: `https://github.com/${name}`,
    description: meta.description ?? "",
    capturedAt: new Date(options.now).toISOString(),
    collector: "merged-window-v2",
    profile: {
      owner: {
        id: meta.owner.id,
        login: meta.owner.login,
        bot: meta.owner.type === "Bot",
        avatarUrl: `https://avatars.githubusercontent.com/u/${meta.owner.id}?s=160&v=4`,
      },
      stars: meta.stargazers_count,
      language: meta.language,
    },
    coverage: { days: 90, periodComplete: true, requests },
    facts: {
      closed: [...closed.values()].sort((a, b) => b.mergedAt! - a.mergedAt!),
    },
  };
}
