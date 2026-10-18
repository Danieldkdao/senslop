import { expect, test, vi } from "vitest";
import { createClaudeSubscriptionDriver } from "../claude-auth";

test("Claude login waits for official authentication and rejects API billing and free accounts", async () => {
  const command = vi.fn(async (args: string[]) =>
    args[1] === "login"
      ? ""
      : JSON.stringify({
          loggedIn: true,
          authMethod: "claude.ai",
          email: "reviewer@example.com",
          subscriptionType: "max",
        }),
  );
  const metadata = vi.fn(async () => [
    { id: "sonnet", name: "Claude Sonnet", available: true },
  ]);
  const driver = createClaudeSubscriptionDriver({ command, metadata });
  expect(await driver.signIn(new AbortController().signal)).toEqual({
    email: "reviewer@example.com",
    subject: "reviewer@example.com",
    plan: "max",
  });
  expect(command.mock.calls.map(([args]) => args)).toEqual([
    ["auth", "login"],
    ["auth", "status"],
  ]);
  expect(await driver.models(new AbortController().signal)).toHaveLength(1);
  command.mockResolvedValue(
    JSON.stringify({
      loggedIn: true,
      authMethod: "api_key",
      email: "reviewer@example.com",
    }),
  );
  await expect(driver.account(new AbortController().signal)).rejects.toThrow(
    /subscription/i,
  );
  command.mockResolvedValue(
    JSON.stringify({
      loggedIn: true,
      authMethod: "claude.ai",
      email: "reviewer@example.com",
      subscriptionType: "free",
    }),
  );
  await expect(driver.account(new AbortController().signal)).rejects.toThrow(
    /subscription/i,
  );
});

test("Claude metadata is not replaced by an invented model catalog when unavailable", async () => {
  const driver = createClaudeSubscriptionDriver({
    command: async () => "{}",
    metadata: async () => {
      throw new Error("unavailable");
    },
  });
  await expect(driver.models(new AbortController().signal)).rejects.toThrow(
    "unavailable",
  );
});
