import wasm from "@resvg/resvg-wasm/index_bg.wasm";
import { createHandler, type Store } from "../server/http.js";
import { pngRenderer } from "../server/og.js";
import { edgeFetcher } from "../server/transport.js";
import { refreshIndex } from "../server/indexing.js";
interface Env { ASSETS: { fetch(request: Request): Promise<Response> }; REPORTS: Store; GITHUB_TOKEN?: string }
let handler: ReturnType<typeof createHandler> | undefined;
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    handler ??= createHandler({ assets: env.ASSETS, store: env.REPORTS, fetch: edgeFetcher((input, init) => fetch(input, init)), now: Date.now, githubToken: env.GITHUB_TOKEN,
      png: pngRenderer(wasm, async () => Promise.all([400, 500].map(async weight => {
        const response = await env.ASSETS.fetch(new Request(`https://assets.internal/assets/dm-sans-${weight}-ascii.ttf`));
        if (!response.ok) throw new Error("The local preview font is unavailable.");
        return new Uint8Array(await response.arrayBuffer());
      }))) });
    return handler(request);
  },
  scheduled(_event: unknown, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }): void {
    ctx.waitUntil(refreshIndex({ store: env.REPORTS, fetch: edgeFetcher((input, init) => fetch(input, init)), now: Date.now, token: env.GITHUB_TOKEN }).then(result => {
      console.log("RepoLore index", { status: result.status, captured: result.captured });
    }).catch(() => { console.warn("RepoLore index refresh unavailable; preserving existing snapshots."); }));
  }
};
