import { GitHubReadError } from "./github-api.mjs";
/** Statuses that mean the provider will not serve this repository to this credential. */
const REFUSED = new Set([403, 404, 410]);
/** A refusal share this large is a credential or provider fault, never cohort drift. */
export function refusedBound(expected) {
  return Math.max(25, Math.ceil(expected / 100));
}
export function refusalStatus(error) {
  return error instanceof GitHubReadError && REFUSED.has(error.status)
    ? error.status
    : null;
}
export class RepositoryRefused extends Error {
  constructor(repository, status) {
    super(
      `${repository}: GitHub will not serve this repository (${status}). The last published page is preserved.`,
    );
    this.repository = repository;
    this.status = status;
  }
}
export function refusedSummary(refused) {
  return refused.map((r) => `${r.repository} (${r.status})`).join(", ");
}
export function poolWithoutRefused(selected, refused) {
  const drop = new Set(refused.map((r) => r.repository.toLowerCase()));
  return selected.filter((name) => !drop.has(name.toLowerCase()));
}
