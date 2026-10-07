import { createServer } from "node:http";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createHandler } from "../.server-dist/server/http.js";
import { pngRenderer } from "../.server-dist/server/og.js";

const root = new URL("../dist/", import.meta.url), files = new Set();
/** @param {URL} directory @param {string} prefix */
async function inventory(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) await inventory(new URL(entry.name + "/", directory), prefix + entry.name + "/");
    else if (!entry.name.startsWith(".") && !entry.name.endsWith(".d.ts") && !["_headers"].includes(entry.name)) files.add("/" + prefix + entry.name);
  }
}
await inventory(root);
const contentTypes = new Map([["html", "text/html; charset=utf-8"], ["js", "text/javascript; charset=utf-8"], ["css", "text/css; charset=utf-8"], ["json", "application/json"], ["svg", "image/svg+xml"], ["woff", "font/woff"], ["ttf", "font/ttf"], ["txt", "text/plain"]]);
const assets = {
  /** @param {Request} request */
  async fetch(request) {
  const path = new URL(request.url).pathname;
  if (!files.has(path)) return new Response("Not found", { status: 404 });
  const bytes = await readFile(new URL(path.slice(1), root));
  return new Response(new Uint8Array(bytes).buffer, { headers: { "Content-Type": contentTypes.get(path.split(".").at(-1) ?? "") ?? "application/octet-stream", "Cache-Control": "no-store" } });
} };
const cacheRoot = new URL("../.data/kv/", import.meta.url);
await mkdir(cacheRoot, { recursive: true });
/** @param {string} key */
function keyPath(key) { return new URL(createHash("sha256").update(key).digest("hex") + ".json", cacheRoot); }
const store = {
  /** @param {string} key @returns {Promise<string | null>} */
  async get(key) {
    try { return await readFile(keyPath(key), "utf8"); } catch { /* A captured seed can fill a cold local cache. */ }
    if (key.startsWith("repo:")) {
      const repository = key.slice(5), filename = repository.replace("/", "-") + ".json";
      for (const directory of ["../.data/reports/", "../public/examples/"]) {
        try { return await readFile(new URL(directory + filename, import.meta.url), "utf8"); } catch { /* Try the next dated source. */ }
      }
    }
    if (key.startsWith("snapshot:")) {
      const [_, repository, stamp] = key.split(":");
      const saved = await store.get("repo:" + repository);
      if (saved && Date.parse(JSON.parse(saved).capturedAt) === Number(stamp)) return saved;
    }
    return null;
  },
  /** @param {string} key @param {string} value */ async put(key, value) { await writeFile(keyPath(key), value); }
};
const wasm = await readFile(new URL("../node_modules/@resvg/resvg-wasm/index_bg.wasm", import.meta.url));
const handler = createHandler({ assets, store, fetch, now: Date.now, githubToken: process.env.REPOLORE_GITHUB_TOKEN,
  png: pngRenderer(wasm, () => Promise.all([400, 500].map(weight => readFile(new URL(`assets/dm-sans-${weight}-ascii.ttf`, root))))) });
const port = Number(process.env.REPO_ARCADE_PORT ?? 4178);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Use a port between 1024 and 65535.");
createServer(async (request, response) => {
  try {
    const result = await handler(new Request(`http://127.0.0.1:${port}${request.url ?? "/"}`, { method: request.method }));
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch { response.writeHead(503); response.end("This round could not be loaded."); }
}).listen(port, "127.0.0.1", () => console.log(`Local: http://127.0.0.1:${port}`));
