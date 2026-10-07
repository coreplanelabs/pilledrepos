import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHandler } from "../.server-dist/server/http.js";
import { pngRenderer } from "../.server-dist/server/og.js";
import { collectIndexedReport } from "../.server-dist/server/github-index.js";
import { parseReport } from "../.server-dist/src/ai.js";
import { githubReader } from "./github-api.mjs";
import { readJson, atomicJson } from "./index-storage.mjs";
const useGh = process.argv.includes("--use-gh");
const onDemandRead =
  useGh || process.env.AI_PILLED_GITHUB_TOKEN ? githubReader(useGh) : null;
const root = resolve("dist"),
  index = resolve(".data/index");
let cached, tag;
async function dataset() {
  let path;
  try {
    const p = await readJson(resolve(index, "current.json"));
    if (!/^[a-z0-9-]+$/.test(p.runId))
      throw new Error("Invalid index pointer.");
    path = resolve(index, "runs", p.runId, "index.json");
  } catch {
    path = resolve(".data/preview.json");
  }
  if (tag !== path) {
    cached = await readJson(path);
    tag = path;
  }
  return cached;
}
const types = {
  js: "text/javascript",
  css: "text/css",
  svg: "image/svg+xml",
  woff: "font/woff",
  ttf: "font/ttf",
};
async function assets(path) {
  if (!/^\/(?:assets\/[a-z0-9_.-]+|[a-z0-9_.-]+)$/.test(path))
    return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(resolve(root, path.slice(1)));
    return new Response(bytes, {
      headers: {
        "Content-Type":
          types[path.split(".").at(-1)] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
async function onDemand(repo) {
  const file = resolve(
    ".data/on-demand",
    repo.toLowerCase().replace("/", "--") + ".json",
  );
  try {
    const r = parseReport(await readJson(file));
    if (Date.now() - Date.parse(r.capturedAt) < 86400000) return r;
  } catch {}
  const r = await collectIndexedReport(repo, {
    read: onDemandRead,
    now: Date.now(),
  });
  await atomicJson(file, r);
  return r;
}
const wasm = await readFile("node_modules/@resvg/resvg-wasm/index_bg.wasm");
const handler = createHandler({
  dataset,
  assets,
  png: pngRenderer(wasm, () =>
    Promise.all(
      [400, 500].map((w) =>
        readFile(resolve(root, `assets/dm-sans-${w}-ascii.ttf`)),
      ),
    ),
  ),
  onDemand: onDemandRead ? onDemand : undefined,
});
const port = Number(process.env.AI_PILLED_PORT ?? 4189);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Use a local port from 1024 to 65535.");
createServer(async (req, res) => {
  try {
    const r = await handler(
      new Request(`http://127.0.0.1:${port}${req.url ?? "/"}`, {
        method: req.method,
      }),
    );
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.writeHead(503);
    res.end("Local read unavailable.");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`AI Pilled preview: http://127.0.0.1:${port}`),
);
