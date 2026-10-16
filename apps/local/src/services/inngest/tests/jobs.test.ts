import { expect, test, vi } from "vitest";
import { APICallError } from "ai";
import { z } from "zod";
import { AiServiceError, formatAiError, isFatalAiError } from "../../ai/errors";
vi.mock("server-only", () => ({}));
vi.mock("../../ai/repository-agent", () => ({
  assignedModel: () => ({ modelId: "model" }),
  createRepositoryAgent: vi.fn(async () => ({
    grouping: async () => ({
      groups: [
        {
          title: "Flow",
          rationale: "why",
          files: [{ path: "a.ts", summary: "change", related: [] }],
        },
      ],
    }),
  })),
}));
vi.mock("../../analysis/frozen-context", () => ({
  loadContext: vi.fn(async () => ({
    sources: {},
    analysis: {},
    limitations: [],
  })),
}));
import { executeJob } from "../jobs";
import { createRepositoryAgent } from "../../ai/repository-agent";
import { defaultAiSettings } from "../../../features/agents/constants";

test("fatal analysis errors log the job correlation and the decision to stop automatic retries", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(createRepositoryAgent).mockResolvedValueOnce({
    grouping: async () => {
      throw new AiServiceError("The model response was not valid JSON.");
    },
  } as never);
  const store = {
    job: () => ({
      id: "job",
      snapshotId: "snapshot",
      hash: "hash",
      kind: "grouping",
      status: "queued",
      settings: defaultAiSettings,
    }),
    snapshot: () => ({ id: "snapshot", hash: "hash" }),
    updateJob: vi.fn(),
    publish: vi.fn(),
    repository: "/repo",
    local: {},
  };
  await expect(
    executeJob(store as never, "job", "run", {
      run: async (_key: string, operation: () => Promise<unknown>) =>
        operation(),
    } as never),
  ).rejects.toMatchObject({ name: "NonRetriableError" });
  expect(warn).toHaveBeenCalledWith(
    "[senslop:analysis-job]",
    expect.objectContaining({
      event: "analysis-failed",
      jobId: "job",
      runId: "run",
      snapshotId: "snapshot",
      fatal: true,
      retryDecision: "stop-automatic-retries",
      errorName: "AiServiceError",
    }),
  );
  expect(createRepositoryAgent).toHaveBeenLastCalledWith(
    expect.objectContaining({
      diagnostics: { jobId: "job", runId: "run" },
    }),
  );
  expect(store.publish).not.toHaveBeenCalled();
});

test("invalid analysis results stop deterministic retries and are not reported as provider failures", async () => {
  const validation = z
    .object({ result: z.string() })
    .safeParse({ result: null });
  if (validation.success) throw new Error("Expected invalid fixture");
  vi.mocked(createRepositoryAgent).mockResolvedValueOnce({
    grouping: async () => {
      throw validation.error;
    },
  } as never);
  const store = {
    job: () => ({
      id: "job",
      snapshotId: "snapshot",
      hash: "hash",
      kind: "grouping",
      status: "queued",
      settings: defaultAiSettings,
    }),
    snapshot: () => ({ id: "snapshot", hash: "hash" }),
    updateJob: vi.fn(),
    publish: vi.fn(),
    repository: "/repo",
    local: {},
  };
  await expect(
    executeJob(store as never, "job", "run", {
      run: async (_key: string, operation: () => Promise<unknown>) =>
        operation(),
    } as never),
  ).rejects.toMatchObject({
    name: "NonRetriableError",
    message: expect.stringMatching(/analysis result.*invalid/i),
  });
  expect(isFatalAiError(validation.error)).toBe(true);
  expect(formatAiError(validation.error)).not.toMatch(
    /provider|result.*null|Zod/,
  );
  expect(store.publish).not.toHaveBeenCalled();
  expect(store.updateJob).not.toHaveBeenCalledWith(
    "job",
    expect.objectContaining({ progress: "Retrying analysis" }),
  );
});

test("durable steps publish once and canceled/deleted work does not call models", async () => {
  const job = {
    id: "job",
    snapshotId: "snapshot",
    kind: "grouping",
    settings: defaultAiSettings,
    status: "queued",
    hash: "hash",
  };
  const store = {
    job: vi.fn(() => job),
    snapshot: vi.fn(() => ({ id: "snapshot", hash: "hash" })),
    updateJob: vi.fn(),
    publish: vi.fn(() => true),
    repository: "/repo",
    local: {},
  };
  const checkpoints = new Map<string, unknown>();
  const run = async (key: string, operation: () => Promise<unknown>) => {
    if (!checkpoints.has(key)) checkpoints.set(key, await operation());
    return checkpoints.get(key);
  };
  await executeJob(store as never, "job", "run", { run } as never);
  await executeJob(store as never, "job", "run", { run } as never);
  expect(createRepositoryAgent).toHaveBeenCalledOnce();
  expect(store.publish).toHaveBeenCalledOnce();
  job.status = "canceled";
  await executeJob(store as never, "job", "run", { run } as never);
  expect(createRepositoryAgent).toHaveBeenCalledOnce();
  job.status = "queued";
  vi.mocked(createRepositoryAgent).mockRejectedValueOnce(
    Object.assign(new Error("Unauthorized"), { statusCode: 401 }),
  );
  await expect(
    executeJob(store as never, "job", "run", {
      run: async (_key: string, operation: () => Promise<unknown>) =>
        operation(),
    } as never),
  ).rejects.toThrow(/credentials/);
});

test("restart publishes a persisted analysis checkpoint without another model call", async () => {
  const result = {
    groups: [
      {
        title: "Flow",
        rationale: "why",
        files: [{ path: "a.ts", summary: "change", related: [] }],
      },
    ],
  };
  const store = {
    job: () => ({
      id: "job",
      snapshotId: "snapshot",
      hash: "hash",
      kind: "grouping",
      status: "queued",
      settings: defaultAiSettings,
      result,
    }),
    snapshot: () => ({ id: "snapshot", hash: "hash" }),
    updateJob: vi.fn(),
    publish: vi.fn(),
    repository: "/repo",
    local: {},
  };
  const calls = vi.mocked(createRepositoryAgent).mock.calls.length;
  await executeJob(store as never, "job", "new-run", {
    run: async (_key: string, operation: () => Promise<unknown>) => operation(),
  } as never);
  expect(createRepositoryAgent).toHaveBeenCalledTimes(calls);
  expect(store.publish).toHaveBeenCalledWith("job", result);
});

test("healthy batches may complete after eight minutes without a job-wide timeout", async () => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
    const abort = new AbortController();
    setTimeout(() => abort.abort(), milliseconds);
    return abort.signal;
  });
  const result = {
    groups: [
      {
        title: "Flow",
        rationale: "why",
        files: [{ path: "a.ts", summary: "change", related: [] }],
      },
    ],
  };
  vi.mocked(createRepositoryAgent).mockImplementationOnce(
    async ({ signal }) =>
      ({
        grouping: async () => {
          for (let batch = 0; batch < 3; batch++) {
            await vi.advanceTimersByTimeAsync(180000);
            signal.throwIfAborted();
          }
          return result;
        },
      }) as never,
  );
  const store = {
    job: () => ({
      id: "job",
      snapshotId: "snapshot",
      hash: "hash",
      kind: "grouping",
      status: "queued",
      settings: defaultAiSettings,
    }),
    snapshot: () => ({ id: "snapshot", hash: "hash" }),
    updateJob: vi.fn(),
    publish: vi.fn(),
    repository: "/repo",
    local: {},
  };
  try {
    await expect(
      executeJob(store as never, "job", "run", {
        run: async (_key: string, operation: () => Promise<unknown>) =>
          operation(),
      } as never),
    ).resolves.toBeUndefined();
    expect(store.publish).toHaveBeenCalledWith("job", result);
  } finally {
    vi.useRealTimers();
  }
});

test("transient provider failures retain safe availability feedback across job error serialization", async () => {
  const providerError = new APICallError({
    message: "TEST_PRIVATE_PROVIDER_OUTPUT",
    url: "https://example.test/v1",
    requestBodyValues: { source: "TEST_PRIVATE_SOURCE" },
    statusCode: 200,
    data: { code: 502 },
  });
  vi.mocked(createRepositoryAgent).mockResolvedValueOnce({
    grouping: async () => {
      throw providerError;
    },
  } as never);
  const store = {
    job: () => ({
      id: "job",
      snapshotId: "snapshot",
      hash: "hash",
      kind: "grouping",
      status: "queued",
      settings: defaultAiSettings,
    }),
    snapshot: () => ({ id: "snapshot", hash: "hash" }),
    updateJob: vi.fn(),
    publish: vi.fn(),
    repository: "/repo",
    local: {},
  };
  const error = await executeJob(store as never, "job", "run", {
    run: async (_key: string, operation: () => Promise<unknown>) => operation(),
  } as never).catch((error) => error);
  expect(error.name).toBe("AiTransientError");
  expect(isFatalAiError(error)).toBe(false);
  expect(JSON.stringify(error)).not.toMatch(/TEST_PRIVATE/);
  const serializedError = Object.assign(new Error(error.message), {
    name: error.name,
  });
  expect(formatAiError(serializedError)).toContain("temporarily unavailable");
  expect(store.updateJob).toHaveBeenCalledWith(
    "job",
    expect.objectContaining({
      progress: "Retrying analysis",
      error: expect.stringContaining("temporarily unavailable"),
    }),
  );
  expect(store.publish).not.toHaveBeenCalled();
});
