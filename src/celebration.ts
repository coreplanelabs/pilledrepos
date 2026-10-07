import type { CardStandings } from "./neighbors.js";
export function topTenResult(standings?: CardStandings): boolean {
  return Object.entries(standings ?? {}).some(([category, row]) => row !== null && row.rank <= 10 && (row.score > 0 || category === "fast"));
}
