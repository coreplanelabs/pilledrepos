/** Bounded retry for one repository capture.
 *
 * A capture can fail on a transient GitHub condition: a rate-limit 403, a dropped
 * connection, or a search page that shifts between reads. Retrying the whole
 * census lets a fresh attempt succeed instead of aborting the daily run. The
 * caller drops the repository's cached reads before each retry, because a
 * transiently inconsistent page would otherwise be replayed forever (the run's
 * capture time is frozen, so the cached read is deterministic).
 */
export async function retryCapture(
  capture,
  {
    attempts = 4,
    pause = (ms) => new Promise((done) => setTimeout(done, ms)),
    onRetry = async () => {},
  } = {},
) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await capture();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await onRetry(error, attempt);
      await pause(1000 * 2 ** (attempt - 1));
    }
  }
}
