// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useWorkspaceBuddy } from "../hooks/use-workspace-buddy";
import type { JobSchema, GroupingSchema } from "../../agents/schemas";
import type { LivePreview } from "../../review/types";

const report = vi.hoisted(() => vi.fn());
vi.mock("../components/buddy-provider", () => ({ useBuddy: () => report }));
afterEach(() => {
  cleanup();
  report.mockReset();
});
const preview = {
  id: "snapshot",
  hash: "hash",
  round: 1,
  files: [{ path: "one.ts" }, { path: "two.ts" }],
  completedPaths: [],
} as unknown as LivePreview;
const job = (
  status: JobSchema["status"],
  kind: JobSchema["kind"] = "grouping",
) =>
  ({
    id: "job",
    snapshotId: "snapshot",
    hash: "hash",
    snapshotRound: 1,
    status,
    kind,
    generation: 1,
    updatedAt: status,
    createdAt: "2026-10-17T10:00:00.000Z",
    result: null,
  }) as unknown as JobSchema;

test("saved terminal jobs never replay but observed grouping success celebrates exactly once", () => {
  const { rerender } = renderHook(
    ({ jobs }) =>
      useWorkspaceBuddy({ preview, jobs, grouping: null, error: null }),
    { initialProps: { jobs: [job("completed")] } },
  );
  expect(
    report.mock.calls.filter(([event]) => event.type === "reaction"),
  ).toHaveLength(0);
  rerender({ jobs: [job("running")] });
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({ type: "activity", activity: "grouping" }),
  );
  rerender({ jobs: [job("completed")] });
  rerender({ jobs: [job("completed")] });
  expect(
    report.mock.calls.filter(
      ([event]) => event.type === "reaction" && event.mood === "celebrate",
    ),
  ).toHaveLength(1);
});

test("failures cry, a retry recovers, and cancellation stays calm", () => {
  const { rerender } = renderHook(
    ({ jobs }) =>
      useWorkspaceBuddy({ preview, jobs, grouping: null, error: null }),
    { initialProps: { jobs: [job("running")] } },
  );
  rerender({ jobs: [job("failed")] });
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({ type: "reaction", mood: "cry" }),
  );
  rerender({ jobs: [job("running")] });
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({ type: "reaction", mood: "retry" }),
  );
  report.mockClear();
  rerender({ jobs: [job("canceled")] });
  expect(report.mock.calls.some(([event]) => event.type === "reaction")).toBe(
    false,
  );
});

test("initial history arriving after loading stays quiet but a fast new terminal job reacts", () => {
  const { rerender } = renderHook(
    ({ jobs, loaded }) =>
      useWorkspaceBuddy({
        preview,
        jobs,
        jobsLoaded: loaded,
        grouping: null,
        error: null,
      }),
    { initialProps: { jobs: [] as JobSchema[], loaded: false } },
  );
  rerender({ jobs: [job("completed")], loaded: true });
  expect(report.mock.calls.some(([event]) => event.type === "reaction")).toBe(
    false,
  );
  rerender({
    jobs: [
      {
        ...job("completed"),
        id: "fast-job",
        createdAt: "2026-10-17T10:00:01.000Z",
      },
      job("completed"),
    ],
    loaded: true,
  });
  expect(
    report.mock.calls.filter(
      ([event]) => event.type === "reaction" && event.mood === "celebrate",
    ),
  ).toHaveLength(1);
});

test("a fresh job after an earlier failed attempt gets a recovery reaction", () => {
  const { rerender } = renderHook(
    ({ jobs }) =>
      useWorkspaceBuddy({ preview, jobs, grouping: null, error: null }),
    { initialProps: { jobs: [job("failed")] } },
  );
  rerender({ jobs: [{ ...job("running"), id: "retry-job" }, job("failed")] });
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({ type: "reaction", mood: "retry" }),
  );
});

test("older jobs entering a bounded history after deletion cannot replay celebrations", () => {
  const { rerender } = renderHook(
    ({ jobs }) =>
      useWorkspaceBuddy({ preview, jobs, grouping: null, error: null }),
    { initialProps: { jobs: [job("completed")] } },
  );
  rerender({
    jobs: [
      {
        ...job("completed"),
        id: "older-job",
        createdAt: "2026-10-17T09:00:00.000Z",
      },
    ],
  });
  expect(report.mock.calls.some(([event]) => event.type === "reaction")).toBe(
    false,
  );
});

test("a review with findings gets an attentive results-ready pose and stale rounds cannot celebrate", () => {
  const { rerender } = renderHook(
    ({ jobs }) =>
      useWorkspaceBuddy({ preview, jobs, grouping: null, error: null }),
    { initialProps: { jobs: [job("running", "review")] } },
  );
  rerender({
    jobs: [
      {
        ...job("completed", "review"),
        result: { findings: [{ title: "Bug" }] } as JobSchema["result"],
      },
    ],
  });
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "reaction",
      mood: "proud",
      message: expect.stringMatching(/findings/i),
    }),
  );
  report.mockClear();
  rerender({ jobs: [{ ...job("completed"), snapshotRound: 2 }] });
  expect(report.mock.calls.some(([event]) => event.type === "reaction")).toBe(
    false,
  );
});

test("file, group, and entire-review milestones only follow newly saved completion", () => {
  const grouping: GroupingSchema = {
    groups: [
      {
        title: "First group",
        rationale: "",
        files: [{ path: "one.ts", summary: "One", related: [] }],
      },
      {
        title: "Second group",
        rationale: "",
        files: [{ path: "two.ts", summary: "Two", related: [] }],
      },
    ],
  };
  const { rerender } = renderHook(
    ({ snapshot }) =>
      useWorkspaceBuddy({ preview: snapshot, jobs: [], grouping, error: null }),
    { initialProps: { snapshot: preview } },
  );
  rerender({ snapshot: { ...preview, completedPaths: ["one.ts"] } });
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "reaction",
      mood: "celebrate",
      message: expect.stringContaining("First group"),
    }),
  );
  rerender({ snapshot: { ...preview, completedPaths: ["one.ts", "two.ts"] } });
  expect(report).toHaveBeenCalledWith(
    expect.objectContaining({ type: "reaction", mood: "dance" }),
  );
  report.mockClear();
  rerender({
    snapshot: {
      ...preview,
      id: "another",
      completedPaths: ["one.ts", "two.ts"],
    },
  });
  expect(report.mock.calls.some(([event]) => event.type === "reaction")).toBe(
    false,
  );
});
