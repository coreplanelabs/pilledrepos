import type { Report } from "./core.js";
import { contributors, leaderboard, type LeaderboardRow } from "./catalog.js";
export type DailyPoint = { day: string; stars: number | null; merges: number; botMerges: number };
export function splitMerges(report: Report): { humans: number; bots: number; unknown: number } {
  const cast = contributors(report), bots = cast.filter(row => row.author.bot).reduce((sum, row) => sum + row.merges, 0);
  const humans = cast.filter(row => !row.author.bot).reduce((sum, row) => sum + row.merges, 0);
  return { humans, bots, unknown: Math.max(0, report.coverage.mergedObserved - bots - humans) };
}
export function activity(report: Report, days = 14): { day: string; humans: number; bots: number; unknown: number }[] {
  const end = new Date(report.capturedAt); end.setUTCHours(0, 0, 0, 0);
  const rows = Array.from({ length: days }, (_, index) => ({ day: new Date(end.getTime() - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10), humans: 0, bots: 0, unknown: 0 }));
  for (const pr of report.facts.closed) {
    if (pr.mergedAt === null || pr.mergedAt > Date.parse(report.capturedAt)) continue;
    const row = rows.find(row => row.day === new Date(pr.mergedAt!).toISOString().slice(0, 10));
    if (row) { if (!pr.author) row.unknown++; else if (pr.author.bot) row.bots++; else row.humans++; }
  }
  return rows;
}
export function dailyPoint(report: Report): DailyPoint { return { day: report.capturedAt.slice(0, 10), stars: report.profile?.stars ?? null, merges: report.coverage.mergedObserved, botMerges: splitMerges(report).bots }; }
export function appendPoint(history: DailyPoint[], report: Report): DailyPoint[] { const point = dailyPoint(report); return [...history.filter(row => row.day !== point.day), point].sort((a, b) => a.day.localeCompare(b.day)).slice(-90); }
export function starGrowth(history: DailyPoint[]): number | null {
  const values = history.filter((row): row is DailyPoint & { stars: number } => row.stars !== null).sort((a, b) => a.day.localeCompare(b.day));
  if (values.length < 2) return null;
  const latest = values.at(-1)!, since = Date.parse(latest.day) - 7 * 86_400_000;
  const earlier = values.find(row => Date.parse(row.day) >= since && row.day !== latest.day);
  return earlier ? latest.stars - earlier.stars : null;
}
export function relativeRows(report: Report, baseline: Report[], category = "comments"): LeaderboardRow[] {
  return leaderboard([...baseline.filter(row => row.repository.toLowerCase() !== report.repository.toLowerCase()), report], category);
}
