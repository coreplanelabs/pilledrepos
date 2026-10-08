export const SEED_SIZE = 10000;
export function isSeedRepo(r) {
  return (
    r.private === false &&
    !r.fork &&
    !r.archived &&
    !r.disabled &&
    typeof r.language === "string" &&
    r.language.length > 0 &&
    Number.isSafeInteger(r.id) &&
    r.id > 0 &&
    !/(^|\/)(awesome[^/]*|[^/]*tutorial[^/]*|coding-interview[^/]*|free-programming-books|developer-roadmap|build-your-own-x|system-design-primer|project-based-learning|computer-science|public-apis|javascript-questions|the-book-of-secret-knowledge)$/i.test(
      r.full_name,
    ) &&
    !/curated list|collection of (?:resources|links)|(?:interview|programming) (?:questions|exercises)|step-by-step tutorial/i.test(
      r.description ?? "",
    )
  );
}
/** Partition stars to avoid GitHub's 1,000-result search cap, highest first. */
export async function selectTopRepos(
  search,
  { count = SEED_SIZE, since, minimumStars = 500 } = {},
) {
  const selected = new Map();
  const base = `is:public fork:false archived:false pushed:>=${since}`;
  const first = await search(`${base} stars:>=${minimumStars}`, 1);
  const maximum = first.items[0]?.stargazers_count;
  if (!Number.isSafeInteger(maximum))
    throw new Error("No verified top repositories.");
  async function band(low, high) {
    if (selected.size >= count || low > high) return;
    const q = `${base} stars:${low}..${high}`;
    const head = await search(q, 1);
    if (head.incomplete_results)
      throw new Error("Incomplete repository discovery.");
    if (head.total_count > 1000) {
      if (low === high)
        throw new Error("Star tie exceeds search cap; refine discovery.");
      const mid = Math.floor((low + high) / 2);
      await band(mid + 1, high);
      await band(low, mid);
      return;
    }
    for (
      let page = 1;
      page <= Math.ceil(head.total_count / 100) && selected.size < count;
      page++
    ) {
      const data = page === 1 ? head : await search(q, page);
      if (data.incomplete_results || data.total_count !== head.total_count)
        throw new Error("Repository search changed; resume discovery.");
      for (const r of data.items) if (isSeedRepo(r)) selected.set(r.id, r);
    }
  }
  await band(minimumStars, maximum);
  const rows = [...selected.values()]
    .sort(
      (a, b) =>
        b.stargazers_count - a.stargazers_count ||
        a.full_name.localeCompare(b.full_name),
    )
    .slice(0, count);
  if (rows.length !== count)
    throw new Error(
      `Only ${rows.length} verified repositories; previous seed preserved.`,
    );
  return rows;
}
