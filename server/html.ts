import {
  friendlyDate,
  friendlyRange,
  friendlyTimestamp,
} from "../src/dates.js";
import {
  aiSummary,
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
  number = (n: number) => n.toLocaleString("en-US");
const percent = (share: number | null) => e(formatShare(share));
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
type IconName = "sun" | "moon" | "system" | "leaderboard" | "arrow" | "github";
function icon(name: IconName): string {
  const paths: Record<IconName, string> = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon: '<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>',
    system:
      '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    leaderboard: '<path d="M3 21V11h6v10M9 21V3h6v18m0 0V8h6v13M2 21h20"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    github:
      '<path d="M9 19c-4 1-4-2-6-2m12 5v-3.5a3 3 0 0 0-.8-2.3c3-.3 6-1.5 6-6.5A5 5 0 0 0 19 6.3a5 5 0 0 0-.1-3.6S17.7 2.4 15 4a13 13 0 0 0-6 0C6.3 2.4 5.1 2.7 5.1 2.7A5 5 0 0 0 5 6.3a5 5 0 0 0-1.4 3.9c0 5 3 6.2 6 6.5a3 3 0 0 0-.8 2.3V22"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
function masthead(): string {
  return `<header class="masthead"><a class="brand" href="/" aria-label="AI Pilled home"><span class="brand-icon" aria-hidden="true"><span class="pill-mark"></span></span>AI PILLED<span class="beta">BETA</span></a><div class="header-actions"><a class="leaderboards-link" href="/leaderboard" aria-label="Leaderboard">${icon("leaderboard")}<span class="leaderboards-text">Leaderboard</span></a><div class="theme-picker" role="group" aria-label="Color theme">${(["light", "dark", "system"] as const).map((c) => `<button type="button" data-theme-choice="${c}" aria-label="${c[0].toUpperCase() + c.slice(1)}" aria-pressed="${c === "system"}">${icon(c === "light" ? "sun" : c === "dark" ? "moon" : "system")}</button>`).join("")}</div></div></header>`;
}
function footer(): string {
  return `<footer class="site-footer"><span>Built for fun by <a href="https://polylane.com/?utm_source=ai-pilled" target="_blank" rel="noopener noreferrer">Polylane</a>.</span><a href="https://github.com/coreplanelabs/pilledrepos" target="_blank" rel="noopener noreferrer">${icon("github")} View the source</a></footer>`;
}
function repoLabel(p: AiPage): string {
  return `<span class="repo-name"><img src="https://avatars.githubusercontent.com/u/${p.profile?.owner?.id ?? 0}?s=64" alt="" width="30" height="30" loading="lazy"><span><span class="owner">${e(p.repository.split("/")[0])} / </span>${e(p.repository.split("/")[1])}</span></span>`;
}
function meter(p: AiPage): string {
  const a = p.analysis,
    parts = [
      ["ai", "Known AI agents", a.ai],
      ["accounts", "User accounts", a.accounts],
      ["automation", "Other bots", a.automation],
      ["unknown", "Unknown authors", a.unknown],
    ] as const;
  return `<div class="meter" role="img" aria-label="${parts.map((x) => x[1] + ": " + x[2]).join("; ")}">${parts
    .filter((x) => x[2] > 0)
    .map(
      (x) =>
        `<span class="${x[0]}" style="--portion:${(x[2] / a.total) * 100}%"></span>`,
    )
    .join(
      "",
    )}</div><dl class="count-grid">${parts.map((x) => `<div><dt><span class="dot ${x[0]}"></span>${x[1]}</dt><dd>${number(x[2])}</dd></div>`).join("")}</dl>`;
}
function table(view: View, limit = 10): string {
  const preview = !view.complete,
    rows = preview
      ? [...view.pages]
          .sort(
            (a, b) =>
              b.analysis.share! - a.analysis.share! ||
              b.analysis.total - a.analysis.total,
          )
          .filter((p) => p.analysis.total >= MIN_MERGES)
          .slice(0, limit)
      : view.board.slice(0, limit);
  return `<div class="table-scroll"><table><thead><tr><th scope="col">${preview ? "" : "Rank"}</th><th scope="col">Repository</th><th scope="col">Known AI share</th><th scope="col" class="wide">AI / merged PRs</th></tr></thead><tbody>${rows.map((p) => `<tr><td class="rank">${"rank" in p ? "#" + p.rank : "—"}</td><th scope="row"><a href="${repoPath(p.repository)}">${repoLabel(p)}</a></th><td><b>${percent(p.analysis.share)}</b><small class="mobile-count">${number(p.analysis.ai)} / ${number(p.analysis.total)}</small><div class="mini-meter"><span style="--portion:${p.analysis.share ?? 0}%"></span></div></td><td class="wide mono">${number(p.analysis.ai)} / ${number(p.analysis.total)}</td></tr>`).join("") || '<tr><td colspan="4">No repositories meet the ranking minimum yet.</td></tr>'}</tbody></table></div>`;
}
function note(p: AiPage): string {
  if (p.collector !== "legacy-preview" && !p.analysis.complete)
    return '<p class="notice">Incomplete read. These counts describe the captured PRs and cannot support a rank or a repo-wide estimate.</p>';
  return p.collector === "legacy-preview"
    ? '<p class="notice">Legacy preview. These copied checkpoints include discussion-heavy PRs. The share describes this sample. It cannot support a rank or a repo-wide estimate.</p>'
    : p.analysis.total < MIN_MERGES
      ? `<p class="notice">Small window: ${p.analysis.total} merged PRs. We show the counts but require ${MIN_MERGES} merges before ranking.</p>`
      : "";
}
function agentMix(p: AiPage): string {
  const a = p.analysis;
  return `<section class="panel agent-mix"><div class="panel-heading"><h2>Agent mix</h2><p class="subtle">Share of known AI-agent PRs</p></div>${a.agents.length ? a.agents.map((g) => `<div class="agent"><div><b>${e(g.name)}</b><span class="mono">${number(g.count)} PRs · ${percent((g.count / a.ai) * 100)}</span></div><div class="agent-bar"><span style="--portion:${(g.count / a.ai) * 100}%"></span></div><details class="agent-proof"><summary>View sources and PRs</summary><div class="proof-links">${g.identities.map((i) => `<a href="${e(i.accountUrl)}">Account ${i.id} ↗</a><a href="${e(i.source)}">Official source ↗</a>`).join("")}</div><ul>${g.evidence.map((pr) => `<li><a href="${e(pr.url)}">#${pr.number} · ${e(pr.title)} ↗</a></li>`).join("")}</ul></details></div>`).join("") : '<p class="empty">No known AI-agent authors in this window.</p>'}</section>`;
}
function comparisonCard(p: AiPage, view: View, comparison?: AiPage): string {
  const target = comparison ?? view.board[0],
    same = target?.repository.toLowerCase() === p.repository.toLowerCase(),
    leader = target?.repository === view.board[0]?.repository;
  const pages = target ? (same ? [p] : [p, target]) : [];
  return `<section class="panel compare"><div class="panel-heading"><h2>Compare repos</h2><p class="subtle">${same ? "This repo leads the leaderboard." : target && leader ? "Against the #1 repo on the leaderboard." : target ? "Known AI-agent share in each repo." : "Choose a repo to compare."}</p></div>${pages.length ? `<div class="comparison-pair${same ? " single" : ""}">${pages.map((v) => `<a href="${repoPath(v.repository)}"><span class="comparison-label">${v.repository === view.board[0]?.repository ? "#1 · Leaderboard leader" : v.repository === p.repository ? "This repo" : "Comparison repo"}</span><span class="comparison-name">${e(v.repository)}</span><b>${percent(v.analysis.share)}</b><span class="comparison-count">${number(v.analysis.ai)} / ${number(v.analysis.total)} merged PRs</span>${v.collector === "legacy-preview" ? "<small>Legacy preview · biased sample</small>" : !v.analysis.complete ? "<small>Incomplete window · unranked</small>" : v.analysis.total < MIN_MERGES ? "<small>Small window · unranked</small>" : ""}<time datetime="${e(v.capturedAt)}">${friendlyDate(v.capturedAt)}</time></a>`).join("")}</div>` : ""}<form action="${repoPath(p.repository)}"><label for="compare">${same ? "Compare with another repo" : "Choose another repo"}</label><div class="compare-input"><input id="compare" name="compare" placeholder="owner/repo or GitHub URL" maxlength="200" autocomplete="off" autocapitalize="none" spellcheck="false" required><button>Compare ${icon("arrow")}</button></div></form></section>`;
}
function result(p: AiPage, view: View, comparison?: AiPage): string {
  const a = p.analysis,
    row = view.board.find((r) => r.repository === p.repository),
    history = comparableHistory(
      view.history[p.repository] ?? [],
      view.classificationId,
    ),
    points = history.filter(
      (v, i, arr) =>
        i === 0 ||
        v.capturedAt.slice(0, 10) !== arr[i - 1].capturedAt.slice(0, 10),
    );
  const historyHtml =
    points.length >= 2
      ? `<section class="panel history"><div class="panel-heading"><h2>Change over time</h2><p class="subtle">Share of merged PRs over rolling 90-day windows</p></div><ol>${points
          .slice(-14)
          .map(
            (h) =>
              `<li><time datetime="${e(h.capturedAt)}">${friendlyDate(h.capturedAt)}</time><b>${percent((h.ai / h.total) * 100)}</b><span>${number(h.ai)} / ${number(h.total)}</span></li>`,
          )
          .join("")}</ol></section>`
      : "";
  const since = new Date(
    Date.parse(p.capturedAt) - 90 * 86400000,
  ).toISOString();
  return `<section class="repo-result"><div class="repo-heading"><div><p class="eyebrow">Public GitHub repository</p><h1>${e(p.repository)}</h1><p class="subtle description">${e(p.description)}</p><a class="external" href="${p.url}">${icon("github")}View on GitHub</a></div><img class="repo-avatar" src="https://avatars.githubusercontent.com/u/${p.profile?.owner?.id ?? 0}?s=160" alt="" width="72" height="72"></div>${note(p)}<div class="score-card"><div class="score-copy"><span class="eyebrow">Known AI-agent share</span><strong class="score">${percent(a.share)}</strong><h2>${e(aiSummary(p))}</h2><p class="score-count">${number(a.ai)} of ${number(a.total)} ${p.collector === "legacy-preview" ? "observed " : ""}merged PRs</p><p class="subtle window-date">${friendlyRange(since, p.capturedAt)} · 90 days</p><button class="share-button" id="share">Copy repo link ${icon("arrow")}</button></div><div class="score-detail"><p class="ranking">${row ? `<strong>#${row.rank}</strong> of ${view.board.length} eligible repos` : "<strong>Unranked</strong>"}</p><p class="subtle">${e(view.pool)}</p>${meter(p)}<p class="caveat">User accounts may also use AI. These counts describe authors, not who wrote every line.</p></div></div><div class="details-grid">${agentMix(p)}${comparisonCard(p, view, comparison)}</div>${historyHtml}<div class="read-footnote"><span>Read <time data-timestamp datetime="${e(p.capturedAt)}">${friendlyTimestamp(p.capturedAt)}</time></span><a href="/registry">${view.registry.agents.length} verified accounts</a><a href="/method">Method and limits</a></div></section>`;
}
export function pageHtml(
  view: View,
  origin: string,
  options: {
    page?: AiPage;
    comparison?: AiPage;
    board?: boolean;
    limit?: number;
    method?: boolean;
    registry?: boolean;
    error?: string;
  } = {},
): string {
  const p = options.page,
    path = p
      ? repoPath(p.repository)
      : options.method
        ? "/method"
        : options.registry
          ? "/registry"
          : options.board
            ? "/leaderboard" + (options.limit === 100 ? "/top-100" : "")
            : "/",
    title = p
      ? p.repository + " · AI Pilled"
      : options.board
        ? "Known AI-agent leaderboard · AI Pilled"
        : "AI Pilled · Known AI-agent activity on GitHub",
    description = p
      ? aiSummary(p)
      : "Compare merged PRs from known AI agents across public GitHub repos. Verified account IDs, public evidence, clear limits.",
    og = origin + "/_og" + (p ? repoPath(p.repository) : "/site") + ".png";
  const content = options.error
    ? `<section class="panel error" role="alert"><h1>Repo read unavailable</h1><p>${e(options.error)}</p><a href="/">Try another repo →</a></section>`
    : p
      ? result(p, view, options.comparison)
      : options.method
        ? `<section class="prose"><p class="eyebrow">Method</p><h1>Authors, with evidence.</h1><p>Known AI share is the number of merged pull requests whose author matches a verified AI-agent account ID, divided by all merged PRs in the same rolling 90-day window.</p><h2>Four separate counts</h2><p>Known AI agents match the registry by stable GitHub ID. Other GitHub Bot accounts count as other bots. Non-bot accounts count as user accounts. Missing authors count as unknown. User accounts do not prove human-written code. Coauthor credits and AI-assisted code are outside this measure.</p><h2>Collection</h2><p>We query PRs by merge date and split large windows below GitHub’s 1,000-result search limit. Every page count must match the captured records. We do not select by comment count. A failed or capped read keeps the previous complete index.</p><h2>Ranking</h2><p>Only complete windows with at least ${MIN_MERGES} merged PRs qualify. At that threshold, one PR changes the share by at most one percentage point. This is a stability rule, not a confidence guarantee. Equal shares have equal ranks. The pool is ${e(view.pool)}; rank does not represent all of GitHub.</p><h2>Coverage and limits</h2><p>The collector reads public PRs that still exist at capture time. GitHub pagination is not an atomic historical snapshot. Deleted records and edits during a read can affect coverage. Large, incomplete, and legacy reads cannot rank. A zero means no matched agent authors in this read, not no AI use.</p><h2>Registry and history</h2><p>Daily reads verify registered IDs, fetch official agent declarations, and resolve explicitly documented app identities. New bot candidates remain other bots until authoritative evidence confirms an AI agent. Every index retains the registry version and source digests. History uses real completed reads with the same account classification. Copied checkpoints do not establish historical movement.</p><p><a href="/registry">Review the registry →</a></p></section>`
        : options.registry
          ? `<section class="prose"><p class="eyebrow">Public evidence</p><h1>Known agent accounts.</h1><p>Verified ${friendlyDate(view.registry.verifiedAt)}. IDs stay stable when display names change. Two accounts can represent the same agent.</p><ul class="registry-list">${view.registry.agents.map((a) => `<li><b>${e(a.name)}</b><span class="mono">${a.id} · ${e(a.login)}</span><a href="${e(a.accountUrl)}">GitHub app ↗</a><a href="${e(a.source)}">Official source ↗</a></li>`).join("")}</ul><p class="subtle">Registry version ${e(view.registryId.slice(0, 12))}. This registry does not detect all AI use.</p></section>`
          : options.board
            ? `<section class="board"><p class="eyebrow">${e(view.pool)}</p><h1>${view.complete ? "Known AI-agent leaderboard" : "Repo comparison preview"}</h1><p class="subtle">${view.complete ? `Highest AI share · ${MIN_MERGES}+ merged PRs · complete 90-day windows` : "Biased legacy samples · no eligible ranks"}</p>${table(view, options.limit ?? 10)}<div class="board-footer"><span>${view.complete ? view.board.length + " eligible" : view.pages.length + " preview"} repos · read ${friendlyDate(view.capturedAt)}</span><a href="${options.limit === 100 ? "/leaderboard" : "/leaderboard/top-100"}">View top ${options.limit === 100 ? "10" : "100"} →</a></div></section>`
            : `<section class="hero"><p class="eyebrow"><span class="live-dot"></span> Public GitHub repos. Verified agent accounts.</p><h1>How much of your repo<br>comes from <span>AI agents?</span></h1><p>Count known AI-agent PR authors.<br>Compare repos. Follow the evidence.</p><form class="lookup" action="/"><label class="sr-only" for="repo-input">GitHub repository</label><input id="repo-input" name="repo" placeholder="owner/repo or GitHub URL" required autocomplete="off"><button>Check repo <span aria-hidden="true">→</span></button></form></section><section class="board"><div class="section-heading"><div><p class="eyebrow">${e(view.pool)}</p><h2>${view.complete ? "Known AI-agent leaderboard" : "Repo comparison preview"}</h2></div><a href="/leaderboard">View leaderboard ↗</a></div><p class="subtle">${view.complete ? `Ranked by share · ${MIN_MERGES}+ merged PRs · complete 90-day windows` : "Copied samples include discussion-heavy PRs. Preview shares are unranked."}</p>${table(view)}<div class="board-footer"><span>Read ${friendlyDate(view.capturedAt)} · ${view.complete ? view.board.length + " eligible" : view.pages.length + " preview"} repos</span><a href="/method">How we count →</a></div></section><section class="principles"><div><span class="mono">01</span><h3>IDs, not guesses</h3><p>Only verified agent accounts count as AI. Names and bios do not decide.</p></div><div><span class="mono">02</span><h3>Every count has a scope</h3><p>See the denominator, capture date, and public PR evidence.</p></div><div><span class="mono">03</span><h3>People can use AI, too</h3><p>A user account does not prove human-written code. This is one visible signal.</p></div></section>`;
  return `<!doctype html><html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(title)}</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${e(origin + path)}"><meta property="og:type" content="website"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(origin + path)}"><meta property="og:image" content="${e(og)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${e(description)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${e(og)}"><meta name="twitter:title" content="${e(title)}"><meta name="twitter:description" content="${e(description)}"><link rel="icon" href="/favicon.svg"><script src="/theme-init.js"></script><link rel="stylesheet" href="/styles.css"><script type="module" src="/app.js"></script></head><body>${masthead()}<main>${content}</main>${footer()}<div id="status" class="toast" role="status" hidden></div></body></html>`;
}
