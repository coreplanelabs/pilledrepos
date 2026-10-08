// Isolated UI boundary: mock PR reads take 3 seconds; no GitHub or database writes.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHandler } from "../.server-dist/server/http.js";
import { aiPage } from "../.server-dist/src/ai.js";
import { registry, report } from "../.test-dist/test/fixtures.js";
import { nodeRequest } from "../scripts/node-request.mjs";
const reports = Array.from({ length: 12 }, (_, i) =>
  report(100, 80 - i, `fixture/repo-${i + 1}`),
);
const handler = createHandler({
  dataset: async () => ({
    reports,
    registry,
    registryId: "ui-fixture",
    classificationId: "ids",
    history: {},
    pool: "Isolated UI fixture",
    capturedAt: report().capturedAt,
    complete: true,
  }),
  png: async () => new Uint8Array(),
  assets: async (path) => {
    if (!/^\/(?:assets\/[a-z0-9_.-]+|[a-z0-9_.-]+)$/.test(path))
      return new Response("", { status: 404 });
    const bytes = await readFile("dist" + path);
    const type = path.endsWith(".js")
      ? "text/javascript"
      : path.endsWith(".css")
        ? "text/css"
        : "application/octet-stream";
    return new Response(bytes, { headers: { "Content-Type": type } });
  },
  catalog: {
    extras: async () => [],
    page: async (name) =>
      reports.some((r) => r.repository === name)
        ? aiPage(
            reports.find((r) => r.repository === name),
            registry,
          )
        : null,
    add: async () => {
      await new Promise((r) => setTimeout(r, 3000));
      return {
        status: "ready",
        repository: reports[0].repository,
        page: aiPage(reports[0], registry),
      };
    },
  },
});
createServer(async (req, res) => {
  try {
    const r = await handler(await nodeRequest(req, "http://127.0.0.1:4190"));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    if (r.headers.get("Content-Type")?.startsWith("text/html")) {
      const html = await r.text();
      res.end(
        html
          .replace("<title>", "<title>UI FIXTURE · ")
          .replace(
            '<main id="main">',
            '<main id="main"><p style="padding:12px;border:1px solid #AB69EB">Isolated UI fixture: synthetic counts. Real preview: <a href="http://127.0.0.1:4189/">port 4189</a>.</p>',
          ),
      );
    } else res.end(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end("UI fixture unavailable.");
  }
}).listen(4190, "127.0.0.1", () =>
  console.log("Isolated UI review: http://127.0.0.1:4190"),
);
