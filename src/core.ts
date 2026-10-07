export type Evidence = { number: number; title: string; url: string };
export type Author = { id: number; login: string; bot: boolean; avatarUrl?: string };
export type Pull = Evidence & {
  author: Author | null; createdAt: number; updatedAt: number;
  mergedAt: number | null; draft: boolean; association: string; headSha: string;
};
export type Detail = Pull & { additions: number; deletions: number; reviewComments: number | null; totalComments?: number };
export type Award = {
  id: string; name: string; icon: string; status: "observed" | "empty" | "unknown";
  headline: string; value: string; description: string; scope: string; evidence: Evidence[];
};
export type RepositoryProfile = { owner: Author | null; stars: number | null; forks: number | null; language: string | null; ownerOrganization?: boolean; imageUrl?: string; artworkChecked?: boolean };
export function repositoryImageUrl(value: unknown): string | undefined {
  if(typeof value!=="string" || value.length>500) return undefined;
  try { const url=new URL(value); if(url.protocol!=="https:" || url.username || url.password || url.port || url.search || url.hash) return undefined;
    if(url.hostname==="repository-images.githubusercontent.com" && /^\/[a-f0-9-]+\/[a-f0-9-]+$/i.test(url.pathname)) return url.href;
    if(url.hostname==="opengraph.githubassets.com" && /^\/[a-f0-9]{40,64}\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(url.pathname)) return url.href;
  }catch{} return undefined;
}
export type Report = {
  version: 1 | 2; profile?: RepositoryProfile; repository: string; url: string; description: string; capturedAt: string;
  summary: string; awards: Award[]; notes: string[]; contributingUrl: string | null;
  coverage: { days: number; closedRead: number; mergedObserved: number; periodComplete: boolean;
    detailsRequested: number; detailsRead: number; openRead: number; requests: number };
  facts: { closed: Pull[]; open: Pull[]; details: Detail[]; openKnown: boolean };
};
export class ArcadeError extends Error {
  constructor(public code: string, message: string, public repository?: string) { super(message); this.name = "ArcadeError"; }
}
const DAY = 86_400_000;
const API = "https://api.github.com";
export const DETAIL_LIMIT = 10;

export function parseRepository(input: string): string {
  let value = input.trim();
  if (/^https?:/i.test(value)) {
    let url: URL;
    try { url = new URL(value); } catch { throw new ArcadeError("INPUT", "Paste a GitHub repository URL or owner/repo."); }
    if (url.protocol !== "https:" || !["github.com", "www.github.com"].includes(url.hostname) || url.username || url.password || url.port) {
      throw new ArcadeError("INPUT", "Use a public repository on github.com, such as pytest-dev/pytest.");
    }
    value = url.pathname.replace(/^\/+|\/+$/g, "");
  }
  value = value.replace(/\.git$/i, "");
  const match = /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})$/.exec(value);
  if (!match || [".", ".."].includes(match[2])) throw new ArcadeError("INPUT", "Paste a GitHub repository URL or owner/repo, such as pytest-dev/pytest.");
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ArcadeError("DATA", "GitHub returned a record I could not read. Please try again later.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 240): string {
  if (typeof value !== "string") throw new ArcadeError("DATA", "A GitHub record is missing a required text field.");
  return value.slice(0, max);
}
function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new ArcadeError("DATA", "A GitHub record is missing a valid count.");
  return Number(value);
}
function timestamp(value: unknown): number {
  const time = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) throw new ArcadeError("DATA", "A GitHub record has an unreadable timestamp.");
  return time;
}
function author(value: unknown): Author | null {
  if (value === null) return null;
  const row = object(value);
  const id = count(row.id);
  if (!id) throw new ArcadeError("DATA", "A contributor record is missing its identity.");
  let avatarUrl = `https://avatars.githubusercontent.com/u/${id}?s=160&v=4`;
  if (typeof row.avatar_url === "string") {
    try {
      const url = new URL(row.avatar_url);
      if (url.origin === "https://avatars.githubusercontent.com" && !url.username && !url.password &&
        (url.pathname === `/u/${id}` || (row.type === "Bot" && /^\/in\/[1-9]\d{0,14}$/.test(url.pathname)))) avatarUrl = `${url.origin}${url.pathname}?s=160&v=4`;
    } catch { /* An invalid photo cannot change the author identity or counts. */ }
  }
  return { id, login: text(row.login, 100), bot: row.type === "Bot", avatarUrl };
}
export function parsePull(value: unknown, repository: string): Pull {
  const row = object(value); const number = count(row.number);
  if (!number || typeof row.draft !== "boolean" || !(row.merged_at === null || typeof row.merged_at === "string")) {
    throw new ArcadeError("DATA", "A pull request is missing its number, draft state, or merge state.");
  }
  const headSha = text(object(row.head).sha, 100);
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(headSha)) throw new ArcadeError("DATA", "A pull request has an unreadable head SHA.");
  return {
    number, title: text(row.title), url: `https://github.com/${repository}/pull/${number}`,
    author: author(row.user), createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at),
    mergedAt: row.merged_at === null ? null : timestamp(row.merged_at), draft: row.draft,
    association: typeof row.author_association === "string" ? row.author_association : "UNKNOWN",
    headSha
  };
}
export function parseDetail(value: unknown, repository: string): Detail {
  const row = object(value);
  return { ...parsePull(value, repository), additions: count(row.additions), deletions: count(row.deletions), reviewComments: count(row.review_comments) };
}
function empty(id: string, name: string, icon: string, description: string, scope: string, unknown = false): Award {
  return { id, name, icon, status: unknown ? "unknown" : "empty", headline: unknown ? "Not enough evidence" : "No winner this round", value: "", description, scope, evidence: [] };
}
export function buildReport(input: {
  repository: string; description: string; now: number; version?: 1 | 2; closed: Pull[]; open: Pull[];
  details: Detail[]; periodComplete: boolean; notes: string[]; contributingUrl: string | null;
  requests: number; openKnown: boolean; detailRequested: number; profile?: RepositoryProfile;
}): Report {
  const { repository, now, closed, open, details } = input;
  const since = now - 90 * DAY;
  const merged = closed.filter(p => p.mergedAt !== null && p.mergedAt >= since && p.mergedAt <= now)
    .sort((a, b) => (b.mergedAt! - a.mergedAt!) || a.number - b.number);
  const detailSources = new Map(merged.slice(0, input.detailRequested).map(p => [p.number, p]));
  const inspected = details.filter(p => {
    const source = detailSources.get(p.number);
    return source && p.mergedAt === source.mergedAt && p.headSha === source.headSha && p.author?.id === source.author?.id;
  });
  const mergeScope = `${merged.length} observed merges in the past 90 days, from ${closed.length} recently updated closed PRs.`;
  const detailScope = `${inspected.length} of ${input.detailRequested} selected recent merged PRs inspected. Counts include all file types.`;
  const groups = new Map<number, { author: Author; pulls: Pull[] }>();
  for (const pr of merged) {
    if (!pr.author) continue;
    const group = groups.get(pr.author.id) ?? { author: pr.author, pulls: [] };
    group.pulls.push(pr); groups.set(pr.author.id, group);
  }
  const leaders = [...groups.values()].sort((a, b) => b.pulls.length - a.pulls.length || a.author.login.localeCompare(b.author.login));
  const top = leaders[0];
  const awards: Award[] = [];
  if (top) {
    const ties = leaders.filter(g => g.pulls.length === top.pulls.length).length;
    awards.push({ id: "merge", name: "Merge Machine", icon: "merge", status: "observed", headline: `@${top.author.login}`,
      value: `${top.pulls.length} merged PR${top.pulls.length === 1 ? "" : "s"}`, description: `The merge button stayed busy. Authored the most merges in this snapshot${ties > 1 ? `, tied with ${ties - 1} other account${ties > 2 ? "s" : ""}` : ""}. ${top.author.bot ? "This is a bot account." : ""}`.trim(), scope: mergeScope, evidence: top.pulls.slice(0, 4) });
  } else awards.push(empty("merge", "Merge Machine", "merge", "No identifiable author of a recent merge was found in this snapshot.", mergeScope));
  const deletion = [...inspected].filter(p => p.deletions > 0).sort((a, b) => b.deletions - a.deletions || a.number - b.number)[0];
  if (deletion) awards.push({ id: "delete", name: "Delete Club", icon: "delete", status: "observed", headline: deletion.author ? `@${deletion.author.login}` : `PR #${deletion.number}`,
    value: `${deletion.deletions.toLocaleString("en-US")} lines deleted`, description: `A big day for the backspace key. PR #${deletion.number} deleted the most lines among inspected PRs. It also added ${deletion.additions.toLocaleString("en-US")} lines.`, scope: detailScope, evidence: [deletion] });
  else awards.push(empty("delete", "Delete Club", "delete", inspected.length ? "No deleted lines were recorded on the inspected PRs." : "No diff counts are available for the selected PRs.", detailScope, input.detailRequested > 0 && inspected.length === 0));
  const commentCount = (pr: Detail) => input.version === 2 ? pr.totalComments ?? 0 : pr.reviewComments ?? 0;
  const magnet = [...inspected].filter(p => commentCount(p) > 0).sort((a, b) => commentCount(b) - commentCount(a) || a.number - b.number)[0];
  if (magnet) awards.push({ id: "comments", name: "Comment Magnet", icon: "comments", status: "observed", headline: `PR #${magnet.number}`,
    value: `${commentCount(magnet)} ${input.version === 2 ? "PR" : "review"} comment${commentCount(magnet) === 1 ? "" : "s"}`, description: "This PR brought the conversation. The busiest discussion among inspected PRs. A comment count is not a roast or a defect count.", scope: detailScope, evidence: [magnet] });
  else awards.push(empty("comments", "Comment Magnet", "comments", inspected.length ? `No ${input.version === 2 ? "discussion" : "inline review"} comments were recorded on the inspected PRs.` : "No comment counts are available for the selected PRs.", detailScope, input.detailRequested > 0 && inspected.length === 0));
  awards.push({ id: "cast", name: "The Cast", icon: "cast", status: groups.size ? "observed" : "empty", headline: groups.size ? "Meet the cast" : "No identifiable author found",
    value: `${groups.size} contributor account${groups.size === 1 ? "" : "s"}`, description: "Roll credits. Distinct accounts that authored merged PRs in this snapshot. Includes bot accounts; this is not a count of new or external contributors.", scope: mergeScope, evidence: leaders.slice(0, 4).map(group => group.pulls[0]) });
  const oldest = [...open].filter(p => p.createdAt <= now).sort((a, b) => a.createdAt - b.createdAt || a.number - b.number)[0];
  if (oldest && input.openKnown) awards.push({ id: "oldest", name: "The Long Goodbye", icon: "oldest", status: "observed", headline: `PR #${oldest.number}`,
    value: `${Math.floor((now - oldest.createdAt) / DAY).toLocaleString("en-US")} days open`, description: `Still part of the plot. The oldest open PR returned by GitHub's oldest-first listing.${oldest.draft ? " It is a draft." : ""} Age does not mean neglect.`, scope: `${open.length} oldest open PRs read. This is calendar age, not time waiting for review.`, evidence: [oldest] });
  else awards.push(empty("oldest", "The Long Goodbye", "oldest", input.openKnown ? "GitHub returned no open pull requests. A quiet round is still a round." : "The open-PR listing could not be read completely enough to name its oldest PR.", "Oldest-first open PR listing.", !input.openKnown));
  const fastest = [...merged].filter(pr => pr.mergedAt! >= pr.createdAt).sort((a, b) => (a.mergedAt! - a.createdAt) - (b.mergedAt! - b.createdAt) || a.number - b.number)[0];
  if (fastest) {
    const minutes = (fastest.mergedAt! - fastest.createdAt) / 60_000;
    const amount = Math.floor(minutes < 60 ? minutes : minutes < 1440 ? minutes / 60 : minutes / 1440);
    const unit = minutes < 60 ? "minute" : minutes < 1440 ? "hour" : "day";
    const value = minutes < 1 ? "Under a minute" : `${amount} ${unit}${amount === 1 ? "" : "s"}`;
    awards.push({ id: "fast", name: "Fastest Lap", icon: "fast", status: "observed", headline: `PR #${fastest.number}`, value,
      description: "Blink and it merged. Shortest PR opening-to-merge time observed. Includes draft time, waiting and automation. This is not time spent coding.", scope: mergeScope, evidence: [fastest] });
  } else awards.push(empty("fast", "Fastest Lap", "fast", "No recent merge with a valid opening-to-merge interval was found.", mergeScope));
  const botPulls = merged.filter(pr => pr.author?.bot === true), unknownAuthors = merged.filter(pr => !pr.author).length;
  awards.push(merged.length ? { id: "bots", name: "Bot Party", icon: "bots", status: "observed",
    headline: botPulls.length ? `${Math.round(botPulls.length / merged.length * 100)}% bot cameos` : "No bot accounts found",
    value: `${botPulls.length} bot-authored merge${botPulls.length === 1 ? "" : "s"}`,
    description: botPulls.length ? `The automation crew put in a shift. ${botPulls.length} of ${merged.length} observed merges came from GitHub bot accounts.` : unknownAuthors ? "Some author records are missing. No bot accounts appear in the readable ones." : "The bots sat this round out. No bot-authored merges in this snapshot.",
    scope: `${mergeScope} GitHub account types, not AI authorship.${unknownAuthors ? ` ${unknownAuthors} merge${unknownAuthors === 1 ? " has" : "s have"} no readable author.` : ""}`,
    evidence: botPulls.slice(0, 4) } : empty("bots", "Bot Party", "bots", "No recent merges to invite to the party.", mergeScope));
  const addition=[...inspected].filter(pr=>pr.additions>0).sort((a,b)=>b.additions-a.additions||a.number-b.number)[0];
  awards.push(addition ? {id:"additions",name:"Big Bang",icon:"additions",status:"observed",headline:addition.author ? "@"+addition.author.login : `PR #${addition.number}`,value:`${addition.additions.toLocaleString("en-US")} lines added`,description:`A big entrance. PR #${addition.number} added the most lines among inspected merges. It also deleted ${addition.deletions.toLocaleString("en-US")} lines.`,scope:detailScope,evidence:[addition]} : empty("additions","Big Bang","additions","No added lines were recorded on the inspected PRs.",detailScope));
  const humanPulls=merged.filter(pr=>pr.author?.bot===false);
  awards.push(merged.length ? {id:"humans",name:"Human Touch",icon:"humans",status:"observed",headline:humanPulls.length ? "People power" : "No user accounts found",value:`${humanPulls.length} human merge${humanPulls.length===1?"":"s"}`,description:"Merges from GitHub user accounts. Account type does not tell us who wrote the code.",scope:`${mergeScope} Counts GitHub User accounts; unidentified authors stay separate.`,evidence:humanPulls.slice(0,4)} : empty("humans","Human Touch","humans","No recent merges with readable user accounts.",mergeScope));
  const summary = `Found ${merged.length} PR${merged.length === 1 ? "" : "s"} merged in the past 90 days within ${closed.length} recently updated closed PRs. ${top ? `@${top.author.login} authored ${top.pulls.length} of those merges. ` : ""}Checked ${inspected.length} selected PRs for diff and ${input.version===2 ? "PR discussion" : "inline-review"} counts. These awards describe the observed snapshot, not developer skill or the project's contribution policy.`;
  return { version: input.version ?? 1, ...(input.profile ? { profile: input.profile } : {}), repository, url: `https://github.com/${repository}`, description: input.description,
    capturedAt: new Date(now).toISOString(), summary, awards, notes: input.notes,
    contributingUrl: input.contributingUrl, coverage: { days: 90, closedRead: closed.length, mergedObserved: merged.length,
      periodComplete: input.periodComplete, detailsRequested: input.detailRequested, detailsRead: inspected.length,
      openRead: open.length, requests: input.requests },
    facts: { closed, open, details: inspected, openKnown: input.openKnown } };
}
export async function collectReport(raw: string, options: {
  fetch: typeof fetch; now: number; signal: AbortSignal; onProgress?: (message: string) => void;
}): Promise<Report> {
  let repository = parseRepository(raw); const notes: string[] = []; let requests = 0;
  const progress = options.onProgress ?? (() => {});
  async function read(path: string): Promise<unknown> {
    if (options.signal.aborted) throw new ArcadeError("TIMEOUT", "The read took too long. The available records may be incomplete.");
    requests++;
    let response: Response;
    try { response = await options.fetch(`${API}/repos/${repository}${path}`, { signal: options.signal, redirect: "error", headers: { Accept: "application/vnd.github+json" } }); }
    catch { throw new ArcadeError(options.signal.aborted ? "TIMEOUT" : "NETWORK", options.signal.aborted ? "The read took too long. Please try again later." : "I could not reach GitHub. Check your connection, or try again later."); }
    if (response.status === 429 || (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")))) {
      const reset = response.headers.get("x-ratelimit-reset"); const retry = response.headers.get("retry-after");
      const resetDate = reset && /^\d{1,12}$/.test(reset) ? new Date(Number(reset) * 1000) : null;
      const suffix = retry && /^\d{1,8}$/.test(retry) ? ` Try again in ${retry} seconds.` : resetDate && Number.isFinite(resetDate.getTime()) ? ` The limit resets at ${resetDate.toISOString()}.` : " Please try again later.";
      throw new ArcadeError("RATE_LIMIT", `GitHub limited this read.${suffix}`);
    }
    if (response.status === 403) throw new ArcadeError("ACCESS", "GitHub did not allow this public read. Please try again later, or check the repository's access.");
    if (response.status === 404) throw new ArcadeError("NOT_FOUND", "GitHub could not find this public repository or record. Check its name and public access.");
    if (!response.ok) throw new ArcadeError("GITHUB", `GitHub could not complete the read (HTTP ${response.status}). Please try again later.`);
    let body: string;
    try { body = await response.text(); }
    catch { throw new ArcadeError(options.signal.aborted ? "TIMEOUT" : "NETWORK", "The GitHub response stopped before it could be read. Please try again later."); }
    if (body.length > 8_000_000) throw new ArcadeError("SIZE", "The response was too large for this quick snapshot.");
    try { return JSON.parse(body) as unknown; } catch { throw new ArcadeError("DATA", "GitHub returned an unreadable response. Please try again later."); }
  }
  progress("Finding your public repository…");
  const metadata = object(await read(""));
  if (metadata.private !== false) throw new ArcadeError("PRIVATE", "Repo Lore reads public repositories only.");
  const canonical = parseRepository(text(metadata.full_name, 150));
  if (canonical.toLowerCase() !== repository.toLowerCase()) throw new ArcadeError("MOVED", `This repository moved. Try ${canonical} instead.`, canonical);
  repository = canonical;
  const optionalCount = (value: unknown): number | null => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
  const profile: RepositoryProfile = { owner: metadata.owner ? author(metadata.owner) : null,
    stars: optionalCount(metadata.stargazers_count), forks: optionalCount(metadata.forks_count),
    language: typeof metadata.language === "string" ? metadata.language.slice(0, 80) : null };
  const description = metadata.description === null ? "" : text(metadata.description, 300);
  progress("Reading the recent merges and the oldest open PRs…");
  const results = await Promise.allSettled([
    read("/pulls?state=closed&sort=updated&direction=desc&per_page=100"),
    read("/pulls?state=open&sort=created&direction=asc&per_page=30")
  ]);
  const closedResult = results[0];
  if (closedResult.status === "rejected") throw closedResult.reason;
  if (!Array.isArray(closedResult.value)) throw new ArcadeError("DATA", "GitHub returned an unreadable pull-request listing.");
  const closed: Pull[] = [];
  for (const row of closedResult.value) {
    try { const pr = parsePull(row, repository); if (!closed.some(p => p.number === pr.number)) closed.push(pr); }
    catch { notes.push("A closed PR record could not be read. Awards cover readable records only."); }
  }
  if (closedResult.value.length > 0 && closed.length === 0) throw new ArcadeError("DATA", "None of the returned PR records could be read. I cannot deal reliable awards from this response.");
  const open: Pull[] = []; let openKnown = true;
  const openResult = results[1];
  if (openResult.status === "fulfilled" && Array.isArray(openResult.value)) {
    for (const row of openResult.value) {
      try { open.push(parsePull(row, repository)); } catch { openKnown = false; }
    }
  } else openKnown = false;
  if (!openKnown) notes.push("The open-PR read was incomplete. The Long Goodbye is unknown.");
  const since = options.now - 90 * DAY;
  const ordered = closed.every((pr, i) => i === 0 || closed[i - 1].updatedAt >= pr.updatedAt);
  const periodComplete = closed.length === closedResult.value.length && ordered &&
    (closedResult.value.length < 100 || (closed.at(-1)?.updatedAt ?? Infinity) < since);
  if (!periodComplete) notes.push("The closed-PR scan stopped at one page. Merge awards describe this snapshot, not every merge in the period.");
  const selected = closed.filter(p => p.mergedAt !== null && p.mergedAt >= since && p.mergedAt <= options.now)
    .sort((a, b) => (b.mergedAt! - a.mergedAt!) || a.number - b.number).slice(0, DETAIL_LIMIT);
  const details: Detail[] = []; let stopped = options.signal.aborted;
  for (let i = 0; i < selected.length && !stopped; i += 2) {
    progress(`Dealing the cards: checking ${Math.min(i + 2, selected.length)} of ${selected.length} PRs…`);
    const batch = selected.slice(i, i + 2);
    const reads = await Promise.allSettled(batch.map(pr => read(`/pulls/${pr.number}`)));
    reads.forEach((result, j) => {
      if (result.status === "fulfilled") {
        try {
          const detail = parseDetail(result.value, repository); const selectedPr = batch[j];
          if (detail.number !== selectedPr.number || detail.mergedAt !== selectedPr.mergedAt || detail.author?.id !== selectedPr.author?.id || detail.headSha !== selectedPr.headSha) throw new Error("Changed binding");
          details.push(detail);
        } catch { notes.push(`PR #${batch[j].number} changed or had unreadable counts. It was excluded from diff awards.`); }
      } else {
        notes.push(`PR #${batch[j].number} could not be inspected. Its diff and review-comment counts are unknown.`);
        if (result.reason instanceof ArcadeError && ["RATE_LIMIT", "TIMEOUT"].includes(result.reason.code)) stopped = true;
      }
    });
    stopped ||= options.signal.aborted;
  }
  if (details.length < selected.length) notes.push(`Only ${details.length} of ${selected.length} selected PRs have diff counts. Delete Club and Comment Magnet are partial.`);
  let contributingUrl: string | null = null;
  if (!stopped) {
    progress("Finding the house rules…");
    try {
      const profile = object(await read("/community/profile")); const files = object(profile.files);
      if (files.contributing !== null && files.contributing !== undefined) {
        const url = new URL(text(object(files.contributing).html_url, 1000));
        if (url.protocol === "https:" && url.hostname === "github.com" && !url.username && !url.password && url.pathname.toLowerCase().startsWith(`/${repository.toLowerCase()}/`)) contributingUrl = url.href;
      }
    } catch { notes.push("GitHub did not return a readable contribution guide. Check the repository's own documentation."); }
  } else notes.push("The contribution guide was not checked because the read stopped early.");
  return buildReport({ repository, description, profile, now: options.now, closed, open, details, periodComplete,
    notes: [...new Set(notes)], contributingUrl, requests, openKnown, detailRequested: selected.length });
}
export function plainReport(report: Report): string {
  return [`Repo Lore — ${report.repository}`, report.summary, "", ...report.awards.flatMap(award => [
    `${award.name}: ${award.headline}${award.value ? ` — ${award.value}` : ""}`,
    award.description, `Scope: ${award.scope}`, ...award.evidence.map(pr => `  #${pr.number}: ${pr.url}`), ""
  ]), ...report.notes.map(note => `Coverage: ${note}`), `Read at ${report.capturedAt}`, report.contributingUrl ? `Contribution guide: ${report.contributingUrl}` : "Contribution policy is unknown. Check the project documentation."].join("\n");
}
export function replayReport(value: unknown): Report {
  const saved = object(value);
  if (saved.version !== 1 && saved.version !== 2) throw new ArcadeError("INPUT", "This is not a supported Repo Lore evidence file.");
  const repository = parseRepository(text(saved.repository, 150));
  const now = timestamp(saved.capturedAt); const facts = object(saved.facts); const coverage = object(saved.coverage);
  function pull(value: unknown): Pull {
    const row = object(value); const user = row.author === null ? null : object(row.author);
    function date(value: unknown): string {
      if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 8.64e15) throw new ArcadeError("DATA", "The saved evidence has an unreadable timestamp.");
      return new Date(value).toISOString();
    }
    return parsePull({ number: row.number, title: row.title, user: user ? { id: user.id, login: user.login, type: user.bot === true ? "Bot" : "User", avatar_url: user.avatarUrl } : null,
      created_at: date(row.createdAt), updated_at: date(row.updatedAt), merged_at: row.mergedAt === null ? null : date(row.mergedAt), draft: row.draft,
      author_association: row.association, head: { sha: row.headSha } }, repository);
  }
  if (!Array.isArray(facts.closed) || facts.closed.length > (saved.version === 2 ? 120 : 100) || !Array.isArray(facts.open) || facts.open.length > 30 ||
    !Array.isArray(facts.details) || facts.details.length > (saved.version === 2 ? 120 : DETAIL_LIMIT) || typeof facts.openKnown !== "boolean" || typeof coverage.periodComplete !== "boolean") {
    throw new ArcadeError("INPUT", "The saved evidence does not match the bounded Repo Lore format.");
  }
  const details: Detail[] = facts.details.map(value => {
    const row = object(value);
    return { ...pull(row), additions: count(row.additions), deletions: count(row.deletions), reviewComments: saved.version === 2 && row.reviewComments === null ? null : count(row.reviewComments), ...(saved.version === 2 ? { totalComments: count(row.totalComments) } : row.totalComments !== undefined ? { totalComments: count(row.totalComments) } : {}) };
  });
  const requested = count(coverage.detailsRequested);
  if (requested > (saved.version === 2 ? 120 : DETAIL_LIMIT)) throw new ArcadeError("INPUT", "The saved evidence exceeds the PR inspection limit.");
  const notes = Array.isArray(saved.notes) ? saved.notes.slice(0, 30).map(note => text(note, 1000)) : [];
  let contributingUrl: string | null = null;
  if (typeof saved.contributingUrl === "string") {
    const url = new URL(saved.contributingUrl);
    if (url.protocol === "https:" && url.hostname === "github.com" && !url.username && !url.password && url.pathname.toLowerCase().startsWith(`/${repository.toLowerCase()}/`)) contributingUrl = url.href;
  }
  let profile: RepositoryProfile | undefined;
  if (saved.profile) {
    const row = object(saved.profile); const owner = row.owner === null ? null : object(row.owner);
    const optionalCount = (value: unknown): number | null => value === null ? null : count(value);
    profile = { owner: owner ? author({ id: owner.id, login: owner.login, type: owner.bot === true ? "Bot" : "User", avatar_url: owner.avatarUrl }) : null,
      ownerOrganization: row.ownerOrganization===true, artworkChecked: row.artworkChecked===true, ...(repositoryImageUrl(row.imageUrl) ? {imageUrl:repositoryImageUrl(row.imageUrl)} : {}), stars: optionalCount(row.stars), forks: optionalCount(row.forks), language: row.language === null ? null : text(row.language, 80) };
  }
  return buildReport({ repository, profile, version: saved.version as 1 | 2, description: text(saved.description, 300), now,
    closed: facts.closed.map(pull), open: facts.open.map(pull), details, openKnown: facts.openKnown,
    detailRequested: requested, periodComplete: coverage.periodComplete, notes, contributingUrl, requests: count(coverage.requests) });
}
