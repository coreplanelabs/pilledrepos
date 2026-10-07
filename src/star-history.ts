export type StarDay = { day: string; added: number };
export type StarHistory = { capturedAt: string; days: StarDay[] };
export function parseStarHistory(value: unknown, now: number): StarHistory {
  if (!Array.isArray(value) || value.length > 6) throw new Error("Star history was not a bounded weekly listing.");
  const today = new Date(now).toISOString().slice(0, 10), since = new Date(Date.parse(today) - 30 * 86_400_000).toISOString().slice(0, 10);
  const days = new Map<string, number>();
  for (const row of value) {
    if (!row || !Number.isSafeInteger(row.week) || row.week < 0 || !Number.isSafeInteger(row.total) || row.total < 0 || !Array.isArray(row.days) || row.days.length !== 7 || !row.days.every((n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0) || row.days.reduce((sum: number, n: number) => sum + n, 0) !== row.total) throw new Error("Star history contained invalid counts.");
    row.days.forEach((added: number, index: number) => {
      const day = new Date(row.week * 1000 + index * 86_400_000).toISOString().slice(0, 10);
      if (day >= since && day < today) { if (days.has(day)) throw new Error("Star history contained overlapping weeks."); days.set(day, added); }
    });
  }
  return { capturedAt: new Date(now).toISOString(), days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([day, added]) => ({ day, added })) };
}
export function starMetric(history: StarHistory | null): { added: number; days: number } | null {
  if (!history?.days.length) return null;
  return { added: history.days.reduce((sum, row) => sum + row.added, 0), days: history.days.length };
}
