import type { RepoStore } from "./repo-store.js";
import { parseRepository, type Report } from "../src/core.js";
import {
  aiPage,
  aiLeaderboardPages,
  type AiPage,
  parseReport,
  parseRegistry,
  type AiRegistry,
  type HistoryPoint,
} from "../src/ai.js";
import {
  pageHtml,
  repoPath,
  listing,
  rowsMarkup,
  viewVersion,
  type View,
} from "./html.js";
import { validatePage } from "./edge-data.js";
import { ogSvg } from "./og.js";
export type Dataset = {
  reports?: Report[];
  pages?: AiPage[];
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
  catalog?: RepoStore;
  onDemand?: (repo: string) => Promise<Report>;
}): (request: Request) => Promise<Response> {
  let previous: Dataset | undefined, base: View;
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
    const mutation =
      request.method === "POST" &&
      (path === "/api/repos" || path === "/api/repos/refresh");
    if (!["GET", "HEAD"].includes(request.method) && !mutation)
      return respond("Method not allowed", 405, "text/plain", {
        Allow: "GET, HEAD, POST",
      });
    if (
      mutation &&
      ((request.headers.has("origin") &&
        request.headers.get("origin") !== url.origin) ||
        request.headers.get("sec-fetch-site") === "cross-site" ||
        !request.headers.get("content-type")?.startsWith("application/json"))
    )
      return respond(
        JSON.stringify({ error: "Use the repo form." }),
        403,
        "application/json",
      );
    if (
      /^\/(assets\/|app\.js$|confetti\.js$|theme\.js$|dates\.js$|theme-init\.js$|styles\.css$|favicon\.svg$)/.test(
        path,
      )
    )
      return options.assets(path);
    try {
      const dataset = await options.dataset();
      if (previous !== dataset) {
        const registry = parseRegistry(dataset.registry),
          pages =
            dataset.pages?.map((p) => validatePage(p, registry)) ??
            dataset.reports?.map((r) => aiPage(parseReport(r), registry));
        if (!pages) throw new Error("Dataset has no repo records.");
        base = {
          ...dataset,
          registry,
          pages,
          board: dataset.complete ? aiLeaderboardPages(pages) : [],
        };
        previous = dataset;
        images.clear();
      }
      let view = base;
      if (options.catalog) {
        try {
          const extras = await options.catalog.extras(
            base.capturedAt,
            base.pages.map((p) => p.repositoryId ?? 0),
          );
          if (extras.length) {
            const map = new Map(
              base.pages.map((p) => [
                p.repositoryId ?? p.repository.toLowerCase(),
                p,
              ]),
            );
            for (const p of extras)
              map.set(p.repositoryId ?? p.repository.toLowerCase(), p);
            const pages = [...map.values()];
            view = {
              ...base,
              pages,
              board: base.complete ? aiLeaderboardPages(pages) : [],
            };
          }
        } catch {
          /* The last complete bulk index remains readable if the catalog is unavailable. */
        }
      }
      if (path === "/" && url.searchParams.has("repo"))
        return respond(null, 303, "text/plain", {
          Location: repoPath(parseRepository(url.searchParams.get("repo")!)),
        });
      if (mutation) {
        if (!options.catalog)
          return respond(
            JSON.stringify({
              error: "Public repo indexing is not configured.",
            }),
            503,
            "application/json",
          );
        const body = await request.text();
        if (body.length > 1000)
          return respond("Input too large", 413, "text/plain");
        const parsed = JSON.parse(body);
        const saved = await options.catalog.add(
          parseRepository(parsed.repository ?? ""),
          path.endsWith("/refresh"),
        );
        return respond(
          JSON.stringify(saved),
          saved.status === "ready" ? 200 : 202,
          "application/json",
        );
      }
      async function find(repo: string) {
        const name = parseRepository(repo),
          saved = await options.catalog?.page(name),
          indexed = view.pages.find(
            (r) =>
              r.repository.toLowerCase() === name.toLowerCase() ||
              r.requestedRepository?.toLowerCase() === name.toLowerCase(),
          );
        if (
          saved &&
          (!indexed ||
            Date.parse(saved.capturedAt) > Date.parse(indexed.capturedAt))
        )
          return saved;
        if (indexed) return indexed;
        if (options.catalog) {
          const read = await options.catalog.add(name);
          if (read.page) return read.page;
          throw new Error(
            read.message ?? "Saved. This repo is queued for its first read.",
          );
        }
        if (!options.onDemand)
          throw new Error("Public repo indexing is not configured.");
        return aiPage(parseReport(await options.onDemand(name)), view.registry);
      }
      const sort = url.searchParams.get("sort") ?? "desc";
      if (
        (path === "/" || path === "/api/leaderboard") &&
        sort !== "asc" &&
        sort !== "desc"
      )
        return respond(
          JSON.stringify({ error: "Use ascending or descending order." }),
          400,
          "application/json",
        );
      if (path === "/api/leaderboard") {
        const version = viewVersion(view),
          requestedVersion = url.searchParams.get("v");
        if (requestedVersion && requestedVersion !== version)
          return respond(
            JSON.stringify({
              error: "The list was updated. Reload to see the new rows.",
            }),
            409,
            "application/json",
          );
        const offset = Number(url.searchParams.get("offset") ?? 0),
          limit = Number(url.searchParams.get("limit") ?? 30);
        if (
          !Number.isInteger(offset) ||
          offset < 0 ||
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 100
        )
          return respond("Invalid page", 400, "text/plain");
        const all = listing(view, sort as "asc" | "desc"),
          rows = all.slice(offset, offset + limit);
        return respond(
          JSON.stringify({
            rows,
            html: rowsMarkup(rows),
            nextOffset:
              offset + rows.length < all.length ? offset + rows.length : null,
            version,
            total: all.length,
            sort,
          }),
          200,
          "application/json",
        );
      }
      if (path.startsWith("/api/status/")) {
        if (!options.catalog) throw new Error("Repo storage is unavailable.");
        return respond(
          JSON.stringify(
            await options.catalog.status(decodeURIComponent(path.slice(12))),
          ),
          200,
          "application/json",
        );
      }
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
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/", ...view.pages.map((p) => repoPath(p.repository))].map((p) => `<url><loc>${url.origin}${p}</loc></url>`).join("")}</urlset>`,
          200,
          "application/xml",
        );
      if (path.startsWith("/_og/") && path.endsWith(".png")) {
        const name = decodeURIComponent(path.slice(5, -4)),
          page = name === "site" ? undefined : await find(name),
          row = view.board.find((r) => r.repository === page?.repository),
          key = page ? page.repository + ":" + page.capturedAt : "site";
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
        ["/leaderboard", "/leaderboard/top-100", "/leaderboards"].includes(path)
      )
        return respond(null, 301, "text/plain", { Location: "/" });
      if (path === "/registry" || path === "/method")
        return respond("Not found", 404, "text/plain");
      if (path === "/" || path === "/index.html")
        return respond(
          pageHtml(view, url.origin, {
            focus: url.searchParams.get("focus") ?? undefined,
            sort: sort as "asc" | "desc",
          }),
        );
      if (path.split("/").filter(Boolean).length === 2) {
        const page = await find(
            decodeURIComponent(path.replace(/^\/|\/$/g, "")),
          ),
          canonical = repoPath(page.repository);
        if (path !== canonical)
          return respond(null, 301, "text/plain", { Location: canonical });
        return respond(
          pageHtml(view, url.origin, {
            page,
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
              ? pageHtml(base, url.origin, { error: message })
              : "Local index unavailable. Run npm run preview:seed or npm run index.",
            previous ? 400 : 503,
          );
    }
  };
}
