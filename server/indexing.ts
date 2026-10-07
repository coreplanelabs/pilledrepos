import { collectReport, parseRepository, replayReport, type Report } from "../src/core.js";
import { POPULAR_REPOS } from "../src/catalog.js";
import { appendPoint, dailyPoint, type DailyPoint } from "../src/analytics.js";
import { captureStars, readStars } from "./stars.js";
import { starMetric } from "../src/star-history.js";
import type { Store } from "./http.js";
export type Catalog = { selected: string[]; discoveredAt: string | null; cursor: number; lastRefresh?: string; status?: string; datasetId?: string; indexed?: number };
export async function readCatalog(store: Store): Promise<Catalog> {
  try { const value = JSON.parse(await store.get("index:catalog") ?? "null") as Catalog | null;
    if (value && Array.isArray(value.selected) && value.selected.length > 0 && value.selected.length <= 1000) return { ...value, selected: value.selected.map(parseRepository), cursor: Number.isSafeInteger(value.cursor) && value.cursor >= 0 ? value.cursor : 0 };
  } catch { /* Existing snapshots remain useful during initial indexing. */ }
  return { selected: POPULAR_REPOS, discoveredAt: null, cursor: 0 };
}
export async function readHistory(store: Store, repository: string): Promise<DailyPoint[]> {
  try {
    const catalog = await readCatalog(store);
    const key = catalog.datasetId && catalog.selected.some(name => name.toLowerCase() === repository.toLowerCase()) ? `dataset:${catalog.datasetId}:history:${repository.toLowerCase()}` : `history:${repository.toLowerCase()}`;
    const raw = await store.get(key);
    if (!raw) { const saved = await store.get(`repo:${repository.toLowerCase()}`); return saved ? [dailyPoint(replayReport(JSON.parse(saved)))] : []; }
    const rows = JSON.parse(raw) as DailyPoint[];
    if (!Array.isArray(rows)) return [];
    return rows.filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.day) && (row.stars === null || Number.isSafeInteger(row.stars) && row.stars >= 0) && Number.isSafeInteger(row.merges) && row.merges >= 0 && Number.isSafeInteger(row.botMerges) && row.botMerges >= 0 && row.botMerges <= row.merges).slice(-90);
  } catch { return []; }
}
export async function recordIndexed(store: Store, report: Report): Promise<void> {
  const key = report.repository.toLowerCase(), body = JSON.stringify(report);
  const history = await readHistory(store, key);
  await store.put(`repo:${key}`, body);
  await store.put(`snapshot:${key}:${Date.parse(report.capturedAt)}`, body, { expirationTtl: 7 * 86_400 });
  await store.put(`history:${key}`, JSON.stringify(appendPoint(history, report)));
}
export async function cohortReports(store: Store, cohort = "trending"): Promise<{ reports: Report[]; warming: boolean; selected: number; provisional: boolean }> {
  const catalog = await readCatalog(store), found: Report[] = [];
  for (let i = 0; i < catalog.selected.length; i += 10) {
    const batch = await Promise.all(catalog.selected.slice(i, i + 10).map(async repository => {
      try { const raw = await store.get(`repo:${repository.toLowerCase()}`); if (!raw) return null;
        const report = replayReport(JSON.parse(raw)); return report.repository.toLowerCase() === repository.toLowerCase() ? report : null;
      } catch { return null; }
    })); found.push(...batch.filter((row): row is Report => row !== null));
  }
  if (cohort === "top") return { reports: found, warming: false, selected: catalog.selected.length, provisional: !catalog.discoveredAt };
  const growth = await Promise.all(found.map(async report => ({ report, growth: starMetric(await readStars(store, report.repository))?.added ?? null })));
  const trending = growth.filter((row): row is { report: Report; growth: number } => row.growth !== null && row.growth > 0).sort((a, b) => b.growth - a.growth || a.report.repository.localeCompare(b.report.repository)).slice(0, 20);
  return { reports: trending.length ? trending.map(row => row.report) : found, warming: trending.length === 0, selected: catalog.selected.length, provisional: !catalog.discoveredAt };
}
export async function refreshIndex(options: { store: Store; fetch: typeof fetch; now: () => number; token?: string; deadline?: (ms: number) => AbortSignal }): Promise<{ status: string; captured: number }> {
  if ((await readCatalog(options.store)).datasetId) return { status: "managed-by-daily-job", captured: 0 };
  if (!options.token) return { status: "needs-public-read-credential", captured: 0 };
  const deadline = options.deadline ?? ((ms: number) => AbortSignal.timeout(ms)), now = options.now(), catalog = await readCatalog(options.store);
  if (!catalog.discoveredAt || now - Date.parse(catalog.discoveredAt) >= 86_400_000) {
    const url = new URL("https://api.github.com/search/repositories"); url.search = new URLSearchParams({ q: "is:public fork:false archived:false stars:>500", sort: "stars", order: "desc", per_page: "100" }).toString();
    const result = await options.fetch(url.href, { redirect: "error", signal: deadline(15_000), headers: { Authorization: `Bearer ${options.token}`, Accept: "application/vnd.github+json", "User-Agent": "RepoLore/0.3" } });
    if (!result.ok) throw new Error("GitHub could not refresh the public top-repo shortlist.");
    const body = await result.text(); if (body.length > 8_000_000) throw new Error("The discovery response was too large.");
    const data = JSON.parse(body) as { items?: { full_name: string; private: boolean; fork: boolean; archived: boolean }[]; incomplete_results?: boolean };
    if (!Array.isArray(data.items) || data.incomplete_results) throw new Error("GitHub returned an incomplete discovery result.");
    const selected = data.items.filter(row => row.private === false && !row.fork && !row.archived).slice(0, 100).map(row => parseRepository(row.full_name));
    if (!selected.length) throw new Error("No readable public discovery entries were returned.");
    catalog.selected = [...new Set(selected)]; catalog.discoveredAt = new Date(now).toISOString(); catalog.cursor %= catalog.selected.length;
  }
  let captured = 0;
  for (let i = 0; i < Math.min(4, catalog.selected.length); i++) {
    const repository = catalog.selected[catalog.cursor % catalog.selected.length]; catalog.cursor = (catalog.cursor + 1) % catalog.selected.length;
    const prefix = `/repos/${repository.toLowerCase()}`;
    const fetcher: typeof fetch = (input, init) => {
      const url = new URL(String(input)), path = url.pathname.toLowerCase();
      if (url.origin !== "https://api.github.com" || !(path === prefix || path.startsWith(prefix + "/"))) throw new Error("Unexpected index source.");
      const headers = new Headers(init?.headers); headers.set("Authorization", `Bearer ${options.token}`); headers.set("User-Agent", "RepoLore/0.3");
      return options.fetch(input, { ...init, headers, redirect: "error" });
    };
    try { const report = await collectReport(repository, { fetch: fetcher, now: options.now(), signal: deadline(24_000) }); await recordIndexed(options.store, report); captured++;
      try { const stars = await captureStars(report.repository, { fetch: options.fetch, now: options.now(), token: options.token, signal: deadline(8000) }); await options.store.put(`stars:${report.repository.toLowerCase()}`, JSON.stringify(stars)); } catch { /* Retain the last public aggregate history. */ } }
    catch { /* Keep the last good snapshot and continue the bounded batch. */ }
  }
  catalog.lastRefresh = new Date(options.now()).toISOString(); catalog.status = "active";
  await options.store.put("index:catalog", JSON.stringify(catalog));
  return { status: "active", captured };
}
