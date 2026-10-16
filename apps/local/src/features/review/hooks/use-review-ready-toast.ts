"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/toast";
import type { JobSchema } from "../../agents/schemas";
import { matchesJobSnapshot } from "../../agents/lib/job-snapshots";
import {
  formatAnalysisNotification,
  formatReviewOperation,
} from "../lib/formatters";
import type { ReviewOperation } from "../types";

export const useReviewReadyToast = ({
  snapshotId,
  hash,
  round,
  ready,
  jobs,
  requestedJobs,
  operation,
  onHandled,
}: {
  snapshotId?: string;
  hash?: string;
  round?: number;
  ready: boolean;
  jobs: JobSchema[];
  requestedJobs?: string[];
  operation?: ReviewOperation | null;
  onHandled?: () => void;
}) => {
  const observed = useRef({
    identity: "",
    statuses: new Map<string, JobSchema["status"]>(),
    pending: new Map<string, JobSchema>(),
  });
  const handled = useRef<ReviewOperation | null>(null);
  const announced = useRef(new Set<string>());
  useEffect(() => {
    const identity = `${snapshotId}:${hash}:${round ?? 1}`;
    if (observed.current.identity !== identity)
      observed.current = { identity, statuses: new Map(), pending: new Map() };
    const { statuses, pending } = observed.current;
    const action =
      operation &&
      operation !== handled.current &&
      operation.snapshotId === snapshotId &&
      operation.hash === hash
        ? operation
        : null;
    const finishAction = () => {
      if (!action) return;
      handled.current = action;
      onHandled?.();
    };
    for (const job of jobs.filter((job) =>
      matchesJobSnapshot(job, { hash, round }),
    )) {
      const previous = statuses.get(job.id);
      const wasActive = previous === "queued" || previous === "running";
      const terminal =
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "canceled";
      if (
        terminal &&
        !announced.current.has(job.id) &&
        (wasActive ||
          requestedJobs?.includes(job.id) ||
          (action && job.kind === "grouping"))
      )
        pending.set(job.id, job);
      statuses.set(job.id, job.status);
    }
    let groupingFinished = false;
    for (const [id, job] of pending) {
      if (job.kind === "grouping" && job.status === "completed" && !ready)
        continue;
      pending.delete(id);
      announced.current.add(id);
      const message = formatAnalysisNotification(job);
      if (message && job.status === "failed") toast.error(message);
      else if (message && job.status === "completed") toast.success(message);
      if (job.kind === "grouping") {
        groupingFinished = true;
        finishAction();
      }
    }
    if (action && ready && !groupingFinished) {
      toast.success(formatReviewOperation(action.mode));
      finishAction();
    }
  }, [
    snapshotId,
    hash,
    round,
    ready,
    jobs,
    requestedJobs,
    operation,
    onHandled,
  ]);
};
