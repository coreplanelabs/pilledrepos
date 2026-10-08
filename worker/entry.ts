import wasm from "@resvg/resvg-wasm/index_bg.wasm";
import { createHandler } from "../server/http.js";
import { edgeDatasetReader, type DataStore } from "../server/edge-data.js";
import { pngRenderer } from "../server/og.js";
import { RepoStore, type RepoDatabase } from "../server/repo-store.js";
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DATA: DataStore;
  REPOS: RepoDatabase;
  GITHUB_READ_TOKEN?: string;
  SOURCE_SHA?: string;
}
let handler: ReturnType<typeof createHandler> | undefined;
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!handler) {
      const dataset = edgeDatasetReader(env.DATA),
        read = async (path: string, body?: unknown) => {
          const r = await fetch("https://api.github.com" + path, {
            method: body ? "POST" : "GET",
            body: body ? JSON.stringify(body) : undefined,
            redirect: "error",
            signal: AbortSignal.timeout(20000),
            headers: {
              Authorization: "Bearer " + env.GITHUB_READ_TOKEN,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
              "User-Agent": "PilledRepos",
            },
          });
          if (!r.ok) throw new Error(`GitHub read unavailable (${r.status}).`);
          return r.json();
        };
      handler = createHandler({
        dataset,
        catalog: env.GITHUB_READ_TOKEN
          ? new RepoStore(
              env.REPOS,
              read,
              async () => (await dataset()).registry,
            )
          : undefined,
        assets: (path) =>
          env.ASSETS.fetch(new Request("https://assets.internal" + path)),
        png: pngRenderer(wasm, () =>
          Promise.all(
            [400, 500].map(async (w) => {
              const r = await env.ASSETS.fetch(
                new Request(
                  `https://assets.internal/assets/dm-sans-${w}-ascii.ttf`,
                ),
              );
              if (!r.ok) throw new Error("Image font unavailable.");
              return new Uint8Array(await r.arrayBuffer());
            }),
          ),
        ),
      });
    }
    const response = await handler(request);
    const headers = new Headers(response.headers);
    if (env.SOURCE_SHA && /^[a-f0-9]{40}$/.test(env.SOURCE_SHA))
      headers.set("X-Pilledrepos-Revision", env.SOURCE_SHA);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
