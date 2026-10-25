import { expect, test, vi } from "vitest";
import type { WorkspaceClient } from "../src/features/workspace/workspace-client.js";
import { executeReviewCommand } from "../src/features/reviews/commands.js";
import { parseCliCommand } from "../src/features/commands/parse-command.js";
import { waitForJob } from "../src/features/reviews/jobs.js";

const review = {
  id: "00000000-0000-4000-8000-000000000001",
  hash: "a".repeat(64),
  round: 1,
  title: "Fixture",
  groupingEnabled: true,
  selectedPath: "a.ts",
  completedPaths: [],
  notes: [],
  files: [
    {
      path: "a.ts",
      before: "one\ntwo\n",
      after: "one\nthree\n",
      diff: "patch",
    },
  ],
};
const fixture = () => {
  const request = vi.fn(
    async (path: string, body?: Record<string, unknown>) => {
      if (path.includes("/api/agents"))
        return path.includes("jobId")
          ? {
              id: "job",
              snapshotId: review.id,
              kind: "grouping",
              status: "completed",
              result: { groups: [] },
            }
          : {
              jobs: [
                {
                  id: "job",
                  snapshotId: review.id,
                  hash: review.hash,
                  snapshotRound: 1,
                  kind: "grouping",
                  status: "completed",
                  result: { groups: [] },
                },
              ],
              items: [],
              next: null,
            };
      if (body?.action === "change") return { ...review, ...body };
      return review;
    },
  );
  const client = {
    request,
    info: () => ({
      origin: "http://127.0.0.1:4317",
      repository: "/repo",
      pid: 123,
    }),
    browserUrl: () => "http://127.0.0.1:4317/api/session?token=private",
  } as unknown as WorkspaceClient;
  return { request, client };
};

test.each(["create", "sync"])(
  "%s forwards high priority to optional correctness analysis",
  async (operation) => {
    const { request, client } = fixture();
    await executeReviewCommand(
      client,
      parseCliCommand([
        "reviews",
        operation,
        ...(operation === "create" ? ["--working-tree"] : [review.id]),
        "--run-review",
        "--priority",
        "high",
      ]),
      vi.fn(),
    );
    expect(request).toHaveBeenCalledWith(
      "/api/agents",
      expect.objectContaining({
        action: "job",
        snapshotId: review.id,
        kind: "review",
        expectedHash: review.hash,
        expectedRound: review.round,
        priority: "high",
      }),
    );
  },
);

test("the agent handoff uses the shared workspace API, waits for matching grouping and returns a safe browser URL", async () => {
  const { request, client } = fixture();
  const open = vi.fn();
  const result = await executeReviewCommand(
    client,
    parseCliCommand([
      "reviews",
      "create",
      "--working-tree",
      "--group",
      "--wait",
      "--open",
      "--json",
    ]),
    open,
  );
  expect(request).toHaveBeenCalledWith(
    "/api/workspace",
    expect.objectContaining({
      action: "inspect",
      source: { kind: "working-tree" },
      grouping: true,
      activate: true,
      directory: expect.any(String),
    }),
  );
  expect(open).toHaveBeenCalledWith(client.browserUrl());
  expect(result).toMatchObject({
    id: review.id,
    url: `http://127.0.0.1:4317/?review=${review.id}`,
    preparation: { grouping: { status: "completed" } },
  });
  expect(JSON.stringify(result)).not.toContain("private");
});

test("show and diff read a saved snapshot without activating it", async () => {
  const { request, client } = fixture();
  expect(
    await executeReviewCommand(
      client,
      parseCliCommand([
        "reviews",
        "diff",
        review.id,
        "--file",
        "a.ts",
        "--side",
        "before",
      ]),
    ),
  ).toBe("one\ntwo\n");
  expect(request).toHaveBeenCalledExactlyOnceWith(
    `/api/workspace?id=${review.id}`,
  );
});

test("line comments use exact frozen source and file completion is an explicit assignment", async () => {
  const { request, client } = fixture();
  await executeReviewCommand(
    client,
    parseCliCommand([
      "notes",
      "add",
      review.id,
      "a.ts",
      "--body",
      "Check this",
      "--side",
      "after",
      "--start",
      "2",
    ]),
  );
  expect(request).toHaveBeenLastCalledWith(
    "/api/workspace",
    expect.objectContaining({
      expectedHash: review.hash,
      expectedRound: 1,
      change: expect.objectContaining({
        action: "add-note",
        note: expect.objectContaining({
          path: "a.ts",
          line: {
            side: "additions",
            lineNumber: 2,
            endLineNumber: 2,
            code: "three",
          },
        }),
      }),
    }),
  );
  await executeReviewCommand(
    client,
    parseCliCommand(["reviews", "complete", review.id, "a.ts"]),
  );
  expect(request).toHaveBeenLastCalledWith(
    "/api/workspace",
    expect.objectContaining({
      change: { action: "complete", path: "a.ts", complete: true },
    }),
  );
});

test("select explicitly activates the requested saved review after selecting its file", async () => {
  const { request, client } = fixture();
  await executeReviewCommand(
    client,
    parseCliCommand(["reviews", "select", review.id, "a.ts"]),
  );
  expect(request).toHaveBeenNthCalledWith(
    2,
    "/api/workspace",
    expect.objectContaining({
      change: { action: "select", path: "a.ts" },
    }),
  );
  expect(request).toHaveBeenLastCalledWith("/api/workspace", {
    action: "open",
    id: review.id,
  });
});

test("failed or canceled analysis is not reported as a successful handoff", async () => {
  const { client } = fixture();
  vi.spyOn(client, "request").mockResolvedValue({
    id: "job",
    status: "failed",
    error: "Model unavailable",
  });
  await expect(
    executeReviewCommand(client, parseCliCommand(["runs", "watch", "job"])),
  ).rejects.toMatchObject({ exitCode: 4 });
});

test("watch bounds an unresponsive status request by the requested timeout", async () => {
  const { client } = fixture();
  vi.spyOn(client, "request").mockImplementation(
    async (_path, _body, _method, signal) => {
      if (!signal) throw new Error("Status request is missing its timeout");
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    },
  );
  await expect(waitForJob(client, "job", 1)).rejects.toMatchObject({
    exitCode: 5,
    code: "timeout",
    details: { jobId: "job" },
  });
});

test("background creation returns explicit revision and job identities without waiting or opening", async () => {
  const { request, client } = fixture();
  const open = vi.fn();
  const result = await executeReviewCommand(
    client,
    parseCliCommand(["reviews", "create", "--working-tree"]),
    open,
  );
  expect(open).not.toHaveBeenCalled();
  expect(request).toHaveBeenCalledWith(
    "/api/workspace",
    expect.objectContaining({ activate: false, directory: expect.any(String) }),
  );
  expect(request.mock.calls.some(([path]) => path.includes("jobId="))).toBe(
    false,
  );
  expect(result).toMatchObject({
    id: review.id,
    round: review.round,
    hash: review.hash,
    jobIds: ["job"],
  });
});

test("the first review opens automatically and --open targets the requested review", async () => {
  const { client } = fixture();
  vi.spyOn(client, "request").mockResolvedValue({
    ...review,
    groupingEnabled: false,
    activated: true,
  });
  const open = vi.fn();
  await executeReviewCommand(
    client,
    parseCliCommand(["reviews", "create", "--working-tree"]),
    open,
  );
  expect(open).toHaveBeenCalledWith(client.browserUrl(review.id));
});

test("re-sync carries the revision read before another client can change it", async () => {
  const { request, client } = fixture();
  await executeReviewCommand(
    client,
    parseCliCommand(["reviews", "sync", review.id]),
  );
  expect(request).toHaveBeenCalledWith(
    "/api/workspace",
    expect.objectContaining({
      action: "resync",
      id: review.id,
      expectedHash: review.hash,
      expectedRound: review.round,
      activate: false,
    }),
  );
});

test("a retained revision expectation fails before a stale automation command writes", async () => {
  const { request, client } = fixture();
  await expect(
    executeReviewCommand(
      client,
      parseCliCommand([
        "reviews",
        "complete",
        review.id,
        "a.ts",
        "--expected-hash",
        "stale",
        "--expected-round",
        "1",
      ]),
    ),
  ).rejects.toMatchObject({ code: "review_conflict" });
  expect(request).toHaveBeenCalledTimes(1);
});

test("retry uses the original job identity rather than resolving shared current", async () => {
  const { request, client } = fixture();
  await executeReviewCommand(client, parseCliCommand(["runs", "retry", "job"]));
  expect(request).toHaveBeenLastCalledWith("/api/agents", {
    action: "retry",
    id: "job",
  });
});
