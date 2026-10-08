import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const p = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(p.name, "@coreplane/pilledrepos");
assert.equal(
  p.repository.url,
  "https://github.com/coreplanelabs/pilledrepos.git",
);
assert.equal(p.private, false);
assert.equal(p.publishConfig.access, "public");
await readFile("dist/ai.js");
await readFile("dist/ai.d.ts");
if (!process.env.GITHUB_ACTIONS && !process.env.PILLEDREPOS_BOOTSTRAP_PUBLISH)
  throw new Error(
    "Publish through the release workflow, or explicitly authorize the first bootstrap publish.",
  );
