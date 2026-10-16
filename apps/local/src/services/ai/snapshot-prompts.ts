import { estimateTokens } from "./context-budget";
import {
  AiGroupingRepairError,
  AiReviewRepairError,
  AiStructuredOutputError,
  AiOutputLimitError,
  AiServiceError,
} from "./errors";
import type { SnapshotChange } from "./types";

export const batchSnapshotChanges = (
  changes: SnapshotChange[],
  maxTokens: number,
  maxFiles = 24,
) => {
  const batches: SnapshotChange[][] = [];
  let batch: SnapshotChange[] = [];
  const append = (change: SnapshotChange) => {
    if (
      batch.length &&
      (batch.length >= maxFiles ||
        estimateTokens([...batch, change]) > maxTokens)
    ) {
      batches.push(batch);
      batch = [];
    }
    batch.push(change);
  };
  for (const change of changes) {
    if (estimateTokens([change]) <= maxTokens) {
      append(change);
      continue;
    }
    let offset = 0;
    while (offset < change.diff.length) {
      let low = offset + 1;
      let high = Math.min(
        change.diff.length,
        offset + Math.floor(maxTokens * 3),
      );
      let end = offset;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const part = {
          ...change,
          diff: change.diff.slice(offset, middle),
          offset: (change.offset ?? 0) + offset,
          total: change.total ?? change.diff.length,
        };
        if (estimateTokens([part]) <= maxTokens) {
          end = middle;
          low = middle + 1;
        } else high = middle - 1;
      }
      if (end === offset)
        throw new AiServiceError(
          "The configured context window cannot fit the task instructions and file metadata. Shorten the grouping instructions or configure the model's actual context window.",
        );
      const newline = change.diff.lastIndexOf("\n", end - 1);
      if (newline > offset + (end - offset) / 2) end = newline + 1;
      append({
        ...change,
        diff: change.diff.slice(offset, end),
        offset: (change.offset ?? 0) + offset,
        total: change.total ?? change.diff.length,
      });
      offset = end;
    }
    if (!change.diff.length)
      throw new AiServiceError(
        "File metadata exceeds the available request budget.",
      );
  }
  if (batch.length) batches.push(batch);
  return batches;
};

export const processSnapshotBatches = async (
  batches: SnapshotChange[][],
  analyze: (batch: SnapshotChange[], attempt: number) => Promise<void>,
  signal: AbortSignal,
) => {
  const process = async (
    batch: SnapshotChange[],
    attempt = 0,
  ): Promise<void> => {
    signal.throwIfAborted();
    try {
      await analyze(batch, attempt);
    } catch (error) {
      const canNarrow =
        error instanceof AiOutputLimitError ||
        ((error instanceof AiGroupingRepairError ||
          error instanceof AiReviewRepairError ||
          error instanceof AiStructuredOutputError) &&
          batch.length > 1);
      // Coverage retries strictly halve the file set, ending at one file.
      const isolateReview =
        error instanceof AiReviewRepairError && batch.length > 1;
      if (!canNarrow || (attempt >= 3 && !isolateReview)) throw error;
      let smaller: SnapshotChange[][];
      if (batch.length > 1) {
        const middle = Math.ceil(batch.length / 2);
        smaller = [batch.slice(0, middle), batch.slice(middle)];
      } else {
        const change = batch[0]!;
        if (change.diff.length < 2) throw error;
        const middle = Math.ceil(change.diff.length / 2);
        smaller = [
          [
            {
              ...change,
              diff: change.diff.slice(0, middle),
              offset: change.offset ?? 0,
              total: change.total ?? change.diff.length,
            },
          ],
          [
            {
              ...change,
              diff: change.diff.slice(middle),
              offset: (change.offset ?? 0) + middle,
              total: change.total ?? change.diff.length,
            },
          ],
        ];
      }
      for (const part of smaller) await process(part, attempt + 1);
    }
  };
  for (const batch of batches) await process(batch);
};
