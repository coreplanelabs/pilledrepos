import { friendlyDate } from "../src/dates.js";
import { Resvg, initWasm, type InitInput } from "@resvg/resvg-wasm";
import { formatShare, type AiPage } from "../src/ai.js";
const escape = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function ogSvg(page?: AiPage, rank?: number, poolSize?: number): string {
  const a = page?.analysis,
    share = a ? formatShare(a.share) : "AI Pilled";
  const repo = page?.repository ?? "Who authors the merged PRs?";
  const lines =
    repo.length > 40 ? [repo.split("/")[0], repo.split("/")[1]] : [repo];
  const scope =
    page?.collector === "legacy-preview"
      ? "Legacy preview · biased sample · unranked"
      : a && !a.eligible
        ? "90-day window · below ranking minimum"
        : "90-day merged PR window";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#131416"/><rect x="856" y="-50" width="410" height="730" rx="205" fill="#3FF35D" opacity=".08" transform="rotate(24 1050 315)"/><rect x="64" y="49" width="32" height="18" rx="9" fill="#3FF35D"/><text x="108" y="67" font-family="DM Sans" font-size="25" fill="#FAFAFA">AI Pilled</text>${lines.map((s, i) => `<text x="64" y="${134 + i * 38}" font-family="DM Sans" font-size="${s.length > 55 ? Math.max(16, Math.floor(1040 / (s.length * 0.6))) : 34}" fill="#FAFAFA">${escape(s)}</text>`).join("")}<text x="56" y="338" font-family="DM Sans" font-size="150" font-weight="500" fill="#3FF35D">${escape(share)}</text><text x="64" y="399" font-family="DM Sans" font-size="32" fill="#FAFAFA">${a ? "of " + (page?.collector === "legacy-preview" ? "observed " : "") + "merged PRs from known AI-agent accounts" : "Merged PRs by AI agents."}</text><text x="64" y="449" font-family="DM Sans" font-size="24" fill="#ADB0B8">${a ? `${a.ai.toLocaleString("en-US")} / ${a.total.toLocaleString("en-US")} merged PRs${rank ? ` · #${rank} of ${poolSize} eligible repos` : ""}` : "Built for fun by Polylane."}</text><path d="M64 501H1136" stroke="#35363A"/><text x="64" y="550" font-family="DM Sans" font-size="21" fill="#ADB0B8">${escape(scope)}${page ? " · " + friendlyDate(page.capturedAt) : ""}</text><text x="64" y="591" font-family="DM Sans" font-size="19" fill="#ADB0B8">Built for fun by Polylane.</text></svg>`;
}
let ready: Promise<void> | undefined;
export function pngRenderer(
  wasm: InitInput,
  loadFonts: () => Promise<Uint8Array[]>,
): (svg: string) => Promise<Uint8Array> {
  let fonts: Promise<Uint8Array[]> | undefined;
  return async (svg) => {
    ready ??= initWasm(wasm);
    await ready;
    fonts ??= loadFonts();
    const r = new Resvg(svg, {
      font: { fontBuffers: await fonts, defaultFontFamily: "DM Sans" },
    });
    try {
      const im = r.render();
      try {
        return im.asPng().slice();
      } finally {
        im.free();
      }
    } finally {
      r.free();
    }
  };
}
