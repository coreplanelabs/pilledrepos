import { ArcadeError, collectReport, parseRepository, replayReport, type Report, repositoryImageUrl } from "../src/core.js";
import { CATEGORIES, leaderboard, repositoryFromPath, repositoryPath } from "../src/catalog.js";
import { cohortReports, readCatalog, readHistory, recordIndexed } from "./indexing.js";
import { collectIndexedReport } from "./github-index.js";
import { captureStars, readStars } from "./stars.js";
import { starMetric } from "../src/star-history.js";
import { cardStandings, indexedStandings, relativeIndexed } from "../src/neighbors.js";
import { relativeRows } from "../src/analytics.js";
import { pageHtml, safeJson } from "./html.js";
import { boardCard, ogSvg, reportCard, siteCard, type OgCard } from "./og.js";
export interface Store { get(key: string): Promise<string | null>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> }
export type ServerOptions = { assets: { fetch(request: Request): Promise<Response> }; store: Store; fetch: typeof fetch; now: () => number; png: (svg: string) => Promise<Uint8Array>; githubToken?: string; deadline?: (ms: number) => AbortSignal };
const FRESH_MS = 60 * 60_000;
export const POLICY = "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
function response(body: BodyInit | null, status = 200, type = "text/html; charset=utf-8", extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { "Content-Type": type, "Cache-Control": "private, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": POLICY, ...extra } });
}
function json(value: unknown, status = 200): Response { return response(JSON.stringify(value), status, "application/json; charset=utf-8"); }
export function createHandler(options: ServerOptions): (request: Request) => Promise<Response> {
  const deadline = options.deadline ?? ((ms: number) => AbortSignal.timeout(ms));
  const inFlight = new Map<string, Promise<Report>>();
  const rendered = new Map<string, Promise<Uint8Array>>();
  const imageCache = new Map<string, { until: number; data: string | null }>();
  async function cached(repository: string, stamp?: number): Promise<Report | null> {
    const key = stamp ? `snapshot:${repository.toLowerCase()}:${stamp}` : `repo:${repository.toLowerCase()}`;
    const catalog = await readCatalog(options.store);
    const versionDataset = stamp ? await options.store.get(`snapshot-ref:${repository.toLowerCase()}:${stamp}`) : null;
    const dataset = catalog?.datasetId && catalog.selected.some(name => name.toLowerCase() === repository.toLowerCase()) ? catalog.datasetId : null;
    const raw = await options.store.get(versionDataset ? `dataset:${versionDataset}:${key}` : dataset ? `dataset:${dataset}:${key}` : key);
    if (!raw) return null;
    try {
      const report = replayReport(JSON.parse(raw));
      return report.repository.toLowerCase() === repository.toLowerCase() ? report : null;
    } catch { return null; }
  }
  async function getReport(repository: string, stamp?: number): Promise<Report> {
    const key = repository.toLowerCase();
    const saved = await cached(repository, stamp);
    const catalog = await readCatalog(options.store), indexed = catalog.selected.some(name => name.toLowerCase() === key);
    if (saved && (stamp || indexed || options.now() - Date.parse(saved.capturedAt) < 15 * 60_000)) return saved;
    if (stamp) throw new ArcadeError("NOT_FOUND", "This older preview has expired. Open the repo page for its current snapshot.");
    const previous = inFlight.get(key); if (previous) return previous;
    const pending = (async () => {
      try {
        const prefix = `/repos/${key}`;
        const adapter: typeof fetch = async (input, init) => {
          const address = new URL(String(input)), path = address.pathname.toLowerCase();
          if (address.origin !== "https://api.github.com" || !(path === prefix || path.startsWith(prefix + "/") || options.githubToken && path === "/graphql")) throw new ArcadeError("INPUT", "Unexpected GitHub source.");
          const headers = new Headers(init?.headers); headers.set("User-Agent", "RepoLore/0.2 (+https://repolore.fun)");
          if (options.githubToken) headers.set("Authorization", `Bearer ${options.githubToken}`);
          return options.fetch(input, { ...init, headers, redirect: "error" });
        };
        const report = await (options.githubToken ? collectIndexedReport : collectReport)(repository, { fetch: adapter, now: options.now(), signal: deadline(24_000) });
        const body = JSON.stringify(report);
        if (indexed) await recordIndexed(options.store, report);
        else {
          await options.store.put(`repo:${key}`, body, { expirationTtl: 900 });
          await options.store.put(`snapshot:${key}:${Date.parse(report.capturedAt)}`, body, { expirationTtl: 900 });
        }
        try {
          const stars = await captureStars(report.repository, { fetch: options.fetch, now: options.now(), signal: deadline(2000), token: options.githubToken });
          await options.store.put(`stars:${key}`, JSON.stringify(stars), indexed ? undefined : { expirationTtl: 900 });
        } catch { /* Star history cannot block a valid PR report. */ }
        return report;
      } catch (cause) {
        if (saved && cause instanceof ArcadeError && ["RATE_LIMIT", "NETWORK", "TIMEOUT", "GITHUB"].includes(cause.code)) return { ...saved, notes: [...saved.notes, "A fresh read was unavailable. This is the last saved public snapshot; its original read date is shown."] };
        throw cause;
      } finally { inFlight.delete(key); }
    })();
    inFlight.set(key, pending); return pending;
  }
  async function reports(cohort = "top"): Promise<Report[]> { return (await cohortReports(options.store, cohort)).reports; }
  async function boardRows(reports: Report[], category: string) {
    return Promise.all(leaderboard(reports, category).map(async row => {
      const metric = starMetric(await readStars(options.store, row.repository)); return { ...row, starAdded: metric?.added, starDays: metric?.days };
    }));
  }
  async function indexedRows(category: string, cohort = "top") {
    const catalog = await readCatalog(options.store);
    if (catalog.datasetId) {
      const raw = await options.store.get(`dataset:${catalog.datasetId}:board:${cohort}:${category}`);
      if (raw) { const data = JSON.parse(raw) as { rows: import("../src/catalog.js").LeaderboardRow[]; refreshedAt: string; indexed: number; selected: number };
        if (Array.isArray(data.rows) && data.rows.length <= 1000) return { ...data, category, cohort, provisional: false, warming: false };
      }
      throw new Error("The daily dataset is temporarily unavailable.");
    }
    const data = await cohortReports(options.store, cohort);
    return { category, rows: await boardRows(data.reports, category), cohort, warming: data.warming, selected: data.selected, indexed: data.reports.length, refreshedAt: catalog.lastRefresh, provisional: data.provisional };
  }
  async function homeChampions() { return (await Promise.all(Object.keys(CATEGORIES).map(async category => ({category,row:(await indexedRows(category,"trending")).rows[0]})))).filter((entry): entry is import("../src/view.js").Champion => Boolean(entry.row)); }
  async function homeSuggestions() { return (await indexedRows("merge", "trending")).rows.slice(0, 3); }
  async function boardData(category: string, cohort: string, limit = 10) {
    const data = await indexedRows(category, cohort); return { ...data, rows: data.rows.slice(0, limit), total: data.rows.length, limit };
  }
  async function presentation(report: Report) {
        const catalog = await readCatalog(options.store);
    if (catalog.datasetId) {
      const boards = Object.fromEntries(await Promise.all(Object.keys(CATEGORIES).map(async category => [category, (await indexedRows(category)).rows])));
      const history = await readHistory(options.store, report.repository), comparison = relativeIndexed(report, boards.comments, "comments");
      return { history, comparison, neighbors: indexedStandings(report, boards), stars: await readStars(options.store, report.repository) };
    }
    const baseline = await reports(), history = await readHistory(options.store, report.repository), comparison = relativeRows(report, baseline, "comments");
    return { history, comparison, neighbors: cardStandings(report, baseline), stars: await readStars(options.store, report.repository) };
  }
  async function avatar(id: string, size: number): Promise<{ bytes: Uint8Array; type: string } | null> {
    const result = await options.fetch(`https://avatars.githubusercontent.com${id}?s=${size}&v=4`, { redirect: "error", signal: deadline(5000), headers: { Accept: "image/png,image/jpeg" } });
    const type = result.headers.get("Content-Type")?.split(";")[0] ?? "";
    if (!result.ok || !["image/png", "image/jpeg"].includes(type) || Number(result.headers.get("Content-Length")) > 512_000) return null;
    const bytes = new Uint8Array(await result.arrayBuffer());
    return bytes.length <= 512_000 ? { bytes, type } : null;
  }
  async function renderCardImage(card: OgCard): Promise<Uint8Array> {
    const ids = [...new Set([card.ownerId, ...card.columns.flatMap(column => [column.photoId, ...(column.photoIds ?? [])])].filter((id): id is string => Boolean(id)))];
    const images = new Map<string, string>();
    await Promise.all(ids.slice(0, 10).map(async id => {
      const key = String(id), saved = imageCache.get(key);
      if (saved && saved.until > options.now()) { if (saved.data) images.set(id, saved.data); return; }
      let data: string | null = null;
      try {
        const picture = await avatar(id, 160);
        if (picture) { let binary = ""; for (let i = 0; i < picture.bytes.length; i += 8192) binary += String.fromCharCode(...picture.bytes.subarray(i, i + 8192)); data = `data:${picture.type};base64,${btoa(binary)}`; }
      } catch { /* A missing photo cannot change the result or break the preview. */ }
      if (imageCache.size > 200) imageCache.clear();
      imageCache.set(key, { until: options.now() + FRESH_MS, data }); if (data) images.set(id, data);
    }));
    const artwork=repositoryImageUrl(card.repoImageUrl);
    if(artwork) try {
      const picture=await options.fetch(artwork,{redirect:"error",signal:deadline(5000)}),type=picture.headers.get("Content-Type")?.split(";")[0]??"";
      if(picture.ok && ["image/png","image/jpeg","image/webp"].includes(type) && Number(picture.headers.get("Content-Length"))<=1_000_000) {
        const bytes=new Uint8Array(await picture.arrayBuffer());if(bytes.length<=1_000_000) {let binary="";for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));images.set("repo-art",`data:${type};base64,${btoa(binary)}`);}
      }
    }catch{ /* Optional artwork never blocks a result preview. */ }
    return options.png(ogSvg(card, images));
  }
  async function cardImage(card: OgCard): Promise<Uint8Array> {
    const key = JSON.stringify(card), previous = rendered.get(key);
    if (previous) return previous;
    if (rendered.size >= 24) rendered.clear();
    const image = renderCardImage(card).catch(cause => { rendered.delete(key); throw cause; });
    rendered.set(key, image); return image;
  }
  async function shell(): Promise<string> {
    const result = await options.assets.fetch(new Request("https://assets.internal/index.html"));
    if (!result.ok) throw new Error("The application shell is unavailable.");
    return result.text();
  }
  return async request => {
    if (!["GET", "HEAD"].includes(request.method)) return response("Method not allowed", 405, "text/plain", { Allow: "GET, HEAD" });
    const url = new URL(request.url), path = url.pathname;
    let result: Response;
    try {
      if (path === "/" && url.searchParams.has("repo")) {
        const repository = parseRepository(url.searchParams.get("repo") ?? "");
        return response(null, 301, "text/plain", { Location: repositoryPath(repository) });
      }
      if (path === "/robots.txt") result = response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /_avatar/\nSitemap: ${url.origin}/sitemap.xml\n`, 200, "text/plain");
      else if (path === "/sitemap.xml") {
        const catalog = await readCatalog(options.store);
        const pages = catalog.datasetId ? catalog.selected.map(repository => ({ repository, capturedAt: catalog.lastRefresh ?? "" })) : await reports();
        const urls = pages.map(report => `<url><loc>${url.origin}${repositoryPath(report.repository)}</loc>${report.capturedAt ? `<lastmod>${report.capturedAt.slice(0, 10)}</lastmod>` : ""}</url>`);
        for (const id of Object.keys(CATEGORIES)) for (const suffix of ["", "/top-100"]) urls.push(`<url><loc>${url.origin}/leaderboards/${id}${suffix}</loc></url>`);
        result = response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/</loc></url>${urls.join("")}</urlset>`, 200, "application/xml");
      } else if(path.startsWith("/_repo-art/")) {
        const repo=repositoryFromPath(path.slice(10)); if(!repo) return response("Not found",404,"text/plain");
        const report=await cached(repo),source=repositoryImageUrl(report?.profile?.imageUrl);
        if(!source) return response("Artwork unavailable",404,"text/plain");
        const picture=await options.fetch(source,{redirect:"error",signal:deadline(5000)}),type=picture.headers.get("Content-Type")?.split(";")[0]??"";
        if(!picture.ok || !["image/png","image/jpeg","image/webp"].includes(type) || Number(picture.headers.get("Content-Length"))>1_000_000) return response("Artwork unavailable",404,"text/plain");
        const bytes=await picture.arrayBuffer();result=bytes.byteLength<=1_000_000 ? response(bytes,200,type,{"Cache-Control":"private, max-age=86400"}) : response("Artwork unavailable",404,"text/plain");
} else if (path.startsWith("/_avatar/")) {
        const raw = path.slice(9), id = "/" + raw, size = Number(url.searchParams.get("size") ?? 160);
        if (!/^(u|in)\/[1-9]\d{0,14}$/.test(raw) || ![64, 160, 256].includes(size)) return response("Not found", 404, "text/plain");
        const image = await avatar(id, size); result = image ? response(image.bytes.slice().buffer, 200, image.type, { "Cache-Control": "private, max-age=86400" }) : response("Photo unavailable", 404, "text/plain");
      } else if (path === "/api/home") result = json({ suggestions: await homeSuggestions(), champions:await homeChampions() });
      else if (path.startsWith("/api/leaderboards/") && CATEGORIES[path.slice(18)]) result = json(await boardData(path.slice(18), url.searchParams.get("cohort") === "top" ? "top" : "trending", url.searchParams.get("limit") === "100" ? 100 : 10));
      else if (path.startsWith("/api/repos/")) {
        const repository = repositoryFromPath(path.slice(10));
        if (!repository) return json({ error: "Use owner/repo." }, 400);
        const report = await getReport(repository); result = json({ ...report, presentation: await presentation(report) });
      } else if (path === "/leaderboards") return response(null, 301, "text/plain", { Location: "/leaderboards/comments" });
      else if (/^\/leaderboards\/[^/]+(?:\/top-100)?$/.test(path) && CATEGORIES[path.split("/")[2]]) {
        const category = path.split("/")[2], cohort = url.searchParams.get("cohort") === "top" ? "top" : "trending";
        result = response(pageHtml(await shell(), url.origin, undefined, await boardData(category, cohort, path.endsWith("/top-100") ? 100 : 10)));
      } else if (path.startsWith("/_og/") && path.endsWith(".png")) {
        let card: OgCard;
        if (path === "/_og/site.png") card = siteCard();
        else if (path.startsWith("/_og/leaderboards/") && CATEGORIES[path.slice("/_og/leaderboards/".length, -4)]) {
          const category = path.slice("/_og/leaderboards/".length, -4); card = boardCard(CATEGORIES[category].name, (await indexedRows(category, url.searchParams.get("cohort") === "top" ? "top" : "trending")).rows, category);
        } else {
          const repository = repositoryFromPath(path.slice(4, -4));
          if (!repository) return response("Not found", 404, "text/plain");
          const value = url.searchParams.get("v"), stamp = value && /^\d{13}$/.test(value) ? Number(value) : undefined;
          card = reportCard(await getReport(repository, stamp));
        }
        const png = await cardImage(card); result = response(png.slice().buffer, 200, "image/png", { "Cache-Control": "private, max-age=3600" });
      } else {
        const repository = repositoryFromPath(path.replace(/\/$/, ""));
        if (repository) {
          const report = await getReport(repository), canonical = repositoryPath(report.repository);
          if (path !== canonical || url.search) return response(null, 301, "text/plain", { Location: canonical });
          result = response(pageHtml(await shell(), url.origin, report, undefined, await presentation(report)));
        } else if (path === "/" || path === "/index.html") result = response(pageHtml(await shell(), url.origin, undefined, undefined, undefined, await homeSuggestions(), await homeChampions()));
        else result = await options.assets.fetch(request);
      }
    } catch (cause) {
      if (cause instanceof ArcadeError && cause.code === "MOVED" && cause.repository) {
        const target = repositoryPath(cause.repository);
        return response(null, 301, "text/plain", { Location: path.startsWith("/api/repos/") ? `/api/repos${target}` : target });
      }
      if (!(cause instanceof ArcadeError) && cause instanceof Error) {
        const detail = options.githubToken ? cause.message.replaceAll(options.githubToken, "[redacted]") : cause.message;
        console.warn("RepoLore request failed", { path, name: cause.name, detail });
      }
      const known = cause instanceof ArcadeError;
      const message = known ? cause.message : "This round could not be loaded. Try again later.";
      const status = known && ["NOT_FOUND", "PRIVATE"].includes(cause.code) ? 404 : known && cause.code === "INPUT" ? 400 : known && cause.code === "RATE_LIMIT" ? 429 : 503;
      if (path.startsWith("/api/")) result = json({ error: message }, status);
      else {
        const escaped = message.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
        const html = pageHtml(await shell(), url.origin).replace('id="error" class="error" role="alert" hidden', 'id="error" class="error" role="alert"')
          .replace('<p id="error-text"></p>', `<p id="error-text">${escaped}</p>`)
          .replace('<script id="repo-data" type="application/json">null</script>', `<script id="repo-data" type="application/json">${safeJson({ error: message })}</script>`);
        result = response(html, status);
      }
    }
    return request.method === "HEAD" ? new Response(null, result) : result;
  };
}
