import { beforeEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { createGroupingAgent, createReviewAgent } from "../analysis-agents";
import { resolveLanguageModel } from "../provider-runtime";
import { generateStructuredAnalysis } from "../structured-analysis";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const answerSchema = z.object({ answer: z.number(), parity: z.string() });
const answer = { answer: 4, parity: "even" };
const generate = async ({
  create = createGroupingAgent,
  provider = "lm-studio",
  content = "",
  reasoning = JSON.stringify(answer),
  finishReason = "stop",
  toolCalls = [],
}: {
  create?: typeof createGroupingAgent;
  provider?: "lm-studio" | "llama-cpp";
  content?: string;
  reasoning?: string;
  finishReason?: string;
  toolCalls?: object[];
} = {}) => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({
      id: "fixture",
      model: "qwen-fixture",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content,
            reasoning_content: reasoning,
            tool_calls: toolCalls,
          },
          finish_reason: finishReason,
        },
      ],
      usage: {
        prompt_tokens: 25,
        completion_tokens: 13,
        total_tokens: 38,
        completion_tokens_details: { reasoning_tokens: 12 },
      },
    }),
  );
  const { model } = resolveLanguageModel(
    {
      provider,
      name: "Fixture",
      baseURL: "https://example.test/v1",
      model: "",
      contextWindow: null,
    },
    null,
    "qwen-fixture",
    fetcher,
  );
  const result = generateStructuredAnalysis({
    agent: create({ model, tools: {}, instructions: "Return JSON only" }),
    schema: answerSchema,
    prompt: "Return answer 4 and parity even",
    signal: new AbortController().signal,
    maxSteps: 1,
    maxOutputTokens: 512,
    providerOptions: {},
    contextWindow: 16384,
    diagnostics: { provider, snapshotId: "fixture" },
    prepareMessages: (messages) => messages,
    onRequest: () => {},
    toolsEnabled: false,
  });
  return { result, fetcher };
};

test.each([
  { name: "grouping", create: createGroupingAgent },
  { name: "review", create: createReviewAgent },
])(
  "recovers LM Studio's misplaced structured JSON for $name without another request",
  async ({ create }) => {
    const { result, fetcher } = await generate({ create });
    await expect(result).resolves.toEqual(answer);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(
      "[senslop:ai-request]",
      expect.objectContaining({ resultSource: "lm-studio-reasoning-json" }),
    );
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(
      JSON.stringify(answer),
    );
  },
);

test.each([
  'PRIVATE_REASONING with an example {"answer":4,"parity":"even"}',
  '{"answer":4',
  '{"answer":"wrong type","parity":"even"}',
])(
  "rejects reasoning that is not a complete valid result: %s",
  async (reasoning) => {
    const { result, fetcher } = await generate({ reasoning });
    await expect(result).rejects.toThrow(/no final answer/);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      reasoning,
    );
  },
);

test("does not replace an existing answer with JSON from reasoning", async () => {
  const { result } = await generate({
    content: JSON.stringify({ answer: 6, parity: "even" }),
  });
  await expect(result).resolves.toEqual({ answer: 6, parity: "even" });
});

test("does not recover reasoning JSON from other providers", async () => {
  const { result } = await generate({ provider: "llama-cpp" });
  await expect(result).rejects.toThrow(/no final answer/);
});

test("does not accept JSON when the server reports output truncation", async () => {
  const { result, fetcher } = await generate({ finishReason: "length" });
  await expect(result).rejects.toThrow(/completion budget/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("does not mistake JSON in a tool step for the final result", async () => {
  const { result } = await generate({
    finishReason: "tool_calls",
    toolCalls: [
      {
        id: "read-1",
        type: "function",
        function: { name: "readSource", arguments: "{}" },
      },
    ],
  });
  await expect(result).rejects.toThrow();
});
