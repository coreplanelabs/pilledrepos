import { parseRepository, type Report } from "../src/core.js";
import {
  aiPage,
  aiLeaderboard,
  parseReport,
  parseRegistry,
  type AiRegistry,
  type HistoryPoint,
} from "../src/ai.js";
import { pageHtml, repoPath, type View } from "./html.js";
import { ogSvg } from "./og.js";
export type Dataset = {
  reports: Report[];
  registry: AiRegistry;
  registryId: string;
  classificationId: string;
  history: Record<string, HistoryPoint[]>;
  pool: string;
  capturedAt: string;
  complete: boolean;
};
const headers = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' https://avatars.githubusercontent.com data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};
export function createHandler(options: {
  dataset: () => Promise<Dataset>;
  assets: (path: string) => Promise<Response>;
  png: (svg: string) => Promise<Uint8Array>;
  onDemand?: (repo: string) => Promise<Report>;
}): (request: Request) => Promise<Response> {
  let previous: Dataset | undefined, view: View;
  const images = new Map<string, Uint8Array>();
  return async (request) => {
    const url = new URL(request.url),
      path = url.pathname;
    const respond = (
      body: BodyInit | null,
      status = 200,
      type = "text/html; charset=utf-8",
      extra: Record<string, string> = {},
    ) =>
      new Response(request.method === "HEAD" ? null : body, {
        status,
        headers: { ...headers, "Content-Type": type, ...extra },
      });
    if (!["GET", "HEAD"].includes(request.method))
      return respond("Method not allowed", 405, "text/plain", {
        Allow: "GET, HEAD",
      });
    if (
      /^\/(assets\/|app\.js$|theme\.js$|theme-init\.js$|styles\.css$|favicon\.svg$)/.test(
        path,
      )
    )
      return options.assets(path);
    try {
      const dataset = await options.dataset();
      if (previous !== dataset) {
        const registry = parseRegistry(dataset.registry),
          reports = dataset.reports.map(parseReport);
        view = {
          ...dataset,
          registry,
          pages: reports.map((r) => aiPage(r, registry)),
          board: dataset.complete ? aiLeaderboard(reports, registry) : [],
        };
        previous = dataset;
        images.clear();
      }
      if (path === "/" && url.searchParams.has("repo"))
        return respond(null, 303, "text/plain", {
          Location: repoPath(parseRepository(url.searchParams.get("repo")!)),
        });
      async function find(repo: string) {
        const name = parseRepository(repo),
          page = view.pages.find(
            (r) =>
              r.repository.toLowerCase() === name.toLowerCase() ||
              r.requestedRepository?.toLowerCase() === name.toLowerCase(),
          );
        if (page) return page;
        if (!options.onDemand)
          throw new Error(
            "This repo is not in the local index. Add it with the index script.",
          );
        return aiPage(parseReport(await options.onDemand(name)), view.registry);
      }
      if (path === "/api/leaderboard")
        return respond(
          JSON.stringify({
            rows: view.board.slice(
              0,
              url.searchParams.get("limit") === "100" ? 100 : 10,
            ),
            eligible: view.board.length,
            pool: view.pool,
            complete: view.complete,
            registryId: view.registryId,
          }),
          200,
          "application/json",
        );
      if (path.startsWith("/api/repos/"))
        return respond(
          JSON.stringify(await find(decodeURIComponent(path.slice(11)))),
          200,
          "application/json",
        );
      if (path === "/robots.txt")
        return respond(
          `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${url.origin}/sitemap.xml\n`,
          200,
          "text/plain",
        );
      if (path === "/sitemap.xml")
        return respond(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/", "/leaderboard", "/leaderboard/top-100", "/method", "/registry", ...view.pages.map((p) => repoPath(p.repository))].map((p) => `<url><loc>${url.origin}${p}</loc></url>`).join("")}</urlset>`,
          200,
          "application/xml",
        );
      if (path.startsWith("/_og/") && path.endsWith(".png")) {
        const name = decodeURIComponent(path.slice(5, -4)),
          page = name === "site" ? undefined : await find(name),
          row = view.board.find((r) => r.repository === page?.repository),
          key = page?.repository ?? "site";
        let bytes = images.get(key);
        if (!bytes) {
          bytes = await options.png(ogSvg(page, row?.rank, view.board.length));
          if (images.size > 100) images.clear();
          images.set(key, bytes);
        }
        return respond(bytes.slice().buffer, 200, "image/png", {
          "Cache-Control": "public, max-age=300",
        });
      }
      if (
        [
          "/",
          "/index.html",
          "/leaderboard",
          "/leaderboard/top-100",
          "/method",
          "/registry",
        ].includes(path)
      )
        return respond(
          pageHtml(view, url.origin, {
            board: path.startsWith("/leaderboard"),
            limit: path.endsWith("/top-100") ? 100 : 10,
            method: path === "/method",
            registry: path === "/registry",
          }),
        );
      if (path.split("/").filter(Boolean).length === 2) {
        const page = await find(
            decodeURIComponent(path.replace(/^\/|\/$/g, "")),
          ),
          canonical = repoPath(page.repository);
        if (path !== canonical)
          return respond(null, 301, "text/plain", { Location: canonical });
        const compare = url.searchParams.get("compare");
        return respond(
          pageHtml(view, url.origin, {
            page,
            comparison: compare ? await find(compare) : undefined,
          }),
        );
      }
      return respond("Not found", 404, "text/plain");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Read unavailable.";
      return path.startsWith("/api/")
        ? respond(JSON.stringify({ error: message }), 400, "application/json")
        : respond(
            previous
              ? pageHtml(view, url.origin, { error: message })
              : "Local index unavailable. Run npm run preview:seed or npm run index.",
            previous ? 400 : 503,
          );
    }
  };
}
