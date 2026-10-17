import { expect, test, vi } from "vitest";
import { tool } from "ai";
import { z } from "zod";
import { createClaudeSubscriptionModel } from "../claude-subscription-model";

const captured = vi.hoisted(() => ({
  settings: null as Record<string, unknown> | null,
  tools: null as Record<
    string,
    { execute: (input: unknown) => Promise<unknown> }
  > | null,
}));
vi.mock("ai-sdk-provider-claude-code", () => ({
  createAiSdkMcpServer: (_name: string, tools: typeof captured.tools) => {
    captured.tools = tools;
    return { type: "sdk", name: "senslop" };
  },
  claudeCode: (_model: string, settings: typeof captured.settings) => {
    captured.settings = settings;
    return {
      specificationVersion: "v4",
      provider: "claude-code",
      modelId: "sonnet",
    };
  },
}));
vi.mock("../../subscriptions/claude-auth", () => ({
  resolveClaudeExecutable: () => "/fixture/claude",
}));

test("Claude receives only explicitly bridged snapshot tools and enforces their original argument schema", async () => {
  const execute = vi.fn(async () => "captured source");
  const tools = {
    readSource: tool({
      inputSchema: z
        .object({ start: z.number(), end: z.number() })
        .strict()
        .refine((value) => value.end >= value.start),
      execute,
    }),
  };
  createClaudeSubscriptionModel("sonnet", tools, 8);
  expect(captured.settings).toMatchObject({
    tools: [],
    strictMcpConfig: true,
    settingSources: [],
    persistSession: false,
    maxTurns: 8,
    mcpServers: { senslop: { type: "sdk" } },
  });
  await expect(
    captured.tools!.readSource.execute({ start: 3, end: 1 }),
  ).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
  expect(await captured.tools!.readSource.execute({ start: 1, end: 3 })).toBe(
    "captured source",
  );
  const permission = captured.settings!.canUseTool as (
    name: string,
    input: object,
  ) => Promise<{ behavior: string }>;
  expect((await permission("mcp__senslop__readSource", {})).behavior).toBe(
    "allow",
  );
  expect((await permission("Bash", {})).behavior).toBe("deny");
});
