import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { POPULAR_REPOS } from '../.server-dist/src/catalog.js';
import { parseRepository } from '../.server-dist/src/core.js';
import { parseStarHistory, starMetric } from '../.server-dist/src/star-history.js';
const run = promisify(execFile), args = process.argv.slice(2);
const repositories = args.length === 1 && args[0] === '--popular' ? POPULAR_REPOS : args.map(parseRepository);
if (!repositories.length || repositories.length > 8) throw new Error('Choose one to eight public repos, or --popular.');
await mkdir('.data/kv', { recursive: true });
const seed = [];
for (const repository of repositories) {
  const metadata = JSON.parse((await run('gh', ['api', `repos/${repository}`], { maxBuffer: 100_000, timeout: 15_000 })).stdout);
  if (metadata.private !== false || String(metadata.full_name).toLowerCase() !== repository.toLowerCase()) throw new Error('The repo must be public and match the requested name.');
  const response = JSON.parse((await run('gh', ['api', `repos/${repository}/stargazers/history?per_page=6`, '-H', 'X-GitHub-Api-Version: 2026-03-10'], { maxBuffer: 100_000, timeout: 15_000 })).stdout);
  const history = parseStarHistory(response, Date.now()), key = `stars:${repository.toLowerCase()}`, value = JSON.stringify(history);
  await writeFile(`.data/kv/${createHash('sha256').update(key).digest('hex')}.json`, value);
  seed.push({ key, value }); const metric = starMetric(history);
  console.log(`${repository}: +${metric?.added ?? 0} stars across ${metric?.days ?? 0} days`);
}
await writeFile('.data/star-seed.json', JSON.stringify(seed));
console.log('Saved .data/star-seed.json for the REPORTS KV binding. No credential was saved.');
