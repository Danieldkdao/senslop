import type { SnapshotChange } from "./types";

export const mapSnapshotBatches = <T>(
  batches: SnapshotChange[][],
  analyze: (batch: SnapshotChange[], index: number) => Promise<T>,
  signal: AbortSignal,
  concurrency: number | (() => number),
  subscribe?: (notify: () => void, pending: () => number) => () => void,
): Promise<T[]> => {
  const previousFileBatch = new Map<string, number>();
  const dependencies = batches.map((batch, index) => {
    const previous = new Set<number>();
    for (const path of new Set(batch.map((file) => file.path))) {
      const dependency = previousFileBatch.get(path);
      if (dependency !== undefined) previous.add(dependency);
      previousFileBatch.set(path, index);
    }
    return previous;
  });
  return new Promise<T[]>((resolve, reject) => {
    const pending = new Set(batches.map((_, index) => index));
    const completed = new Set<number>();
    const results: T[] = [];
    let active = 0;
    let failed = false;
    let failure: unknown;
    let finished = false;
    const canceled = () => {
      failed = true;
      failure = signal.reason;
      pump();
    };
    const pump = () => {
      if (finished) return;
      if (signal.aborted) {
        failed = true;
        failure = signal.reason;
      }
      if (!active && (failed || !pending.size)) {
        finished = true;
        signal.removeEventListener("abort", canceled);
        unsubscribe?.();
        if (failed) reject(failure);
        else resolve(results);
        return;
      }
      while (
        !failed &&
        active <
          Math.max(
            1,
            typeof concurrency === "function" ? concurrency() : concurrency,
          )
      ) {
        const index = [...pending].find((candidate) =>
          [...dependencies[candidate]!].every((dependency) =>
            completed.has(dependency),
          ),
        );
        if (index === undefined) break;
        pending.delete(index);
        active++;
        // Drain already-started work on failure so its validated checkpoints survive the retry.
        Promise.resolve()
          .then(() => analyze(batches[index]!, index))
          .then(
            (result) => {
              results[index] = result;
              completed.add(index);
            },
            (error: unknown) => {
              if (!failed) {
                failed = true;
                failure = error;
              }
            },
          )
          .finally(() => {
            active--;
            pump();
          });
      }
    };
    signal.addEventListener("abort", canceled, { once: true });
    const unsubscribe = subscribe?.(pump, () => (failed ? 0 : pending.size));
    pump();
  });
};
