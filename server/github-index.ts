import {
	ArcadeError,
	buildReport,
	replayReport,
	parsePull,
	parseRepository,
	repositoryImageUrl,
	type Author,
	type Detail,
	type Report,
} from "../src/core.js";
export const INDEX_QUERY = `query RepoLoreIndex($owner:String!,$name:String!,$discussion:String!) {
 repository(owner:$owner,name:$name) { isPrivate nameWithOwner openGraphImageUrl usesCustomOpenGraphImage
  merged:pullRequests(first:100,states:MERGED,orderBy:{field:UPDATED_AT,direction:DESC}) { nodes { ...Facts } pageInfo { hasNextPage } }
  oldest:pullRequests(first:30,states:OPEN,orderBy:{field:CREATED_AT,direction:ASC}) { nodes { ...Facts } }
 }
 discussed:search(query:$discussion,type:ISSUE,first:20) { nodes { ... on PullRequest { repository { isPrivate nameWithOwner } ...Facts } } }
 rateLimit { cost remaining resetAt }
}
fragment Facts on PullRequest { number title createdAt updatedAt mergedAt isDraft headRefOid additions deletions totalCommentsCount
 author { __typename login avatarUrl ... on User { databaseId } ... on Bot { databaseId } }
}`;
type RawPull = {
	number: number;
	title: string;
	createdAt: string;
	updatedAt: string;
	mergedAt: string | null;
	isDraft: boolean;
	headRefOid: string;
	additions: number;
	deletions: number;
	totalCommentsCount: number;
	author: null | {
		databaseId?: number;
		login: string;
		avatarUrl: string;
		__typename: string;
	};
	repository?: { isPrivate: boolean; nameWithOwner: string };
};
function count(value: unknown): number {
	if (!Number.isSafeInteger(value) || Number(value) < 0)
		throw new Error("Invalid aggregate count.");
	return Number(value);
}
export async function collectIndexedReport(
	repository: string,
	options: { fetch: typeof fetch; now: number; signal: AbortSignal },
): Promise<Report> {
	const name = parseRepository(repository),
		[owner, repo] = name.split("/");
	const metaResponse = await options.fetch(
		`https://api.github.com/repos/${name}`,
		{
			redirect: "error",
			signal: options.signal,
			headers: { Accept: "application/vnd.github+json" },
		},
	);
	if (!metaResponse.ok) throw new Error("Public metadata unavailable.");
	const metaText = await metaResponse.text();
	if (metaText.length > 500_000) throw new Error("Metadata too large.");
	const meta = JSON.parse(metaText) as {
		private: boolean;
		full_name: string;
		description: string | null;
		owner: { id: number; login: string; type: string; avatar_url?: string };
		stargazers_count: number;
		forks_count: number;
		language: string | null;
	};
	if (meta.private !== false)
		throw new ArcadeError(
			"PRIVATE",
			"Repo Lore reads public repositories only.",
		);
	if (parseRepository(meta.full_name).toLowerCase() !== name.toLowerCase())
		throw new Error("Repository identity changed.");
	const since = new Date(options.now - 90 * 86_400_000)
		.toISOString()
		.slice(0, 10);
	const response = await options.fetch("https://api.github.com/graphql", {
		method: "POST",
		redirect: "error",
		signal: options.signal,
		headers: {
			"Content-Type": "application/json",
			Accept: "application/vnd.github+json",
		},
		body: JSON.stringify({
			query: INDEX_QUERY,
			variables: {
				owner,
				name: repo,
				discussion: `repo:${name} is:pr is:merged merged:>=${since} sort:comments-desc`,
			},
		}),
	});
	if (!response.ok) throw new Error("PR aggregates unavailable.");
	const body = await response.text();
	if (body.length > 8_000_000) throw new Error("PR aggregates too large.");
	const decoded = JSON.parse(body) as {
		errors?: unknown;
		data?: {
			repository: {
				isPrivate: boolean;
				nameWithOwner: string;
				openGraphImageUrl?: string;
				usesCustomOpenGraphImage?: boolean;
				merged: { nodes: RawPull[]; pageInfo: { hasNextPage: boolean } };
				oldest: { nodes: RawPull[] };
			};
			discussed: { nodes: RawPull[] };
		};
	};
	if (
		decoded.errors ||
		!decoded.data ||
		decoded.data.repository.isPrivate !== false ||
		decoded.data.repository.nameWithOwner.toLowerCase() !== name.toLowerCase()
	)
		throw new Error("Incomplete or private aggregate response.");
	const data = decoded.data;
	if (
		!Array.isArray(data.repository.merged.nodes) ||
		data.repository.merged.nodes.length > 100 ||
		!Array.isArray(data.repository.oldest.nodes) ||
		data.repository.oldest.nodes.length > 30 ||
		!Array.isArray(data.discussed.nodes) ||
		data.discussed.nodes.length > 20
	)
		throw new Error("Unbounded aggregate response.");
	const normalize = (raw: RawPull): Detail => {
		const author = raw.author?.databaseId
			? {
					id: raw.author.databaseId,
					login: raw.author.login,
					type: raw.author.__typename === "Bot" ? "Bot" : "User",
					avatar_url: raw.author.avatarUrl,
				}
			: null;
		const pull = parsePull(
			{
				number: raw.number,
				title: raw.title,
				user: author,
				created_at: raw.createdAt,
				updated_at: raw.updatedAt,
				merged_at: raw.mergedAt,
				draft: raw.isDraft,
				head: { sha: raw.headRefOid },
			},
			name,
		);
		return {
			...pull,
			additions: count(raw.additions),
			deletions: count(raw.deletions),
			reviewComments: null,
			totalComments: count(raw.totalCommentsCount),
		};
	};
	const recent = data.repository.merged.nodes.map(normalize);
	const discussed = data.discussed.nodes
		.filter(
			(raw) =>
				raw.repository?.isPrivate === false &&
				raw.repository.nameWithOwner.toLowerCase() === name.toLowerCase(),
		)
		.map(normalize)
		.filter(
			(pr) =>
				pr.mergedAt !== null &&
				pr.mergedAt >= options.now - 90 * 86_400_000 &&
				pr.mergedAt <= options.now,
		);
	const closed = [
		...new Map([...recent, ...discussed].map((pr) => [pr.number, pr])).values(),
	].sort((a, b) => b.updatedAt - a.updatedAt);
	const details = closed.filter(
		(pr) =>
			pr.mergedAt !== null &&
			pr.mergedAt >= options.now - 90 * 86_400_000 &&
			pr.mergedAt <= options.now,
	);
	const complete =
		!data.repository.merged.pageInfo.hasNextPage ||
		Boolean(
			recent.at(-1) && recent.at(-1)!.updatedAt < options.now - 90 * 86_400_000,
		);
	const profileOwner: Author = {
		id: count(meta.owner.id),
		login: meta.owner.login,
		bot: meta.owner.type === "Bot",
		avatarUrl: meta.owner.avatar_url,
	};
	return replayReport(
		buildReport({
			repository: name,
			version: 2,
			description: meta.description ?? "",
			now: options.now,
			closed,
			details,
			open: data.repository.oldest.nodes.map(normalize),
			profile: {
				owner: profileOwner,
				ownerOrganization: meta.owner.type === "Organization",
				artworkChecked: true,
				imageUrl: data.repository.usesCustomOpenGraphImage
					? repositoryImageUrl(data.repository.openGraphImageUrl)
					: undefined,
				stars: count(meta.stargazers_count),
				forks: count(meta.forks_count),
				language: meta.language,
			},
			periodComplete: complete,
			openKnown: true,
			detailRequested: details.length,
			requests: 2,
			contributingUrl: null,
			notes: [
				"Indexed read: up to 100 recent merged PRs plus 20 discussion-heavy merged PR candidates from the past 90 days. GitHub's total comment count includes PR conversation and review discussion.",
			],
		}),
	);
}

export const ARTWORK_QUERY = `query RepoLoreArtwork($owner:String!,$name:String!) { repository(owner:$owner,name:$name) { isPrivate nameWithOwner openGraphImageUrl usesCustomOpenGraphImage owner { __typename } } }`;
export async function collectRepositoryArtwork(
	report: Report,
	fetcher: typeof fetch,
	signal: AbortSignal,
): Promise<Report> {
	const [owner, name] = report.repository.split("/");
	const result = await fetcher("https://api.github.com/graphql", {
		method: "POST",
		signal,
		redirect: "error",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ query: ARTWORK_QUERY, variables: { owner, name } }),
	});
	if (!result.ok) throw new Error("Repository artwork unavailable.");
	const text = await result.text();
	if (text.length > 500_000) throw new Error("Artwork metadata too large.");
	const data = JSON.parse(text);
	const repo = data.data?.repository;
	if (
		data.errors ||
		!repo ||
		repo.isPrivate !== false ||
		repo.nameWithOwner.toLowerCase() !== report.repository.toLowerCase()
	)
		throw new Error("Repository artwork identity unavailable.");
	return replayReport({
		...report,
		profile: {
			...report.profile,
			ownerOrganization: repo.owner?.__typename === "Organization",
			artworkChecked: true,
			imageUrl: repo.usesCustomOpenGraphImage
				? repositoryImageUrl(repo.openGraphImageUrl)
				: undefined,
		},
	});
}
