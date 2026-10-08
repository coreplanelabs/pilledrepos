export type Evidence = { number: number; title: string; url: string };
export type Author = {
  id: number;
  login: string;
  bot: boolean;
  avatarUrl?: string;
};
export type Pull = Evidence & {
  author: Author | null;
  createdAt: number;
  updatedAt: number;
  mergedAt: number | null;
  draft: boolean;
  association: string;
  headSha: string;
};
export type Detail = Pull & {
  additions: number;
  deletions: number;
  reviewComments: number | null;
};
export type RepositoryProfile = {
  owner: Author | null;
  stars: number | null;
  language: string | null;
};
export type Report = {
  repositoryId?: number;
  requestedRepository?: string;
  repository: string;
  url: string;
  description: string;
  capturedAt: string;
  profile?: RepositoryProfile;
  collector: "merged-window-v2" | "legacy-preview";
  coverage: { days: 90; periodComplete: boolean; requests: number };
  facts: { closed: Pull[] };
};
export class ArcadeError extends Error {
  constructor(
    public code: string,
    message: string,
    public repository?: string,
  ) {
    super(message);
    this.name = "ArcadeError";
  }
}
export function parseRepository(input: string): string {
  let value = input.trim();
  if (/^(?:www\.)?github\.com(?:\/|$)/i.test(value)) value = "https://" + value;
  else if (value.startsWith("//")) value = "https:" + value;
  if (/^https?:/i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ArcadeError(
        "INPUT",
        "Paste a GitHub repository URL or owner/repo.",
      );
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !["github.com", "www.github.com"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    ) {
      throw new ArcadeError(
        "INPUT",
        "Use a public repository on github.com, such as pytest-dev/pytest.",
      );
    }
    value = url.pathname.replace(/^\/+|\/+$/g, "");
  }
  value = value.replace(/\.git$/i, "");
  const match =
    /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})$/.exec(value);
  if (!match || [".", ".."].includes(match[2]))
    throw new ArcadeError(
      "INPUT",
      "Paste a GitHub repository URL or owner/repo, such as pytest-dev/pytest.",
    );
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ArcadeError(
      "DATA",
      "GitHub returned a record I could not read. Please try again later.",
    );
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 240): string {
  if (typeof value !== "string")
    throw new ArcadeError(
      "DATA",
      "A GitHub record is missing a required text field.",
    );
  return value.slice(0, max);
}
function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new ArcadeError("DATA", "A GitHub record is missing a valid count.");
  return Number(value);
}
function timestamp(value: unknown): number {
  const time = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(time))
    throw new ArcadeError(
      "DATA",
      "A GitHub record has an unreadable timestamp.",
    );
  return time;
}
function author(value: unknown): Author | null {
  if (value === null) return null;
  const row = object(value);
  const id = count(row.id);
  if (!id)
    throw new ArcadeError(
      "DATA",
      "A contributor record is missing its identity.",
    );
  let avatarUrl = `https://avatars.githubusercontent.com/u/${id}?s=160&v=4`;
  if (typeof row.avatar_url === "string") {
    try {
      const url = new URL(row.avatar_url);
      if (
        url.origin === "https://avatars.githubusercontent.com" &&
        !url.username &&
        !url.password &&
        (url.pathname === `/u/${id}` ||
          (row.type === "Bot" && /^\/in\/[1-9]\d{0,14}$/.test(url.pathname)))
      )
        avatarUrl = `${url.origin}${url.pathname}?s=160&v=4`;
    } catch {
      /* An invalid photo cannot change the author identity or counts. */
    }
  }
  return {
    id,
    login: text(row.login, 100),
    bot: row.type === "Bot",
    avatarUrl,
  };
}
export function parsePull(value: unknown, repository: string): Pull {
  const row = object(value);
  const number = count(row.number);
  if (
    !number ||
    typeof row.draft !== "boolean" ||
    !(row.merged_at === null || typeof row.merged_at === "string")
  ) {
    throw new ArcadeError(
      "DATA",
      "A pull request is missing its number, draft state, or merge state.",
    );
  }
  const headSha = text(object(row.head).sha, 100);
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(headSha))
    throw new ArcadeError("DATA", "A pull request has an unreadable head SHA.");
  return {
    number,
    title: text(row.title),
    url: `https://github.com/${repository}/pull/${number}`,
    author: author(row.user),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    mergedAt: row.merged_at === null ? null : timestamp(row.merged_at),
    draft: row.draft,
    association:
      typeof row.author_association === "string"
        ? row.author_association
        : "UNKNOWN",
    headSha,
  };
}
export function parseDetail(value: unknown, repository: string): Detail {
  const row = object(value);
  return {
    ...parsePull(value, repository),
    additions: count(row.additions),
    deletions: count(row.deletions),
    reviewComments: count(row.review_comments),
  };
}
