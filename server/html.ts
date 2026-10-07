import type { Report } from "../src/core.js";
import { avatarPath, CATEGORIES, repositoryPath, type LeaderboardRow } from "../src/catalog.js";
import { boardMarkup, cardsMarkup, escapeHtml, hook, navigationMarkup, standingsMarkup, castFaces, glyph, helpButton, cohortMarkup, suggestionsMarkup, boardNote, championsMarkup, type Champion } from "../src/view.js";
export function safeJson(value: unknown): string { return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }
function content(html: string, id: string, value: string): string {
  const pattern = new RegExp(`(<(?:div|p|h[1-6]|section)[^>]*id="${id}"[^>]*>)([\\s\\S]*?)(<\\/(?:div|p|h[1-6]|section)>)`);
  return html.replace(pattern, (_, start: string, _old: string, end: string) => start + value + end);
}
function meta(html: string, id: string, value: string): string { return html.replace(new RegExp(`(<meta id="${id}"[^>]*content=")[^"]*(")`), (_, start: string, end: string) => start + escapeHtml(value) + end); }
import { chartsMarkup } from "../src/charts.js";
import type { CardStandings } from "../src/neighbors.js";
import type { StarHistory } from "../src/star-history.js";
import type { DailyPoint } from "../src/analytics.js";
export function pageHtml(template: string, origin: string, report?: Report, board?: { category: string; rows: LeaderboardRow[]; cohort?: string; warming?: boolean; selected?: number; provisional?: boolean; limit?: number; total?: number; indexed?: number; refreshedAt?: string }, presentation?: { history: DailyPoint[]; comparison: LeaderboardRow[]; stars?: StarHistory | null; neighbors?: CardStandings }, suggestions?: LeaderboardRow[], champions?: Champion[]): string {
  const title = report ? `${report.repository} — Repo Lore` : board ? `${board.limit===100 ? "Top 100 · " : ""}${CATEGORIES[board.category].name} — Repo Lore` : "Repo Lore — your repo has lore";
  const path = report ? repositoryPath(report.repository) : board ? `/leaderboards/${board.category}${board.limit === 100 ? "/top-100" : ""}` : "/";
  const description = report ? hook(report) : board ? CATEGORIES[board.category].measure : "The people, pull requests, and plot twists behind your favorite GitHub repo.";
  const image = report ? `${origin}/_og${repositoryPath(report.repository)}.png?v=${Date.parse(report.capturedAt)}` : board ? `${origin}/_og/leaderboards/${board.category}.png?cohort=${board.cohort ?? "trending"}` : `${origin}/_og/site.png`;
  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`).replace(/(<link id="canonical"[^>]*href=")[^"]*(")/, (_, start: string, end: string) => start + escapeHtml(origin + path) + end);
  for (const [id, value] of Object.entries({ "og-title": title, "og-description": description, "og-url": origin + path, "og-image": image, "twitter-image": image, "twitter-title":title,"twitter-description":description,"twitter-alt":title+": "+description,"og-alt":title+": "+description })) html = meta(html, id, value);
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, (_, start: string, end: string) => start + escapeHtml(description) + end);
  if (report) {
    html = html.replace('<html lang="en-US">', '<html lang="en-US" class="has-report">').replace('id="result" class="result" aria-labelledby="result-title" hidden', 'id="result" class="result" aria-labelledby="result-title"');
    html = html.replace('id="repo-lookup" class="repo-lookup" open', 'id="repo-lookup" class="repo-lookup"');
    html = content(html, "result-title", escapeHtml(report.repository)); html = content(html, "repo-description", escapeHtml(report.description));
    html = content(html, "repo-hook", escapeHtml(description)); html = content(html, "header-cast", castFaces(report));
    html = content(html, "insights", chartsMarkup(report, presentation?.history, presentation?.comparison, presentation?.stars));
    html = content(html, "awards", cardsMarkup(report, presentation?.neighbors)); html = content(html, "standings", standingsMarkup(report));
    html = html.replace('<script id="repo-data" type="application/json">null</script>', `<script id="repo-data" type="application/json">${safeJson({ ...report, presentation })}</script>`);
    if (report.profile?.owner) html = html.replace('<img id="repo-avatar" alt="" width="96" height="96" hidden>', `<img id="repo-avatar" src="${avatarPath(report.profile.owner, 256)}" alt="${escapeHtml(report.repository.split("/")[0])}" width="96" height="96">`);
    html = content(html, "repo-meta", escapeHtml([report.profile?.stars !== null && report.profile?.stars !== undefined ? `${report.profile.stars.toLocaleString("en-US")} stars` : "", report.profile?.language ?? ""].filter(Boolean).join(" · ")));
    html = html.replace('id="repo-input" name="repo"', `id="repo-input" name="repo" value="${escapeHtml(report.repository)}"`);
    const coverage = `${report.coverage.mergedObserved} observed merges · ${report.coverage.detailsRead} PR diffs inspected · Read ${report.capturedAt.slice(0, 10)}`;
    html = html.replace('<span id="scope-text"></span>', `<span id="scope-text">${escapeHtml(coverage)}</span>`);
  }
  if (board) {
    html = html.replace('<html lang="en-US">', '<html lang="en-US" class="has-board">').replace('id="board" class="board" hidden', 'id="board" class="board"');
    html = html.replace('id="board" class="board"', `id="board" class="board" data-category="${board.category}"`);
    html = content(html, "board-emblem", glyph(board.category));
    html = content(html, "board-watermark", glyph(board.category));
    html = content(html, "board-title", escapeHtml(CATEGORIES[board.category].name)); html = content(html, "board-description", escapeHtml(description));
    html = html.replace('<nav id="board-navigation" class="board-navigation" aria-label="Award leaderboards"></nav>', `<nav id="board-navigation" class="board-navigation" aria-label="Award leaderboards">${navigationMarkup(board.category, board.cohort, board.limit)}</nav>`);
    html = content(html, "board-rows", boardMarkup(board.rows));
    html = content(html, "cohort-controls", cohortMarkup(board));
    html = content(html, "board-note", boardNote(board));
    html = html.replace('<script id="board-data" type="application/json">null</script>', `<script id="board-data" type="application/json">${safeJson(board)}</script>`);


  }
  if (suggestions) {
    html = content(html, "repo-suggestions", suggestionsMarkup(suggestions));
    html = html.replace('<script id="home-data" type="application/json">null</script>', `<script id="home-data" type="application/json">${safeJson({suggestions, champions:champions ?? []})}</script>`);
  }
  if(champions) html=content(html,"champions",championsMarkup(champions));
  const structured = { "@context": "https://schema.org", "@type": "WebPage", name: title, description, ...(report?.capturedAt || board?.refreshedAt ? {dateModified:report?.capturedAt ?? board?.refreshedAt} : {}), url: origin + path, image };
  return html.replace('</head>', `<script type="application/ld+json">${safeJson(structured)}</script></head>`);
}
