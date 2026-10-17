"use client";

import { useEffect, useState } from "react";
import type { JobSchema } from "../schemas";

export const useGroupingCountdown = (job?: JobSchema) => {
  const [now, setNow] = useState(() => Date.now());
  const fallback = job?.status === "failed" ? job.fallbackAt : null;
  const deadline =
    fallback ??
    (job?.status === "running" || job?.status === "queued"
      ? job.retryAt
      : null);
  const updatedAt = job?.updatedAt ? Date.parse(job.updatedAt) : now;
  const seconds = deadline
    ? Math.max(
        0,
        Math.ceil((Date.parse(deadline) - Math.max(now, updatedAt)) / 1000),
      )
    : null;
  const counting = seconds !== null && seconds > 0;
  useEffect(() => {
    if (!deadline || !counting) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline, counting]);
  return { seconds, fallbackReady: !!fallback && seconds === 0 };
};
