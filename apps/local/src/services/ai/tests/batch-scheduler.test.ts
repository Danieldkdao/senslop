import { expect, test } from "vitest";
import { mapSnapshotBatches } from "../batch-scheduler";

const change = (path: string) => ({
  path,
  oldPath: null,
  binary: false,
  diff: "patch",
});

test("independent batches overlap while fragments of one file retain their order", async () => {
  const starts: number[] = [];
  const releases = new Map<number, () => void>();
  const batches = [[change("a.ts")], [change("b.ts")], [change("a.ts")]];
  const result = mapSnapshotBatches(
    batches,
    async (_batch, index) => {
      starts.push(index);
      await new Promise<void>((resolve) => releases.set(index, resolve));
      return index;
    },
    new AbortController().signal,
    3,
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(starts).toEqual([0, 1]);
  releases.get(1)!();
  await Promise.resolve();
  await Promise.resolve();
  expect(starts).toEqual([0, 1]);
  releases.get(0)!();
  while (!releases.has(2)) await Promise.resolve();
  releases.get(2)!();
  await expect(result).resolves.toEqual([0, 1, 2]);
});

test("a failure stops new batches and drains healthy work before returning", async () => {
  let finish!: () => void;
  const started: number[] = [];
  const finished: number[] = [];
  const result = mapSnapshotBatches(
    Array.from({ length: 4 }, (_, id) => [change(`${id}.ts`)]),
    async (_batch, index) => {
      started.push(index);
      if (index === 0) throw new Error("unavailable");
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      finished.push(index);
    },
    new AbortController().signal,
    2,
  );
  const rejected = expect(result).rejects.toThrow("unavailable");
  await Promise.resolve();
  await Promise.resolve();
  expect(started).toEqual([0, 1]);
  finish();
  await rejected;
  expect(finished).toEqual([1]);
  expect(started).toEqual([0, 1]);
});

test("cancellation prevents queued batches from starting", async () => {
  const abort = new AbortController();
  let calls = 0;
  await expect(
    mapSnapshotBatches(
      [[change("a.ts")], [change("b.ts")]],
      async () => {
        calls++;
        abort.abort();
      },
      abort.signal,
      1,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toBe(1);
});

test("batch admission follows learned provider capacity and unsubscribes after completion", async () => {
  let capacity = 1;
  let notify!: () => void;
  let unsubscribed = false;
  const started: number[] = [];
  const releases = new Map<number, () => void>();
  const result = mapSnapshotBatches(
    Array.from({ length: 3 }, (_, id) => [change(`${id}.ts`)]),
    async (_batch, id) => {
      started.push(id);
      await new Promise<void>((resolve) => releases.set(id, resolve));
    },
    new AbortController().signal,
    () => capacity,
    (listener, pending) => {
      notify = listener;
      expect(pending()).toBe(3);
      return () => {
        unsubscribed = true;
      };
    },
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(started).toEqual([0]);
  capacity = 2;
  notify();
  await Promise.resolve();
  await Promise.resolve();
  expect(started).toEqual([0, 1]);
  capacity = 1;
  notify();
  releases.get(0)!();
  await Promise.resolve();
  await Promise.resolve();
  expect(started).toEqual([0, 1]);
  releases.get(1)!();
  while (!releases.has(2)) await Promise.resolve();
  releases.get(2)!();
  await result;
  expect(unsubscribed).toBe(true);
});
