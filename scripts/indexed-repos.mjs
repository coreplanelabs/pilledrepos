import { resolve } from "node:path";
import { localRepoDb } from "./local-repo-db.mjs";
import { cloudflare, ACCOUNT } from "./release-guard.mjs";
export const INDEXED_REPOS_SQL =
  "SELECT id,name FROM repos WHERE indexed=1 ORDER BY name COLLATE NOCASE";
export async function indexedRepos(db) {
  return (await db.prepare(INDEXED_REPOS_SQL).all()).results;
}
export async function loadIndexedRepos() {
  if (process.env.CLOUDFLARE_INDEX_TOKEN) {
    const r = await cloudflare(
      `/accounts/${ACCOUNT}/d1/database/afc39784-ac54-48f4-863b-c526be1c0ab4/query`,
      process.env.CLOUDFLARE_INDEX_TOKEN,
      {
        method: "POST",
        body: JSON.stringify({ sql: INDEXED_REPOS_SQL, params: [] }),
      },
    );
    return r.result[0].results;
  }
  const db = localRepoDb();
  try {
    return await indexedRepos(db);
  } finally {
    db.close();
  }
}
if (
  process.argv[1] &&
  new URL(import.meta.url).pathname === resolve(process.argv[1])
)
  console.log(JSON.stringify(await loadIndexedRepos(), null, 2));
