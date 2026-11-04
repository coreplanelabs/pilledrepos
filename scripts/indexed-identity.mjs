import { RepositoryRefused, refusalStatus } from "./repository-availability.mjs";
/**
 * Resolve the canonical metadata for a tracked indexed repository.
 *
 * The daily refresh selects members from the database by their stored name and
 * keys each member by its stable GitHub repository ID. When the stored name now
 * belongs to a different repository (a rename freed the name and another
 * repository took it), GitHub serves that other repository, so the read ID does
 * not match the tracked ID. Read the tracked repository by its stable ID to
 * reuse GitHub's canonical name instead of aborting the daily refresh.
 *
 * A refusal (403, 404, 410) on the stable-ID read names the member and leaves it
 * out of the published cohort, like any other refused member. A response that
 * still does not match the tracked ID fails closed.
 */
export async function resolveIndexedIdentity({
  read,
  requested,
  trackedId,
  value,
}) {
  if (trackedId === undefined || value.id === trackedId) return value;
  let moved;
  try {
    moved = await read("/repositories/" + trackedId);
  } catch (error) {
    const status = refusalStatus(error);
    if (status === null) throw error;
    throw new RepositoryRefused(requested, status);
  }
  if (!Number.isSafeInteger(moved?.id) || moved.id !== trackedId)
    throw new Error(
      "Indexed repository identity changed; membership is preserved.",
    );
  return moved;
}
