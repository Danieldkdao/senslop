import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { z } from "zod";
import type { ToolSet } from "ai";
import { claudeCode, createAiSdkMcpServer } from "ai-sdk-provider-claude-code";
import { claudeSubscriptionEnvironment } from "../../data/env/server";
import { resolveClaudeExecutable } from "../subscriptions/claude-auth";
import { AiServiceError } from "./errors";

export const createClaudeSubscriptionModel = (
  modelId: string,
  tools: ToolSet,
  maxTurns: number,
  signal?: AbortSignal,
) => {
  const bridgedTools = Object.fromEntries(
    Object.entries(tools).map(([name, definition]) => {
      if (
        !(definition.inputSchema instanceof z.ZodObject) ||
        !definition.execute
      )
        throw new AiServiceError(
          "Claude Code requires executable snapshot tools with object schemas.",
        );
      const schema = definition.inputSchema;
      const execute = definition.execute;
      return [
        name,
        {
          ...definition,
          inputSchema: schema,
          execute: async (input: unknown) => {
            signal?.throwIfAborted();
            // The MCP bridge validates fields; preserve our full object-level invariants as well.
            const parsed = schema.parse(input);
            return execute(parsed as never, {
              toolCallId: randomUUID(),
              messages: [],
              abortSignal: signal,
              context: {},
            });
          },
        },
      ];
    }),
  );
  const allowed = new Set([
    ...Object.keys(tools).map((name) => `mcp__senslop__${name}`),
    "StructuredOutput",
  ]);
  return claudeCode(modelId, {
    cwd: tmpdir(),
    pathToClaudeCodeExecutable: resolveClaudeExecutable(),
    env: { ...claudeSubscriptionEnvironment(), ENABLE_TOOL_SEARCH: "false" },
    tools: [],
    settingSources: [],
    strictMcpConfig: true,
    persistSession: false,
    verbatimPrompts: true,
    maxTurns: Math.max(1, maxTurns),
    mcpServers: Object.keys(tools).length
      ? { senslop: createAiSdkMcpServer("senslop", bridgedTools) }
      : {},
    allowedTools: [...allowed],
    canUseTool: async (name, input) =>
      allowed.has(name)
        ? { behavior: "allow", updatedInput: input }
        : {
            behavior: "deny",
            message:
              "Only Senslop's captured snapshot tools are available for this review.",
          },
  });
};
