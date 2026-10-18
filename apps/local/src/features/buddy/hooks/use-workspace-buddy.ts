"use client";

import { useEffect, useRef } from "react";
import { useBuddy } from "../components/buddy-provider";
import { matchesJobSnapshot } from "../../agents/lib/job-snapshots";
import type { GroupingSchema, JobSchema } from "../../agents/schemas";
import type { LivePreview, ReviewOperation } from "../../review/types";

type WorkspaceBuddyOptions = {
  preview: LivePreview | null;
  jobs: JobSchema[];
  jobsLoaded?: boolean;
  grouping: GroupingSchema | null;
  error: string | null;
  requestedJobs?: string[];
  operation?: ReviewOperation | null;
};

export const useWorkspaceBuddy = ({
  preview,
  jobs,
  jobsLoaded = true,
  grouping,
  error,
  requestedJobs,
  operation,
}: WorkspaceBuddyOptions) => {
  const report = useBuddy();
  const observed = useRef({
    identity: "",
    statuses: new Map<string, JobSchema["status"]>(),
    completed: new Set<string>(),
    failed: false,
    initialized: false,
    latestCreatedAt: new Map<JobSchema["kind"], string>(),
  });
  useEffect(() => {
    const identity = JSON.stringify([
      preview?.id,
      preview?.hash,
      preview?.round ?? 1,
    ]);
    const changed = observed.current.identity !== identity;
    if (changed) {
      for (const id of observed.current.statuses.keys())
        report({ type: "activity", id: `job:${id}`, activity: null });
      observed.current = {
        identity,
        statuses: new Map(),
        completed: new Set(preview?.completedPaths),
        failed: false,
        initialized: false,
        latestCreatedAt: new Map(),
      };
    }
    const current = observed.current;
    const knownCreatedAt = new Map(current.latestCreatedAt);
    const relevant = jobs.filter(
      (job) =>
        preview &&
        job.snapshotId === preview.id &&
        matchesJobSnapshot(job, preview),
    );
    for (const id of current.statuses.keys()) {
      if (!relevant.some((job) => job.id === id)) {
        report({ type: "activity", id: `job:${id}`, activity: null });
        current.statuses.delete(id);
      }
    }
    for (const job of relevant) {
      const previous = current.statuses.get(job.id);
      const active = job.status === "queued" || job.status === "running";
      report({
        type: "activity",
        id: `job:${job.id}`,
        activity: active
          ? job.kind === "grouping"
            ? "grouping"
            : "working"
          : null,
      });
      const retrying =
        previous === "failed" ||
        (previous === undefined &&
          relevant.some(
            (attempt) =>
              attempt.id !== job.id &&
              attempt.kind === job.kind &&
              current.statuses.get(attempt.id) === "failed",
          ));
      if (active && retrying)
        report({
          type: "reaction",
          id: `retry:${job.id}:${job.updatedAt}`,
          mood: "retry",
          message: "Let's give that another try.",
        });
      const requested =
        requestedJobs?.includes(job.id) ||
        (job.kind === "grouping" &&
          operation?.snapshotId === preview?.id &&
          operation?.hash === preview?.hash);
      // Loading saved history sets the baseline; only a live transition or request reacts.
      if (
        previous !== job.status &&
        (previous === "queued" ||
          previous === "running" ||
          requested ||
          (previous === undefined &&
            current.initialized &&
            job.createdAt > (knownCreatedAt.get(job.kind) ?? "")))
      ) {
        if (job.status === "failed")
          report({
            type: "reaction",
            id: `job:${job.id}:${job.generation}:failed`,
            mood: "cry",
            message:
              job.kind === "grouping"
                ? "Grouping hit a snag. We can retry."
                : "The review hit a snag. We can retry.",
          });
        if (job.status === "completed") {
          const findings =
            job.result &&
            "findings" in job.result &&
            job.result.findings.length > 0;
          report({
            type: "reaction",
            id: `job:${job.id}:${job.generation}:completed`,
            mood: findings ? "proud" : "celebrate",
            message:
              job.kind === "grouping"
                ? "Your groups are ready!"
                : findings
                  ? "Review ready. There are findings to look through."
                  : "Review finished. Your results are ready!",
          });
        }
      }
      current.statuses.set(job.id, job.status);
      if (job.createdAt > (current.latestCreatedAt.get(job.kind) ?? ""))
        current.latestCreatedAt.set(job.kind, job.createdAt);
    }
    if (jobsLoaded) current.initialized = true;
    if (error && !current.failed)
      report({
        type: "reaction",
        id: crypto.randomUUID(),
        mood: "cry",
        message:
          "The workspace lost its connection. Your saved work is still here.",
      });
    if (!error && current.failed)
      report({
        type: "reaction",
        id: crypto.randomUUID(),
        mood: "retry",
        message: "We're connected again.",
      });
    current.failed = !!error;
    const completed = new Set(preview?.completedPaths);
    const added = [...completed].filter((path) => !current.completed.has(path));
    if (!changed && added.length && preview) {
      const finishedGroup = grouping?.groups.find(
        (group) =>
          group.files.length &&
          group.files.every((file) => completed.has(file.path)) &&
          group.files.some((file) => added.includes(file.path)),
      );
      const finishedReview =
        preview.files.length > 0 &&
        preview.files.every((file) => completed.has(file.path));
      report({
        type: "reaction",
        id: crypto.randomUUID(),
        mood: finishedReview ? "dance" : finishedGroup ? "celebrate" : "proud",
        message: finishedReview
          ? "You reviewed every file. Nicely done!"
          : finishedGroup
            ? `${finishedGroup.title} is complete!`
            : "One more file reviewed. Nice work.",
      });
    }
    current.completed = completed;
  }, [
    preview,
    jobs,
    jobsLoaded,
    grouping,
    error,
    requestedJobs,
    operation,
    report,
  ]);
  useEffect(
    () => () => {
      for (const id of observed.current.statuses.keys())
        report({ type: "activity", id: `job:${id}`, activity: null });
    },
    [report],
  );
};
