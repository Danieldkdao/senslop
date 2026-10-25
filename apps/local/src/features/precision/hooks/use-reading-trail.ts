"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { sourceLocationSchema, type SourceLocationSchema } from "../schemas";

const readingTrailSchema = z.object({
  key: z.string(),
  index: z.number().int().min(-1),
  entries: z
    .array(
      sourceLocationSchema.extend({
        scrollTop: z.number().nonnegative(),
        context: z.boolean().optional(),
      }),
    )
    .max(100),
});
export type ReadingTrailSchema = z.infer<typeof readingTrailSchema>;

const readTrail = (key: string): ReadingTrailSchema => {
  try {
    const saved = sessionStorage.getItem(`senslop:trail:${key}`);
    const parsed = readingTrailSchema.safeParse(
      saved ? JSON.parse(saved) : null,
    );
    if (
      parsed.success &&
      parsed.data.key === key &&
      parsed.data.index < parsed.data.entries.length
    )
      return parsed.data;
  } catch {}
  return { key, index: -1, entries: [] };
};

export const useReadingTrail = (key: string) => {
  const [state, setState] = useState<ReadingTrailSchema>(() => readTrail(key));
  const current = state.key === key ? state : { key, index: -1, entries: [] };
  if (state.key !== key) setState(readTrail(key));
  useEffect(() => {
    try {
      if (state.key === key)
        sessionStorage.setItem(`senslop:trail:${key}`, JSON.stringify(state));
    } catch {
      /* Navigation remains available if tab storage is full. */
    }
  }, [key, state]);
  const visit = (
    location: SourceLocationSchema & { context?: boolean },
    scrollTop: number,
  ) => {
    if (state.key !== key) return;
    const entries = current.entries
      .slice(0, current.index + 1)
      .map((entry) => ({ ...entry }));
    const previous = entries.at(-1);
    if (previous) previous.scrollTop = scrollTop;
    if (
      previous &&
      previous.path === location.path &&
      previous.side === location.side &&
      previous.unitId === location.unitId &&
      previous.start === location.start &&
      previous.end === location.end &&
      previous.context === location.context
    )
      return;
    entries.push({ ...location, scrollTop: 0 });
    if (entries.length > 100) entries.shift();
    setState({ key, entries, index: entries.length - 1 });
  };
  const goTo = (index: number, scrollTop: number) => {
    if (index < 0 || index >= current.entries.length) return null;
    const entries = current.entries.map((entry, entryIndex) =>
      entryIndex === current.index ? { ...entry, scrollTop } : entry,
    );
    setState({ key, index, entries });
    return entries[index]!;
  };
  return {
    visit,
    go: (direction: -1 | 1, scrollTop: number) =>
      goTo(current.index + direction, scrollTop),
    returnToReview: (scrollTop: number) => {
      let index = current.index - 1;
      while (index >= 0 && current.entries[index]?.context) index--;
      return goTo(index, scrollTop);
    },
    ready: state.key === key,
    current: current.entries[current.index],
    canBack: current.index > 0,
    canForward: current.index < current.entries.length - 1,
  };
};
