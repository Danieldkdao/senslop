import { performance } from "node:perf_hooks";
import { collectSnapshot } from "../../../packages/review-core/src/features/git/snapshot";
import { batchSnapshotChanges } from "../src/services/ai/snapshot-prompts";
import { mapSnapshotBatches } from "../src/services/ai/batch-scheduler";
import { createRequestLimiter } from "../src/services/ai/request-limiter";

// Read the current working tree; scheduling uses simulated 20 ms requests and makes no provider calls.
const snapshot = await collectSnapshot({
  cwd: process.cwd(),
  source: { kind: "working-tree" },
});
const changes = snapshot.files.map(({ path, oldPath, binary, diff }) => ({
  path,
  oldPath,
  binary,
  diff,
}));
const measurements = [];
for (const [inputTokens, files, concurrency] of [
  [12000, 8, 1],
  [18000, 12, 8],
  [24000, 12, 8],
  [32000, 12, 8],
]) {
  const batches = batchSnapshotChanges(changes, inputTokens!, files!);
  const limiter = createRequestLimiter({
    initialConcurrency: concurrency === 1 ? 1 : 2,
    maxConcurrency: concurrency,
  });
  let peak = 0;
  const startedAt = performance.now();
  await mapSnapshotBatches(
    batches,
    async () =>
      limiter.run(async () => {
        peak = Math.max(peak, limiter.state().active);
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
      }),
    new AbortController().signal,
    () => limiter.state().concurrency,
    (notify, pending) => {
      const unsubscribe = limiter.subscribe(notify);
      const releaseDemand = limiter.registerDemand(pending);
      return () => {
        unsubscribe();
        releaseDemand();
      };
    },
  );
  measurements.push({
    inputTokens,
    maxFiles: files,
    batches: batches.length,
    peakConcurrency: peak,
    simulatedDurationMs: Math.round(performance.now() - startedAt),
  });
}
console.log(
  JSON.stringify(
    {
      fixture: "current-working-tree",
      files: changes.length,
      simulatedRequestMs: 20,
      measurements,
    },
    null,
    2,
  ),
);
