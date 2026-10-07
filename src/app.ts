import { parseRepository, replayReport, type Report } from "./core.js";
import { avatarPath, CATEGORIES, repositoryFromPath, repositoryPath } from "./catalog.js";
import { cardsMarkup, standingsMarkup, castFaces, hook, boardMarkup, navigationMarkup, cohortMarkup, suggestionsMarkup, glyph, boardNote, championsMarkup, type Champion } from "./view.js";
import { icon, deckArtwork } from "./icons.js";
import { chartsMarkup } from "./charts.js";
import type { DailyPoint } from "./analytics.js";
import type { LeaderboardRow } from "./catalog.js";
import { friendlyTimestamp } from "./dates.js";
import { setupMobileHeader } from "./mobile.js";
import { topTenResult } from "./celebration.js";
import { setupHelp } from "./help.js";
import type { CardStandings } from "./neighbors.js";
import type { StarHistory } from "./star-history.js";
import { resolveTheme, themePreference, type ThemePreference } from "./theme.js";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing interface element ${id}`);
  return found as T;
}
document.querySelectorAll<HTMLElement>("[data-icon]").forEach(node => node.replaceChildren(icon(node.dataset.icon ?? "arrow")));
setupHelp();
const showHeader = setupMobileHeader();
const form = element<HTMLFormElement>("repo-form"), input = element<HTMLInputElement>("repo-input"), submit = element<HTMLButtonElement>("submit-button");
const result = element("result"), loading = element("loading"), error = element("error");
type BoardData = { category: string; rows: LeaderboardRow[]; cohort?: string; warming?: boolean; selected?: number; provisional?: boolean; limit?: number; total?: number; indexed?: number; refreshedAt?: string };
const boardCache = new Map<string, BoardData>(), celebrated = new Set<string>();
let homeRows: LeaderboardRow[] | null = null, homeChampions: Champion[] = [];
const routeNotice = document.createElement("div"); routeNotice.className = "route-notice"; routeNotice.role = "alert"; routeNotice.hidden = true; document.body.append(routeNotice);
const cache = new Map<string, Report>();
const presentationCache = new Map<string, { history: DailyPoint[]; comparison: LeaderboardRow[]; stars?: StarHistory | null; neighbors?: CardStandings }>();
let generation = 0;
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
let preference: ThemePreference = "system";
try { preference = themePreference(localStorage.getItem("repo-arcade-theme")); } catch { /* Storage is optional. */ }
function applyTheme(): void {
  document.documentElement.dataset.theme = resolveTheme(preference, systemTheme.matches);
  const green = getComputedStyle(document.documentElement).getPropertyValue("--brand-green").trim();
  document.querySelectorAll<HTMLElement>("[data-deck]").forEach(node => {
    const svg = new DOMParser().parseFromString(deckArtwork(green), "image/svg+xml").documentElement;
    svg.setAttribute("aria-hidden", "true"); node.replaceChildren(document.importNode(svg, true));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-theme-choice]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.themeChoice === preference)));
}
document.querySelectorAll<HTMLButtonElement>("[data-theme-choice]").forEach(button => button.addEventListener("click", () => {
  preference = themePreference(button.dataset.themeChoice);
  try { localStorage.setItem("repo-arcade-theme", preference); } catch { /* Keep the choice for this page. */ }
  applyTheme();
}));
systemTheme.addEventListener("change", applyTheme); applyTheme();
function celebrate(): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  result.querySelector(":scope > .confetti-burst")?.remove();
  const burst = document.createElement("div"); burst.className = "confetti-burst"; burst.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 28; i++) {
    const piece = document.createElement("span");
    piece.style.setProperty("--dx", `${(Math.random() - .5) * Math.min(result.clientWidth, 800)}px`);
    piece.style.setProperty("--dy", `${90 + Math.random() * 200}px`);
    piece.style.setProperty("--rotation", `${Math.random() * 360}deg`);
    piece.style.setProperty("--delay", `${Math.random() * 140}ms`); burst.append(piece);
  }
  result.append(burst); window.setTimeout(() => burst.remove(), 1700);
}
function imageFallbacks(): void {
  document.querySelectorAll<HTMLImageElement>(".portrait img, #repo-avatar").forEach(image => image.addEventListener("error", () => { image.hidden = true; }));
}
function render(report: Report, presentation?: { history: DailyPoint[]; comparison: LeaderboardRow[]; stars?: StarHistory | null; neighbors?: CardStandings }): void {
  document.documentElement.classList.remove("has-board"); document.documentElement.classList.add("has-report"); element("board").hidden = true; showHeader();
  input.value = report.repository;
  element("result-title").textContent = report.repository;
  element("repo-description").textContent = report.description;
  element("repo-hook").textContent = hook(report);
  element("header-cast").innerHTML = castFaces(report);
  element("insights").innerHTML = chartsMarkup(report, presentation?.history, presentation?.comparison, presentation?.stars);
  submit.replaceChildren(document.createTextNode("Give me the lore "),icon("arrow"));
  element<HTMLDetailsElement>("repo-lookup").open = false;
  const owner = report.profile?.owner, avatar = element<HTMLImageElement>("repo-avatar");
  avatar.hidden = !owner;
  if (owner) { avatar.src = avatarPath(owner, 256); avatar.alt = `${report.repository.split("/")[0]} on GitHub`; }
  const repoLabels = [report.profile?.stars !== null && report.profile?.stars !== undefined ? `${report.profile.stars.toLocaleString("en-US")} stars` : "", report.profile?.language ?? ""].filter(Boolean);
  element("repo-meta").textContent = repoLabels.join(" · ");
  const c = report.coverage;
  element("scope-text").textContent = `90-DAY WINDOW · ${c.mergedObserved} OBSERVED MERGES · ${c.detailsRead} PR DIFFS INSPECTED`;
  element("read-time").textContent = `READ ${friendlyTimestamp(report.capturedAt, undefined, navigator.language)}`;
  element("awards").innerHTML = cardsMarkup(report, presentation?.neighbors);
  element("standings").innerHTML = standingsMarkup(report);
  element("coverage-text").textContent = `Read ${c.closedRead} recently updated closed PRs and ${c.openRead} oldest open PRs. ${c.periodComplete ? "The listing covered the 90-day merge window." : "The closed-PR listing is a bounded sample; some merges can be missing."} Diff awards cover ${c.detailsRead} of ${c.detailsRequested} selected recent merged PRs.`;
  element("notes").replaceChildren(...report.notes.map(note => { const li = document.createElement("li"); li.textContent = note; return li; }));
  element("contribute-text").textContent = "Check the project's contribution guide before coding. The awards do not tell you whether outside PRs are welcome.";
  const link = element<HTMLAnchorElement>("contribute-link"); link.href = report.contributingUrl ?? `${report.url}#readme`;
  link.textContent = report.contributingUrl ? "Read the house rules" : "Check the project docs";
  metadata(`${report.repository} — Repo Lore`, hook(report), repositoryPath(report.repository), `${location.origin}/_og${repositoryPath(report.repository)}.png?v=${Date.parse(report.capturedAt)}`);
  result.hidden = false; imageFallbacks();
  if (location.hash) requestAnimationFrame(() => {
    const category = location.hash.slice("#award-".length);
    if (location.hash.startsWith("#award-") && CATEGORIES[category]) document.getElementById(`award-${category}`)?.scrollIntoView({ block: "start", behavior: "instant" });
  });
}
const loadingLines = ["Shuffling the repo lore…", "Polishing the tiny trophies…", "Looking for plot twists…", "Who brought the scissors?", "Sorting out the cast…"];
async function load(raw: string, navigate = true, hash = "", submitted = false): Promise<void> {
  const run = ++generation;
  error.hidden = true; result.hidden = true; routeNotice.hidden = true; element("board").hidden = true; document.documentElement.classList.remove("has-board", "is-navigating");
  let repository: string;
  try { repository = parseRepository(raw); }
  catch (cause) { element("error-text").textContent = cause instanceof Error ? cause.message : "Enter a public GitHub repository."; error.hidden = false; return; }
  input.value = repository; loading.hidden = false; submit.disabled = true; input.disabled = true;
  let line = 0; element("loading-whimsy").textContent = loadingLines[0]; element("progress-text").textContent = "Meeting the cast and reading the plot…";
  const timer = window.setInterval(() => { if (run === generation) element("loading-whimsy").textContent = loadingLines[++line % loadingLines.length]; }, 2200);
  try {
    let details: { history: DailyPoint[]; comparison: LeaderboardRow[]; stars?: StarHistory | null; neighbors?: CardStandings } | undefined;
    let expected = repository;
    let report = cache.get(repository.toLowerCase()); details = presentationCache.get(repository.toLowerCase());
    if (!report) {
      const response = await fetch(`/api/repos${repositoryPath(repository)}`, { signal: AbortSignal.timeout(30_000) });
      if (response.redirected) { expected = repositoryFromPath(new URL(response.url).pathname.slice(10)) ?? repository; }
      const body = await response.json() as { error?: string; presentation?: { history: DailyPoint[]; comparison: LeaderboardRow[]; stars?: StarHistory | null; neighbors?: CardStandings } };
      if (!response.ok) throw new Error(body.error ?? "This round could not be loaded. Try again later.");
      report = replayReport(body); details = body.presentation; if (details) presentationCache.set(report.repository.toLowerCase(), details);
    }
    if (run !== generation) return;
    if (report.repository.toLowerCase() !== expected.toLowerCase()) throw new Error("The result did not match this repository.");
    cache.set(repository.toLowerCase(), report); render(report, details);
    if (navigate) history.pushState(null, "", repositoryPath(report.repository) + hash);
    reward(report, details?.neighbors, submitted);
    if (!scrollToAward()) result.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  } catch (cause) {
    if (run === generation) { element("error-text").textContent = cause instanceof Error ? cause.message : "This round could not be loaded."; error.hidden = false; }
  } finally {
    window.clearInterval(timer);
    if (run === generation) { loading.hidden = true; submit.disabled = false; input.disabled = false; }
  }
}
function scrollToAward(): boolean {
  const category = location.hash.slice("#award-".length);
  if (!location.hash.startsWith("#award-") || !CATEGORIES[category]) return false;
  document.getElementById(`award-${category}`)?.scrollIntoView({ block: "start", behavior: "instant" }); return true;
}
function reward(report: Report, standings?: CardStandings, submitted = false): void {
  const key = report.repository.toLowerCase() + ":" + report.capturedAt;
  if (submitted || (!celebrated.has(key) && topTenResult(standings))) celebrate();
  celebrated.add(key);
}
function localTimes(): void { document.querySelectorAll<HTMLElement>("[data-local-time]").forEach(node => { const value = node.getAttribute("datetime"); if (value) node.textContent = friendlyTimestamp(value, undefined, navigator.language); }); }
localTimes();
function metadata(title: string, description: string, path: string, image: string): void {
  document.title = title; element<HTMLLinkElement>("canonical").href = location.origin + path;
  for (const [id, value] of Object.entries({ "og-title": title, "og-description": description, "og-url": location.origin + path, "og-image": image, "twitter-image": image, "twitter-title":title,"twitter-description":description,"twitter-alt":title+": "+description,"og-alt":title+": "+description })) element<HTMLMetaElement>(id).content = value;
  document.querySelector<HTMLMetaElement>('meta[name="description"]')!.content = description;
  const structured = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
  if (structured) structured.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: title, description, url: location.origin + path, image });
}
function renderBoard(data: BoardData): void {
  const wasBoard = document.documentElement.classList.contains("has-board"), rail = element("board-navigation"), x = wasBoard ? rail.scrollLeft : 0;
  document.documentElement.classList.remove("has-report"); document.documentElement.classList.add("has-board");
  result.hidden = true; loading.hidden = true; error.hidden = true; element("board").hidden = false; element("board").dataset.category = data.category;
  element("board-title").textContent = CATEGORIES[data.category].name; element("board-description").textContent = CATEGORIES[data.category].measure;
  element("board-emblem").innerHTML = element("board-watermark").innerHTML = glyph(data.category);
  rail.innerHTML = navigationMarkup(data.category, data.cohort, data.limit); rail.scrollLeft = x;
  element("cohort-controls").innerHTML = cohortMarkup(data); element("board-note").innerHTML = boardNote(data); localTimes(); element("board-rows").innerHTML = boardMarkup(data.rows); imageFallbacks();
  metadata(`${data.limit===100 ? "Top 100 · " : ""}${CATEGORIES[data.category].name} — Repo Lore`, CATEGORIES[data.category].measure, `/leaderboards/${data.category}${data.limit === 100 ? "/top-100" : ""}`, `${location.origin}/_og/leaderboards/${data.category}.png?cohort=${data.cohort ?? "trending"}`);
  if (!wasBoard) window.scrollTo({ top: 0, behavior: "instant" });
  rail.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" }); showHeader();
}
async function loadBoard(url: URL, push = true): Promise<void> {
  const category = url.pathname.split("/")[2], limit = url.pathname.endsWith("/top-100") ? 100 : 10, cohort = url.searchParams.get("cohort") === "top" ? "top" : "trending", key = `${category}:${cohort}:${limit}`, run = ++generation;
  routeNotice.hidden = true; document.documentElement.classList.add("is-navigating");
  try {
    let data = boardCache.get(key);
    if (!data) {
      const response = await fetch(`/api/leaderboards/${category}?cohort=${cohort}&limit=${limit}`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("This leaderboard could not load. Try again.");
      data = await response.json() as BoardData;
      if (data.category !== category || data.cohort !== cohort || data.limit !== limit || !Array.isArray(data.rows)) throw new Error("This leaderboard could not load. Try again.");
      boardCache.set(key, data);
    }
    if (run !== generation) return;
    renderBoard(data); if (push) history.pushState(null, "", `/leaderboards/${category}${limit === 100 ? "/top-100" : ""}${cohort === "top" ? "?cohort=top" : ""}`);
  } catch { if (run === generation) { routeNotice.textContent = "This leaderboard could not load. Try again."; routeNotice.hidden = false; } }
  finally { if (run === generation) { document.documentElement.classList.remove("is-navigating"); input.disabled = submit.disabled = false; } }
}
async function home(push = true): Promise<void> {
  const run = ++generation; result.hidden = loading.hidden = error.hidden = element("board").hidden = true; input.disabled = submit.disabled = false;
  routeNotice.hidden = true; document.documentElement.classList.remove("has-report", "has-board", "is-navigating"); element<HTMLDetailsElement>("repo-lookup").open = true;
  metadata("Repo Lore — your repo has lore", "The people, pull requests, and plot twists behind your favorite GitHub repo.", "/", location.origin + "/_og/site.png");
  if (push) history.pushState(null, "", "/"); window.scrollTo({ top: 0, behavior: "instant" }); showHeader();
  if (!homeRows) try { const response = await fetch("/api/home", { signal: AbortSignal.timeout(10_000) }); if (response.ok) { const data=await response.json() as {suggestions:LeaderboardRow[];champions:Champion[]}; homeRows=data.suggestions; homeChampions=data.champions; } } catch { /* Repo input remains available. */ }
  if (run === generation) { element("repo-suggestions").innerHTML = suggestionsMarkup(homeRows ?? []); element("champions").innerHTML=championsMarkup(homeChampions); }
}
form.addEventListener("submit", event => { event.preventDefault(); void load(input.value, true, "", true); });
document.addEventListener("click", event => {
  if (!(event.target instanceof Element)) return;
  const chip = event.target.closest<HTMLButtonElement>(".repo-chip");
  if (chip) { void load(chip.dataset.repo ?? "", true, "", true); return; }
  const link = event.target.closest<HTMLAnchorElement>("a[href]");
  if (!link || link.target || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href); if (url.origin !== location.origin) return;
  const repository = repositoryFromPath(url.pathname);
  if (repository) { event.preventDefault(); void load(repository, true, url.hash); }
  else if (url.pathname.startsWith("/leaderboards/") && CATEGORIES[url.pathname.split("/")[2]]) { event.preventDefault(); void loadBoard(url); }
  else if (url.pathname === "/") { event.preventDefault(); void home(); }
});
window.addEventListener("popstate", () => {
  const url = new URL(location.href), repository = repositoryFromPath(url.pathname);
  if (repository) void load(repository, false, url.hash);
  else if (url.pathname.startsWith("/leaderboards/") && CATEGORIES[url.pathname.split("/")[2]]) void loadBoard(url, false);
  else void home(false);
});
try {
  const initialHome = JSON.parse(document.getElementById("home-data")?.textContent ?? "null") as {suggestions:LeaderboardRow[];champions:Champion[]} | null;
  if (initialHome) { homeRows=initialHome.suggestions; homeChampions=initialHome.champions; }
  const initialBoard = JSON.parse(document.getElementById("board-data")?.textContent ?? "null") as BoardData | null;
  if (initialBoard && CATEGORIES[initialBoard.category]) boardCache.set(`${initialBoard.category}:${initialBoard.cohort ?? "trending"}:${initialBoard.limit ?? 10}`, initialBoard);
} catch { /* A route read can recover a damaged bootstrap. */ }
const bootstrap = document.getElementById("repo-data")?.textContent;
if (bootstrap && bootstrap !== "null") {
  try { const data = JSON.parse(bootstrap) as { error?: string; presentation?: { history: DailyPoint[]; comparison: LeaderboardRow[]; stars?: StarHistory | null; neighbors?: CardStandings } }; if (typeof data.error === "string") { element("error-text").textContent = data.error; error.hidden = false; } else { const report = replayReport(data); if (data.presentation) presentationCache.set(report.repository.toLowerCase(), data.presentation); cache.set(report.repository.toLowerCase(), report); render(report, data.presentation); reward(report, data.presentation?.neighbors); } }
  catch { element("error-text").textContent = "This snapshot could not be read. Enter the repo to try again."; error.hidden = false; }
} else {
  const initial = repositoryFromPath(location.pathname) ?? new URL(location.href).searchParams.get("repo");
  if (initial) void load(initial);
}
if (new URL(location.href).searchParams.get("preview") === "loading") {
  loading.hidden = false; element("loading-whimsy").textContent = "Shuffling the repo lore…";
  element("progress-text").textContent = "Loading animation preview — no GitHub request is running.";
}
