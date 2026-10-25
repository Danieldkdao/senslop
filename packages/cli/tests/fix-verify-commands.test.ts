import { expect, test, vi } from "vitest";
import { parseCliCommand } from "../src/features/commands/parse-command";
import { executeReviewCommand } from "../src/features/reviews/commands";
import type { WorkspaceClient } from "../src/features/workspace/workspace-client";
import { CliError } from "../src/features/commands/errors";

const review = {
  id: "11111111-1111-4111-8111-111111111111",
  hash: "a".repeat(64),
  round: 2,
};

test.each(["failed", "blocked", "canceled", "timed-out", "interrupted"])(
  "watching an unsuccessful check reports a nonzero CLI exit: %s",
  async (status) => {
    const client = {
      request: vi.fn(async () => ({
        id: "check",
        review,
        status,
        error: null,
      })),
    } as unknown as WorkspaceClient;
    const operation = executeReviewCommand(
      client,
      parseCliCommand(["checks", "watch", "check"]),
    );
    await expect(operation).rejects.toBeInstanceOf(CliError);
    await expect(operation).rejects.toMatchObject({
      code: "check_failed",
      exitCode: 4,
      details: { checkId: "check", status },
    });
  },
);

test("watching a passed check succeeds", async () => {
  const run = { id: "check", review, status: "passed" };
  const client = {
    request: vi.fn(async () => run),
  } as unknown as WorkspaceClient;
  expect(
    await executeReviewCommand(
      client,
      parseCliCommand(["checks", "watch", "check"]),
    ),
  ).toEqual(run);
});

test("finding decisions retain an explicit review revision and omit an optional reason", async () => {
  const request = vi.fn(async (path: string) =>
    path.includes("workspace") ? review : { findings: [] },
  );
  const client = { request } as unknown as WorkspaceClient;
  await executeReviewCommand(
    client,
    parseCliCommand([
      "findings",
      "decide",
      review.id,
      "22222222-2222-4222-8222-222222222222",
      "--status",
      "dismissed",
    ]),
  );
  expect(request).toHaveBeenLastCalledWith("/api/workflow", {
    review,
    operation: {
      action: "decision",
      findingId: "22222222-2222-4222-8222-222222222222",
      decision: "dismissed",
    },
  });
});
test("task claims use the task's captured review rather than shared current", async () => {
  const request = vi.fn(async () => ({
    task: { id: "task", review },
    prompt: "handoff",
  }));
  const client = { request } as unknown as WorkspaceClient;
  await executeReviewCommand(
    client,
    parseCliCommand(["tasks", "claim", "task", "--agent-name", "Fixture"]),
  );
  expect(request).toHaveBeenLastCalledWith("/api/workflow", {
    review,
    operation: { action: "claim-task", taskId: "task", agent: "Fixture" },
  });
});

test("verification selects explicit findings without requiring a manual note", async () => {
  const request = vi.fn(async (path: string) =>
    path.includes("workspace") ? review : { findings: [] },
  );
  await executeReviewCommand(
    { request } as unknown as WorkspaceClient,
    parseCliCommand([
      "findings",
      "verify",
      review.id,
      "--findings",
      "22222222-2222-4222-8222-222222222222",
    ]),
  );
  expect(request).toHaveBeenLastCalledWith("/api/workflow", {
    review,
    operation: {
      action: "verify-findings",
      findingIds: ["22222222-2222-4222-8222-222222222222"],
    },
  });
});

test("verification history routes through the workflow command handler", async () => {
  const request = vi.fn(async (path: string) =>
    path.includes("workspace")
      ? review
      : { verifications: [{ id: "verification" }] },
  );
  expect(
    await executeReviewCommand(
      { request } as unknown as WorkspaceClient,
      parseCliCommand(["verifications", "list", review.id]),
    ),
  ).toEqual([{ id: "verification" }]);
});
