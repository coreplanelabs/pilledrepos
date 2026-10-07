import type { Report } from "./core.js";
import { CATEGORIES, leaderboard, type LeaderboardRow } from "./catalog.js";
export type Neighbors = { rank: number; score: number; total: number; tied: boolean; ahead: LeaderboardRow | null; behind: LeaderboardRow | null };
export type CardStandings = Record<string, Neighbors | null>;
export function cardStandings(report: Report, baseline: Report[]): CardStandings {
  const reports = [...baseline.filter(row => row.repository.toLowerCase() !== report.repository.toLowerCase()), report];
  return Object.fromEntries(Object.keys(CATEGORIES).map(category => {
    const rows = leaderboard(reports, category), index = rows.findIndex(row => row.repository.toLowerCase() === report.repository.toLowerCase());
    if (index < 0) return [category, null];
    const score = rows[index].score, ahead = rows[index - 1] ?? null;
    const behind = rows[index + 1] ?? null;
    return [category, { rank: 1 + rows.filter(row => category === "fast" ? row.score < score : row.score > score).length,
      score, total: rows.length, tied: rows.some(row => row.repository.toLowerCase() !== report.repository.toLowerCase() && row.score === score), ahead, behind }];
  }));
}
export function relativeIndexed(report: Report, rows: LeaderboardRow[], category: string): LeaderboardRow[] {
  const mine = leaderboard([report], category)[0];
  if (!mine || (category === "comments" && report.version !== 2)) return rows;
  return [...rows.filter(row => row.repository.toLowerCase() !== report.repository.toLowerCase()), mine].sort((a,b)=>(category === "fast" ? a.score-b.score : b.score-a.score)||a.repository.localeCompare(b.repository));
}
export function indexedStandings(report: Report, boards: Record<string, LeaderboardRow[]>): CardStandings {
  return Object.fromEntries(Object.keys(CATEGORIES).map(category=>{
    const rows=relativeIndexed(report,boards[category]??[],category),index=rows.findIndex(row=>row.repository.toLowerCase()===report.repository.toLowerCase());
    if(index<0||(category==="comments"&&report.version!==2))return [category,null];
    const score=rows[index].score;
    return [category,{rank:1+rows.filter(row=>category==="fast"?row.score<score:row.score>score).length,score,total:rows.length,tied:rows.some((row,i)=>i!==index&&row.score===score),ahead:rows[index-1]??null,behind:rows[index+1]??null}];
  }));
}
