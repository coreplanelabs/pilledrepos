import { INDEX_QUERY } from "../.server-dist/server/github-index.js";
/** Batch independent search reads; each repo still reconciles its complete census. */
export function batchMergeReader(
  read,
  {
    pause = (ms) => new Promise((done) => setTimeout(done, ms)),
    now = Date.now,
    onWait = () => {},
  } = {},
) {
  let pending = [],
    timer,
    gate = Promise.resolve(),
    blockedUntil = 0;
  const selection = INDEX_QUERY.slice(
    INDEX_QUERY.indexOf(" search("),
    INDEX_QUERY.lastIndexOf("}"),
  ).trim();
  async function flush() {
    timer = undefined;
    const batch = pending.splice(0, 20);
    if (pending.length) timer = setTimeout(flush, 20);
    try {
      if (blockedUntil > now()) await gate;
      const definitions = [],
        parts = [],
        variables = {};
      batch.forEach((r, i) => {
        definitions.push(`$query${i}:String!,$after${i}:String`);
        parts.push(
          `r${i}:` +
            selection
              .replaceAll("$query", `$query${i}`)
              .replaceAll("$after", `$after${i}`),
        );
        variables["query" + i] = r.body.variables.query;
        variables["after" + i] = r.body.variables.after;
      });
      const data = await read("/graphql", {
        query: `query BatchedMerges(${definitions.join(",")}) {${parts.join("\n")} rateLimit{cost remaining resetAt}}`,
        variables,
      });
      const rate = data.data?.rateLimit;
      if (rate && rate.remaining < 50) {
        const until = Date.parse(rate.resetAt) + 1000;
        if (Number.isFinite(until) && until > blockedUntil && until > now()) {
          blockedUntil = until;
          onWait(until);
          gate = pause(until - now());
        }
      }
      batch.forEach((r, i) => {
        const errors = data.errors?.filter(
          (e) => !e.path || e.path[0] === "r" + i,
        );
        r.resolve({
          data: { search: data.data?.["r" + i] },
          ...(errors?.length ? { errors } : {}),
        });
      });
    } catch (e) {
      batch.forEach((r) => r.reject(e));
    }
  }
  return (path, body) =>
    path === "/graphql" && body?.query === INDEX_QUERY
      ? new Promise((resolve, reject) => {
          pending.push({ body, resolve, reject });
          timer ??= setTimeout(flush, 20);
        })
      : read(path, body);
}
