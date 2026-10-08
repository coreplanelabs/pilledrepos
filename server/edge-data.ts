import {
  MIN_MERGES,
  aiPage,
  parseReport,
  parseRegistry,
  type AiPage,
} from "../src/ai.js";
import { parseRepository } from "../src/core.js";
import type { Dataset } from "./http.js";
export interface DataStore {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
}
export function validatePage(
  value: unknown,
  registry: Dataset["registry"],
): AiPage {
  const p = value as AiPage,
    a = p?.analysis;
  if (
    !p ||
    parseRepository(p.repository) !== p.repository ||
    typeof p.description !== "string" ||
    (p.repositoryId !== undefined &&
      (!Number.isSafeInteger(p.repositoryId) || p.repositoryId < 1)) ||
    !Number.isFinite(Date.parse(p.capturedAt)) ||
    !["merged-window-v2", "legacy-preview"].includes(p.collector) ||
    !a
  )
    throw new Error("Invalid compact repo record.");
  const counts = [a.total, a.ai, a.accounts, a.automation, a.unknown];
  if (
    counts.some((n) => !Number.isSafeInteger(n) || n < 0) ||
    a.ai + a.accounts + a.automation + a.unknown !== a.total ||
    a.share !== (a.total ? (a.ai / a.total) * 100 : null) ||
    a.registryAt !== registry.verifiedAt ||
    typeof a.complete !== "boolean" ||
    (a.eligible !== (a.complete && a.total > 0) &&
      a.eligible !== (a.complete && a.total >= MIN_MERGES)) ||
    (a.complete && p.collector !== "merged-window-v2")
  )
    throw new Error("Invalid compact counts or registry binding.");
  if (
    p.profile?.owner &&
    (!Number.isSafeInteger(p.profile.owner.id) || p.profile.owner.id < 1)
  )
    throw new Error("Invalid owner identity.");
  if (
    !Array.isArray(a.agents) ||
    a.agents.reduce((sum, g) => sum + g.count, 0) !== a.ai
  )
    throw new Error("Invalid agent totals.");
  const ids = new Set<number>();
  for (const group of a.agents) {
    if (
      !Number.isSafeInteger(group.count) ||
      group.count < 1 ||
      !Array.isArray(group.identities) ||
      !group.identities.length ||
      !Array.isArray(group.evidence) ||
      group.evidence.length > 6
    )
      throw new Error("Invalid agent evidence.");
    for (const identity of group.identities) {
      const known = registry.agents.find((i) => i.id === identity.id);
      if (
        !known ||
        ids.has(identity.id) ||
        known.name !== group.name ||
        identity.source !== known.source ||
        identity.accountUrl !== known.accountUrl
      )
        throw new Error("Unverified agent identity.");
      ids.add(identity.id);
    }
    for (const pr of group.evidence)
      if (
        !Number.isSafeInteger(pr.number) ||
        pr.number < 1 ||
        typeof pr.title !== "string" ||
        pr.url !== `https://github.com/${p.repository}/pull/${pr.number}`
      )
        throw new Error("Invalid PR evidence link.");
  }
  return {
    ...p,
    analysis: { ...a, eligible: a.complete && a.total > 0 },
    url: `https://github.com/${p.repository}`,
  };
}
export function compactDataset(dataset: Dataset): Dataset {
  const registry = parseRegistry(dataset.registry),
    pages =
      dataset.pages?.map((p) => validatePage(p, registry)) ??
      dataset.reports?.map((r) => aiPage(parseReport(r), registry));
  if (
    !dataset.complete ||
    !pages?.length ||
    pages.some((p) => !p.analysis.complete) ||
    new Set(pages.map((p) => p.repository.toLowerCase())).size !== pages.length
  )
    throw new Error("Incomplete dataset cannot be published.");
  return {
    pages,
    registry,
    registryId: dataset.registryId,
    classificationId: dataset.classificationId,
    history: dataset.history,
    pool: dataset.pool,
    capturedAt: dataset.capturedAt,
    complete: true,
  };
}
export async function sha256(text: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export type Manifest = {
  version: 1;
  key: string;
  sha: string;
  previousKey?: string;
  previousSha?: string;
  previousRepositories?: number;
  capturedAt: string;
  repositories: number;
};
/** A pointer can reach a POP before the new KV value. Fall back to the prior complete value. */
export function edgeDatasetReader(
  store: DataStore,
  now = Date.now,
): () => Promise<Dataset> {
  let cached: Dataset | undefined,
    cachedKey = "",
    until = 0;
  return async () => {
    if (cached && until > now()) return cached;
    try {
      const raw = await store.get("current");
      if (!raw) throw new Error("The first index is not published yet.");
      const manifest = JSON.parse(raw) as Manifest;
      if (
        manifest.version !== 1 ||
        !Number.isSafeInteger(manifest.repositories) ||
        manifest.repositories < 1 ||
        manifest.key !== "dataset:" + manifest.sha ||
        !/^[a-f0-9]{64}$/.test(manifest.sha)
      )
        throw new Error("Invalid dataset pointer.");
      if (cached && cachedKey === manifest.key) {
        until = now() + 30000;
        return cached;
      }
      for (const [key, sha, count] of [
        [manifest.key, manifest.sha, manifest.repositories],
        [
          manifest.previousKey,
          manifest.previousSha,
          manifest.previousRepositories,
        ],
      ]) {
        if (!key || !sha || key !== "dataset:" + sha) continue;
        const text = await store.get(key);
        if (!text || (await sha256(text)) !== sha) continue;
        const d = compactDataset(JSON.parse(text));
        if (count !== undefined && d.pages!.length !== count) continue;
        cached = d;
        cachedKey = key;
        until = now() + 30000;
        return d;
      }
      throw new Error(
        "The complete index is not available in this region yet.",
      );
    } catch (error) {
      if (cached) {
        until = now() + 5000;
        return cached;
      }
      throw error;
    }
  };
}
