import { parseRepository } from "../src/core.js";
import { parseStarHistory, type StarHistory } from "../src/star-history.js";
import { readCatalog } from "./indexing.js";
import type { Store } from "./http.js";
export async function readStars(store: Store, repository: string): Promise<StarHistory | null> {
  try {
    const catalog = await readCatalog(store);
    const key = catalog.datasetId && catalog.selected.some(name => name.toLowerCase() === repository.toLowerCase()) ? `dataset:${catalog.datasetId}:stars:${repository.toLowerCase()}` : `stars:${repository.toLowerCase()}`;
    const value = JSON.parse(await store.get(key) ?? "null") as StarHistory | null;
    if (!value || !Number.isFinite(Date.parse(value.capturedAt)) || !Array.isArray(value.days) || value.days.length > 30 || !value.days.every(row => /^\d{4}-\d{2}-\d{2}$/.test(row.day) && Number.isSafeInteger(row.added) && row.added >= 0) || new Set(value.days.map(row => row.day)).size !== value.days.length) return null;
    return value;
  } catch { return null; }
}
export async function captureStars(repository: string, options: { fetch: typeof fetch; now: number; signal: AbortSignal; token?: string }): Promise<StarHistory> {
  const name = parseRepository(repository);
  const response = await options.fetch(`https://api.github.com/repos/${name}/stargazers/history?per_page=6`, { redirect: "error", signal: options.signal, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "RepoLore/0.4", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) } });
  if (!response.ok) throw new Error("GitHub star history is unavailable.");
  const body = await response.text(); if (body.length > 100_000) throw new Error("Star history was too large.");
  return parseStarHistory(JSON.parse(body), options.now);
}
