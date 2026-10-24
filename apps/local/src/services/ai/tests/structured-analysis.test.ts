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
