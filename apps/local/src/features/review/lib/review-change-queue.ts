import type { ReviewChangeSchema } from "@senslop/contracts";

type SaveReviewChange = (
  id: string,
  change: ReviewChangeSchema,
  signal: AbortSignal,
) => Promise<void>;

export const createReviewChangeQueue = () => {
  const pending: {
    id: string;
    change: ReviewChangeSchema;
    save: SaveReviewChange;
    waiters: { resolve: () => void; reject: (error: unknown) => void }[];
  }[] = [];
  let active: AbortController | null = null;
  const drain = async () => {
    if (active) return;
    while (pending.length) {
      const item = pending.shift()!;
      active = new AbortController();
      try {
        await item.save(item.id, item.change, active.signal);
        item.waiters.forEach(({ resolve }) => resolve());
      } catch (error) {
        item.waiters.forEach(({ reject }) => reject(error));
      } finally {
        active = null;
      }
    }
  };
  return {
    enqueue: (id: string, change: ReviewChangeSchema, save: SaveReviewChange) =>
      new Promise<void>((resolve, reject) => {
        const last = pending.at(-1);
        // Replace pending selections without skipping completion or note writes between them.
        if (
          change.action === "select" &&
          last?.id === id &&
          last.change.action === "select"
        ) {
          last.change = change;
          last.waiters.push({ resolve, reject });
        } else
          pending.push({ id, change, save, waiters: [{ resolve, reject }] });
        void drain();
      }),
    cancel: () => {
      active?.abort();
      const error = new DOMException("Review closed.", "AbortError");
      pending
        .splice(0)
        .forEach((item) => item.waiters.forEach(({ reject }) => reject(error)));
    },
  };
};
