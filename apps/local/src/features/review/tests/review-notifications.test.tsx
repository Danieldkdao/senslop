// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useReviewReadyToast } from "../hooks/use-review-ready-toast";
import type { JobSchema } from "../../agents/schemas";

const feedback = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: feedback }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const job = (
  status: JobSchema["status"],
  kind: JobSchema["kind"] = "grouping",
) =>
  ({
    id: "job",
    hash: "hash",
    kind,
    status,
    error: status === "failed" ? "Invalid output" : null,
  }) as JobSchema;
const initial = () => ({
  snapshotId: "snapshot",
  hash: "hash",
  ready: false,
  jobs: [] as JobSchema[],
  operation: null as {
    snapshotId: string;
    hash: string;
    mode: "inspect" | "new" | "keep";
  } | null,
  onHandled: vi.fn(),
});

test.each(["grouping", "review"] as const)(
  "loading a saved %s result stays quiet",
  (kind) => {
    const props = { ...initial(), ready: true, jobs: [job("completed", kind)] };
    const mounted = renderHook(useReviewReadyToast, { initialProps: props });
    mounted.unmount();
    renderHook(useReviewReadyToast, { initialProps: props });
    expect(feedback.success).not.toHaveBeenCalled();
    expect(feedback.error).not.toHaveBeenCalled();
  },
);

test("a new ungrouped action announces once after its files are displayed", () => {
  const props = initial();
  const mounted = renderHook(useReviewReadyToast, { initialProps: props });
  props.operation = { snapshotId: "snapshot", hash: "hash", mode: "keep" };
  mounted.rerender({ ...props });
  expect(feedback.success).not.toHaveBeenCalled();
  mounted.rerender({ ...props, ready: true });
  expect(feedback.success).toHaveBeenCalledWith(
    expect.stringMatching(/updated/i),
  );
  mounted.rerender({ ...props, ready: true });
  expect(feedback.success).toHaveBeenCalledTimes(1);
  expect(props.onHandled).toHaveBeenCalledTimes(1);
});

test("grouping completion waits for rendered groups and never announces on a failed run", () => {
  const props = { ...initial(), jobs: [job("running")] };
  const mounted = renderHook(useReviewReadyToast, { initialProps: props });
  mounted.rerender({ ...props, jobs: [job("failed")] });
  expect(feedback.error).toHaveBeenCalledWith(
    expect.stringMatching(/Grouping failed.*Invalid output/),
  );
  expect(feedback.success).not.toHaveBeenCalled();
  const retry = { ...job("running"), id: "retry" };
  mounted.rerender({ ...props, jobs: [retry, job("failed")] });
  mounted.rerender({
    ...props,
    jobs: [{ ...retry, status: "completed" }, job("failed")],
  });
  expect(feedback.success).not.toHaveBeenCalled();
  mounted.rerender({
    ...props,
    ready: true,
    jobs: [{ ...retry, status: "completed" }, job("failed")],
  });
  expect(feedback.success).toHaveBeenCalledWith(
    expect.stringMatching(/Grouping finished/),
  );
  expect(feedback.success).toHaveBeenCalledTimes(1);
});

test("review completion and failure use their actual terminal outcome", () => {
  const props = { ...initial(), ready: true, jobs: [job("running", "review")] };
  const mounted = renderHook(useReviewReadyToast, { initialProps: props });
  mounted.rerender({ ...props, jobs: [job("completed", "review")] });
  expect(feedback.success).toHaveBeenCalledWith("Review analysis finished.");
  const retry = { ...job("running", "review"), id: "retry" };
  mounted.rerender({ ...props, jobs: [retry] });
  mounted.rerender({
    ...props,
    jobs: [{ ...retry, status: "failed", error: "Provider unavailable" }],
  });
  expect(feedback.error).toHaveBeenCalledWith(
    "Review analysis failed: Provider unavailable",
  );
  expect(feedback.success).toHaveBeenCalledTimes(1);
});

test("old content jobs and canceled runs never announce success", () => {
  const props = { ...initial(), jobs: [job("running")] };
  const mounted = renderHook(useReviewReadyToast, { initialProps: props });
  mounted.rerender({ ...props, jobs: [job("canceled")], ready: true });
  mounted.rerender({
    ...props,
    hash: "new-hash",
    jobs: [job("completed")],
    ready: true,
  });
  expect(feedback.success).not.toHaveBeenCalled();
});

test("a user-started job that finishes before the first poll still announces its outcome once", () => {
  const props = {
    ...initial(),
    ready: true,
    requestedJobs: ["job"],
    jobs: [job("completed", "review")],
  };
  const mounted = renderHook(useReviewReadyToast, { initialProps: props });
  mounted.rerender({ ...props });
  expect(feedback.success).toHaveBeenCalledTimes(1);
});

test("a grouped re-sync that fails before the first poll reports an error without ready feedback", () => {
  const props = {
    ...initial(),
    jobs: [job("failed")],
    operation: { snapshotId: "snapshot", hash: "hash", mode: "keep" as const },
  };
  const mounted = renderHook(useReviewReadyToast, { initialProps: props });
  mounted.rerender({ ...props });
  expect(feedback.error).toHaveBeenCalledTimes(1);
  expect(feedback.success).not.toHaveBeenCalled();
  expect(props.onHandled).toHaveBeenCalledTimes(1);
});

test("returning to a review does not replay a completed user-started job", () => {
  const props = {
    ...initial(),
    ready: true,
    requestedJobs: ["job"],
    jobs: [job("completed", "review")],
  };
  const mounted = renderHook(useReviewReadyToast, { initialProps: props });
  mounted.rerender({ ...props, snapshotId: "other", hash: "other", jobs: [] });
  mounted.rerender({ ...props });
  expect(feedback.success).toHaveBeenCalledTimes(1);
});
