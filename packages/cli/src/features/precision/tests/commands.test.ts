import { expect, test, vi } from "vitest";
import { parseCliCommand } from "../../commands/parse-command";
import { executeReviewCommand } from "../../reviews/commands";
import type { WorkspaceClient } from "../../workspace/workspace-client";

const review = {
  id: "11111111-1111-4111-8111-111111111111",
  hash: "a".repeat(64),
  round: 2,
};

test("source requests retain exact review identity and before side", async () => {
  const request = vi.fn(async (path: string) =>
    path.includes("workspace") ? review : { contents: "frozen" },
  );
  const result = await executeReviewCommand(
    { request } as unknown as WorkspaceClient,
    parseCliCommand(["source", "show", review.id, "a.ts", "--side", "before"]),
  );
  expect(result).toEqual({ contents: "frozen" });
  expect(request).toHaveBeenLastCalledWith(
    expect.stringContaining(
      `hash=${review.hash}&round=2&side=before&path=a.ts`,
    ),
  );
});

test("deterministic quality runs need no paid opt-in, while live JSON requires explicit confirmation", async () => {
  const request = vi.fn(async () => ({}));
  const client = { request } as unknown as WorkspaceClient;
  await executeReviewCommand(client, parseCliCommand(["quality", "run"]));
  expect(request).toHaveBeenCalledWith(
    "/api/review-quality",
    {
      mode: "deterministic",
      allowLive: false,
    },
    "POST",
    expect.any(AbortSignal),
  );
  await expect(
    executeReviewCommand(
      client,
      parseCliCommand(["quality", "run", "--live", "--json"]),
    ),
  ).rejects.toThrow(/--yes/);
  await executeReviewCommand(
    client,
    parseCliCommand(["quality", "run", "--live", "--yes", "--json"]),
  );
  expect(request).toHaveBeenLastCalledWith(
    "/api/review-quality",
    {
      mode: "live",
      allowLive: true,
    },
    "POST",
    expect.any(AbortSignal),
  );
});

test("precision writes reject a stale supplied source identity before requesting a mutation", async () => {
  const request = vi.fn(async () => review);
  await expect(
    executeReviewCommand(
      { request } as unknown as WorkspaceClient,
      parseCliCommand([
        "regions",
        "list",
        review.id,
        "--expected-hash",
        "b".repeat(64),
        "--expected-round",
        "2",
      ]),
    ),
  ).rejects.toThrow(/changed/);
  expect(request).toHaveBeenCalledTimes(1);
});

test("live corpus runs support a longer configurable request timeout", async () => {
  const request = vi.fn(async () => ({}));
  const timeout = vi.spyOn(AbortSignal, "timeout");
  try {
    await executeReviewCommand(
      { request } as unknown as WorkspaceClient,
      parseCliCommand([
        "quality",
        "run",
        "--live",
        "--yes",
        "--timeout",
        "1800",
      ]),
    );
    expect(timeout).toHaveBeenLastCalledWith(1800000);
    expect(request).toHaveBeenLastCalledWith(
      "/api/review-quality",
      { mode: "live", allowLive: true },
      "POST",
      expect.any(AbortSignal),
    );
  } finally {
    timeout.mockRestore();
  }
});
