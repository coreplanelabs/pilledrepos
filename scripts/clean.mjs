import { rm } from "node:fs/promises";
await Promise.all((process.argv.includes("--tests") ? [".test-dist"] : ["dist", ".server-dist"]).map(name => rm(new URL(`../${name}`, import.meta.url), { recursive: true, force: true })));
