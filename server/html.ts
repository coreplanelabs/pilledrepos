import { friendlyDate, friendlyTimestamp } from "../src/dates.js";
import { curatedRepos } from "../src/curated-repos.js";
import { githubIcon, refreshIcon, externalIcon } from "../src/ui-icons.js";
import { agentLogos } from "../src/agent-logos.js";
import {
  formatShare,
  MIN_MERGES,
  comparableHistory,
  type AiPage,
  type AiRegistry,
  type AiRow,
  type HistoryPoint,
} from "../src/ai.js";
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const e = escapeHtml,
  number = (n: number) => n.toLocaleString("en-US"),
  percent = (s: number | null) => e(formatShare(s));
export const rowId = (repo: string) =>
  "repo-" + repo.toLowerCase().replace("/", "--");
export const repoPath = (r: string) =>
  "/" + r.split("/").map(encodeURIComponent).join("/");
export type View = {
  pages: AiPage[];
  board: AiRow[];
  registry: AiRegistry;
  registryId: string;
  classificationId: string;
  history: Record<string, HistoryPoint[]>;
  pool: string;
  capturedAt: string;
  complete: boolean;
};
export function viewVersion(v: View): string {
  let n = 2166136261;
  for (const p of v.pages)
    for (const c of p.repository +
      p.capturedAt +
      p.analysis.total +
      ":" +
      p.analysis.ai)
      n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return Date.parse(v.capturedAt).toString(36) + "-" + (n >>> 0).toString(36);
}
export type SortDirection = "asc" | "desc";
export function listing(v: View, sort: SortDirection = "desc"): AiRow[] {
  return [...v.board].sort(
    (a, b) =>
      (sort === "asc" ? 1 : -1) * (a.analysis.share! - b.analysis.share!) ||
      b.analysis.total - a.analysis.total ||
      a.repository.localeCompare(b.repository),
  );
}

function icon(name: "sun" | "moon" | "system" | "refresh"): string {
  const paths = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon: '<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>',
    system:
      '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    refresh:
      '<path d="M20 7v5h-5M4 17v-5h5M6.2 6.2A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.8 5.8"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
function themePicker(): string {
  return `<div class="theme-picker" role="group" aria-label="Color theme">${(["light", "dark", "system"] as const).map((c) => `<button type="button" data-theme-choice="${c}" aria-label="${c[0].toUpperCase() + c.slice(1)}" aria-pressed="${c === "system"}">${icon(c === "light" ? "sun" : c === "dark" ? "moon" : "system")}</button>`).join("")}</div>`;
}
function masthead(): string {
  return `<header class="masthead"><a class="brand" href="/" aria-label="AI Pilled home"><span class="brand-icon" aria-hidden="true"><span class="pill-mark"></span></span>AI PILLED</a>${themePicker()}</header>`;
}
function footer(): string {
  return `<footer class="site-footer"><span class="footer-credit">Built for fun by <a href="https://polylane.com/?utm_source=ai-pilled" target="_blank" rel="noopener noreferrer">Polylane${externalIcon}</a></span><div class="footer-actions"><a href="https://github.com/coreplanelabs/pilledrepos" target="_blank" rel="noopener noreferrer">${githubIcon} View the source</a></div></footer>`;
}
export function rowsMarkup(rows: (AiPage & { rank?: number })[]): string {
  return rows
    .map(
      (p) =>
        `<tr id="${rowId(p.repository)}"${p.rank === 1 ? ' class="leader-row"' : ""} data-href="${repoPath(p.repository)}"><td class="rank">${p.rank ? "#" + p.rank : "—"}</td><th scope="row"><a href="${repoPath(p.repository)}"><span class="repo-name"><img src="https://avatars.githubusercontent.com/u/${p.profile?.owner?.id ?? 0}?s=64" alt="" width="30" height="30" loading="lazy"><span><span class="owner">${e(p.repository.split("/")[0])} / </span>${e(p.repository.split("/")[1])}</span></span></a></th><td class="pr-share" title="${p.analysis.ai} of ${p.analysis.total} merged PRs in 90 days"><b>${percent(p.analysis.share)}</b><span class="mono">${number(p.analysis.ai)} / ${number(p.analysis.total)}</span></td></tr>`,
    )
    .join("");
}
export function loadingMarkup(): string {
  return `<div id="loading" class="loading" role="status" aria-live="polite" hidden><div class="shuffle-deck" aria-hidden="true"><span><i class="pill-mark"></i></span><span><i class="pill-mark"></i></span><span><i class="pill-mark"></i></span></div><div><strong id="loading-text">Counting robot footprints…</strong><p>Reading the pull requests.</p></div></div><p id="action-error" class="action-error" role="alert" hidden></p>`;
}
function note(p: AiPage): string {
  return !p.analysis.complete
    ? '<p class="notice">Partial read</p>'
    : !p.analysis.total
      ? '<p class="notice">No merged PRs in the last 90 days.</p>'
      : "";
}

function agentMix(p: AiPage): string {
  const a = p.analysis,
    groups = [...a.agents].sort(
      (x, y) => y.count - x.count || x.name.localeCompare(y.name),
    );
  return `<section class="agent-mix"><h2>Agents</h2><div class="agent-chart">${groups.length ? groups.map((g) => `<div class="agent-row" title="${number(g.count)} of ${number(a.ai)} AI-agent PRs"><div class="agent-identity"><img src="${e(agentLogos[g.identities[0].id] ?? "https://avatars.githubusercontent.com/u/" + g.identities[0].id)}" alt="" width="28" height="28"><b>${e(g.name)}</b></div><div class="agent-track"><span style="--portion:${(g.count / a.ai) * 100}%"></span></div><div class="agent-share"><b>${percent((g.count / a.ai) * 100)}</b><span>${number(g.count)} ${g.count === 1 ? "PR" : "PRs"}</span></div></div>`).join("") : '<p class="empty">No AI-agent authors in this read.</p>'}</div></section>`;
}
function result(p: AiPage, v: View): string {
  const a = p.analysis,
    row = v.board.find((r) => r.repository === p.repository),
    points = comparableHistory(
      v.history[p.repository] ?? [],
      v.classificationId,
    ),
    daily = points.filter(
      (x, i, arr) =>
        i === 0 ||
        x.capturedAt.slice(0, 10) !== arr[i - 1].capturedAt.slice(0, 10),
    );
  return `<section class="repo-result${row?.rank === 1 ? " leader-repo" : ""}" data-repository="${e(p.repository)}"${row ? ` data-rank="${row.rank}"` : ""}><div class="repo-heading"><div class="repo-identity"><a href="${p.url}" target="_blank" rel="noopener noreferrer" aria-label="${e(p.repository)} on GitHub"><img class="repo-avatar" src="https://avatars.githubusercontent.com/u/${p.profile?.owner?.id ?? 0}?s=160" alt="" width="64" height="64"></a><div><h1><a href="${p.url}" target="_blank" rel="noopener noreferrer">${e(p.repository).replace("/", "/<wbr>")}</a></h1><p class="description">${e(p.description)}</p></div></div><div class="read-controls"><span>Read <time data-timestamp datetime="${e(p.capturedAt)}">${friendlyTimestamp(p.capturedAt)}</time></span><div class="repo-actions"><a class="external" href="${p.url}" target="_blank" rel="noopener noreferrer">${githubIcon}View on GitHub</a><button id="refresh" class="refresh-button" type="button">${refreshIcon}Refresh</button></div></div></div>${note(p)}${loadingMarkup()}<div class="score-shell"><div class="score-card">${row ? `<a class="ranking" href="/?focus=${encodeURIComponent(p.repository)}#${rowId(p.repository)}" title="See rank #${row.rank} on the leaderboard">#${row.rank}</a>` : ""}<div class="score-copy"><div class="score-line"><strong class="score">${percent(a.share)}</strong><span>Merged PRs by AI agents</span></div></div><div class="score-detail"><p class="score-count">${number(a.ai)} / ${number(a.total)} merged PRs · 90 days</p><div class="meter" role="img" aria-label="${a.ai} AI-agent PRs out of ${a.total} merged PRs">${[
    ["ai", a.ai],
    ["accounts", a.accounts],
    ["automation", a.automation],
    ["unknown", a.unknown],
  ]
    .filter((x) => Number(x[1]) > 0)
    .map(
      (x) =>
        `<span class="${x[0]}" style="--portion:${(Number(x[1]) / a.total) * 100}%"></span>`,
    )
    .join(
      "",
    )}</div><dl class="count-grid"><div><dt><i class="dot ai"></i>AI agents</dt><dd>${number(a.ai)}</dd></div><div><dt><i class="dot accounts"></i>User accounts</dt><dd>${number(a.accounts)}</dd></div><div><dt><i class="dot automation"></i>Other bots</dt><dd>${number(a.automation)}</dd></div></dl></div></div></div>${agentMix(p)}${
    daily.length >= 2
      ? `<section class="history"><h2>Over time</h2><ol>${daily
          .slice(-14)
          .map(
            (h) =>
              `<li><time>${friendlyDate(h.capturedAt)}</time><b>${percent((h.ai / h.total) * 100)}</b><span>${number(h.ai)} / ${number(h.total)}</span></li>`,
          )
          .join("")}</ol></section>`
      : ""
  }</section>`;
}
function home(v: View, focus?: string, sort: SortDirection = "desc"): string {
  const rows = listing(v, sort),
    first = rows.slice(
      0,
      Math.max(
        30,
        focus
          ? rows.findIndex(
              (p) => p.repository.toLowerCase() === focus.toLowerCase(),
            ) + 1
          : 30,
      ),
    );
  return `<section class="hero"><h1>How much of your repo <br>comes from <span>AI agents?</span></h1><form class="lookup" id="repo-form" action="/" method="get"><label class="sr-only" for="repo-input">GitHub repository</label><div class="repo-input-wrap"><span class="input-symbol">${githubIcon}</span><input id="repo-input" name="repo" placeholder="e.g. usestrix/strix" maxlength="200" required autocomplete="off" autocapitalize="none" spellcheck="false"></div><button>Check repo</button></form>${loadingMarkup()}<nav class="stack-repos" aria-label="Explore familiar technologies">${curatedRepos
    .filter((r) =>
      v.pages.some(
        (p) =>
          p.repositoryId === r.id &&
          p.analysis.complete &&
          p.analysis.total >= 100,
      ),
    )
    .map(
      (r) =>
        `<a href="${repoPath(r.repository)}"><img src="https://avatars.githubusercontent.com/u/${r.ownerId}?s=48" width="22" height="22" alt="">${e(r.label)}</a>`,
    )
    .join(
      "",
    )}</nav></section><section class="board" id="repos"><div class="table-scroll"><table><caption>Tracked repos</caption><thead><tr><th scope="col">Rank</th><th scope="col" class="repo-label">Repository</th><th scope="col" class="pr-share" aria-sort="${sort === "asc" ? "ascending" : "descending"}"><a class="sort-link" href="?sort=${sort === "asc" ? "desc" : "asc"}#repos" aria-label="Sort AI PR share ${sort === "asc" ? "descending" : "ascending"}">AI PRs <svg class="sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${sort === "asc" ? "M12 19V5m-6 6 6-6 6 6" : "M12 5v14m-6-6 6 6 6-6"}"/></svg></a></th></tr></thead><tbody id="repo-rows">${rowsMarkup(first)}</tbody></table></div><div id="scroll-sentinel" data-offset="${first.length}" data-sort="${sort}" data-version="${e(viewVersion(v))}" ${first.length >= rows.length ? "hidden" : ""}><button id="more-repos" type="button">Load more</button></div><p id="list-status" role="status"></p></section>`;
}
export function pageHtml(
  v: View,
  origin: string,
  options: {
    page?: AiPage;
    error?: string;
    focus?: string;
    sort?: SortDirection;
  } = {},
): string {
  const p = options.page,
    path = p ? repoPath(p.repository) : "/",
    title = p ? p.repository + " · AI Pilled" : "AI Pilled",
    description = p
      ? `${formatShare(p.analysis.share)} of merged PRs from AI-agent accounts. ${p.analysis.ai} / ${p.analysis.total} merged PRs in this read.`
      : "AI-agent activity across GitHub repos.",
    image = origin + "/_og" + (p ? repoPath(p.repository) : "/site") + ".png";
  const content = options.error
    ? `<section class="error"><h1>Repo read unavailable</h1><p>${e(options.error)}</p><a href="/">Back to repos</a></section>`
    : p
      ? result(p, v)
      : home(v, options.focus, options.sort);
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="preconnect" href="https://avatars.githubusercontent.com"><title>${e(title)}</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${e(origin + path)}"><meta property="og:type" content="website"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(origin + path)}"><meta property="og:image" content="${e(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${e(image)}"><link rel="icon" href="/favicon.svg"><script src="/theme-init.js"></script><link rel="stylesheet" href="/styles.css"><script type="module" src="/app.js"></script></head><body>${masthead()}<a class="skip-link" href="#main">Skip to content</a><main id="main">${content}</main>${footer()}</body></html>`;
}
