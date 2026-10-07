import { AWARD_PALETTE } from "../src/award-palette.js";
import { ICONS } from "../src/icons.js";
import { initWasm, Resvg, type InitInput } from "@resvg/resvg-wasm";
import { avatarSource, contributors, hook, type LeaderboardRow } from "../src/catalog.js";
import type { Report } from "../src/core.js";
import { escapeHtml } from "../src/view.js";
export type OgCard = { title: string; description: string; columns: { title: string; name: string; value: string; category?: string; photoId?: string; photoIds?: string[]; rest?: number }[]; ownerId?: string; repoImageUrl?: string; category?: string; footer: string };
export function reportCard(report: Report): OgCard {
  const cast = contributors(report), lead = cast[0];
  const deletion = report.awards.find(award => award.id === "delete"), comments = report.awards.find(award => award.id === "comments");
  return { title: report.repository, description: hook(report), ownerId: report.profile?.owner ? avatarSource(report.profile.owner) : undefined, repoImageUrl:report.profile?.imageUrl,
    columns: [
      { category: "merge", title: "MERGE MACHINE", name: lead ? `@${lead.author.login}` : "Next chapter pending", value: lead ? `${lead.merges} merged PRs` : "No observed merges", photoId: lead ? avatarSource(lead.author) : undefined },
      { category: "delete", title: "DELETE CLUB", name: deletion?.headline ?? "No winner yet", value: deletion?.value || "No diff counts", photoId: (() => { const author = report.facts.details.find(pr => pr.number === deletion?.evidence[0]?.number)?.author; return author ? avatarSource(author) : undefined; })() },
      { category: "cast", title: "THE CAST", name: `${cast.length} contributor accounts`, value: cast.length > 3 ? `+${cast.length - 3} more behind the scenes` : "Roll credits", photoIds: cast.slice(0, 3).map(row => avatarSource(row.author)), rest: Math.max(0, cast.length - 3) }
    ], footer: `90-day snapshot | ${report.coverage.detailsRead} PR diffs inspected | Read ${report.capturedAt.slice(0, 10)}` };
}
export function boardCard(title: string, rows: LeaderboardRow[], category?: string): OgCard {
  return { title, category, description: "The cast gets competitive. Compare observed awards across popular GitHub repos.", columns: rows.slice(0, 3).map((row, rank) => ({ title: `#${rank + 1} ${row.repository}`, name: row.person ? `@${row.person.login}` : row.repository, value: row.value, category, photoIds: row.cast?.map(avatarSource), rest: Math.max(0, (row.castCount ?? 0) - 3), photoId: row.person ? avatarSource(row.person) : undefined })), footer: "Bounded snapshots | PR links and coverage at repolore.fun" };
}
export function siteCard(): OgCard { return { title: "Your repo has lore.", description: "The merge machines, delete legends, and main characters behind your favorite GitHub repo.", columns: [], footer: "Find your cast at repolore.fun" }; }
function clip(value: string, length: number): string { return value.length > length ? `${value.slice(0, length - 3)}...` : value; }
function text(value: string, x: number, y: number, size: number, color = "#FAFAFA", weight = 400): string { return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" font-family="DM Sans">${escapeHtml(value)}</text>`; }
export function ogSvg(card: OgCard, images: Map<string, string>): string {
  const palette = AWARD_PALETTE[card.category ?? "merge"] ?? AWARD_PALETTE.merge;
  const photos = card.columns.map((column, index) => {
    const image = column.photoId ? images.get(column.photoId) : null;
    const faces = column.photoIds?.map((id, face) => {
      const source = images.get(id), cx = 64 + index * 365 + 53 + face * 43;
      return source ? `<image x="${cx - 29}" y="302" width="58" height="58" href="${source}" clip-path="url(#cast-${index}-${face})"/><circle cx="${cx}" cy="331" r="29" fill="none" stroke="#142C19" stroke-width="3"/>` : `<circle cx="${cx}" cy="331" r="29" fill="#3FF35D"/>`;
    }).join("");
    const x = 64 + index * 365, color = AWARD_PALETTE[column.category ?? card.category ?? "merge"] ?? palette, fill = color.surface;
    return `<rect x="${x}" y="240" width="342" height="253" rx="22" fill="${fill}" stroke="${color.accent}55"/>
      ${text(clip(column.title, 31), x + 24, 279, 15, "#ADB0B8")}
      ${faces ? `${faces}${column.rest ? `<circle cx="${x + 182}" cy="331" r="29" fill="#253D2B" stroke="#142C19" stroke-width="3"/>${text(`+${column.rest}`, x + 161, 339, 20)}` : ""}` : image ? `<image x="${x + 24}" y="302" width="58" height="58" href="${image}" clip-path="url(#face-${index})"/>` : `<circle cx="${x + 53}" cy="331" r="29" fill="${color.accent}"/>`}
      ${text(clip(column.name, 23), x + 24, 403, 26, "#FAFAFA", 500)}${text(clip(column.value, 31), x + 24, 451, 21, "#FAFAFA", 500)}`;
  }).join("");
  const owner = images.get("repo-art") ?? (card.ownerId ? images.get(card.ownerId) : null);
  const description = clip(card.description, 137), split = description.lastIndexOf(" ", 88);
  const lines = description.length > 88 && split > 0 ? [description.slice(0, split), description.slice(split + 1)] : [description];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="ground" x2="1" y2="1"><stop stop-color="#131416"/><stop offset="1" stop-color="#1A2420"/></linearGradient>${card.columns.map((_, index) => `<clipPath id="face-${index}"><circle cx="${64 + index * 365 + 53}" cy="331" r="29"/></clipPath>`).join("")}${card.columns.flatMap((_, index) => [0, 1, 2].map(face => `<clipPath id="cast-${index}-${face}"><circle cx="${64 + index * 365 + 53 + face * 43}" cy="331" r="29"/></clipPath>`)).join("")}<clipPath id="owner"><rect x="1040" y="66" width="96" height="96" rx="24"/></clipPath></defs>
    <rect width="1200" height="630" fill="url(#ground)"/><circle cx="1140" cy="580" r="180" fill="#3FF35D" opacity=".055"/>
    ${text("Repo Lore", 64, 60, 19, "#3FF35D", 500)}${text(clip(card.title, 32), 64, 137, 54, "#FAFAFA", 500)}
    ${lines.map((line, index) => text(line, 64, 182 + index * 27, 21, "#ADB0B8")).join("")}
    ${owner ? `<image x="1040" y="66" width="96" height="96" href="${owner}" clip-path="url(#owner)"/>` : ""}
    ${card.category && ICONS[card.category] ? `<g transform="translate(985 445) rotate(-15) scale(.32)" opacity=".045"><path d="${ICONS[card.category].path}" fill="${palette.accent}"/></g>` : ""}
    ${photos || `${text("Find the people behind the pull requests.", 64, 320, 35, "#FAFAFA", 500)}${text("Meet the cast. See the leaderboard. Copy the URL.", 64, 375, 24, "#ADB0B8")}`}
    ${text(clip(card.footer, 119), 64, 548, 17, "#ADB0B8")}${text("repolore.fun", 64, 594, 23, "#3FF35D", 500)}</svg>`;
}
let wasmReady: Promise<void> | undefined;
export function pngRenderer(wasm: InitInput, loadFonts: () => Promise<Uint8Array[]>): (svg: string) => Promise<Uint8Array> {
  let fonts: Promise<Uint8Array[]> | undefined;
  return async svg => {
    wasmReady ??= initWasm(wasm).catch(error => { wasmReady = undefined; throw error; });
    await wasmReady; fonts ??= loadFonts();
    const renderer = new Resvg(svg, { font: { fontBuffers: await fonts, defaultFontFamily: "DM Sans" } });
    try { const image = renderer.render(); try { return image.asPng().slice(); } finally { image.free(); } }
    finally { renderer.free(); }
  };
}
