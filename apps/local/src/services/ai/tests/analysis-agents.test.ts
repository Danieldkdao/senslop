import { expect, test } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { tool, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createGroupingAgent, createReviewAgent } from "../analysis-agents";

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};
const schema = z.object({ answer: z.string() });

test("grouping and reviewing agents have distinct identities and request structured final outputs", async () => {
  for (const create of [createGroupingAgent, createReviewAgent]) {
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: "text", text: '{"answer":"valid"}' }],
        finishReason: { unified: "stop", raw: "stop" },
        usage,
        warnings: [],
      },
    });
    const agent = create({
      model,
      instructions: "Frozen snapshot only",
      tools: {},
    });
    expect(agent.id).toBe(
      create === createGroupingAgent ? "senslop-grouping" : "senslop-review",
    );
    const result = await agent.generate({
      prompt: "Analyze",
      options: {
        schema,
        maxSteps: 1,
        maxOutputTokens: 1000,
        toolsEnabled: false,
      },
    });
    expect(result.output).toEqual({ answer: "valid" });
    expect(model.doGenerateCalls[0]!.responseFormat).toMatchObject({
      type: "json",
      schema: { type: "object" },
    });
    expect(model.doGenerateCalls[0]!.tools ?? []).toEqual([]);
  }
});

test("an agent can explore automatically then produce JSON without a submission tool", async () => {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content:
        ++calls === 1
          ? [
              {
                type: "tool-call",
                toolName: "read",
                toolCallId: "read-1",
                input: "{}",
              },
            ]
          : [{ type: "text", text: '{"answer":"from evidence"}' }],
      finishReason: {
        unified: calls === 1 ? "tool-calls" : "stop",
        raw: calls === 1 ? "tool_calls" : "stop",
      },
      usage,
      warnings: [],
    }),
  });
  const agent = createReviewAgent({
    model,
    instructions: "Review",
    tools: {
      read: tool({
        inputSchema: z.object({}),
        execute: async () => ({ source: "frozen" }),
      }),
    },
  });
  const result = await agent.generate({
    prompt: "Analyze",
    options: { schema, maxSteps: 2, maxOutputTokens: 1000, toolsEnabled: true },
  });
  expect(result.output).toEqual({ answer: "from evidence" });
  expect(model.doGenerateCalls[0]!.toolChoice).toEqual({ type: "auto" });
  expect(model.doGenerateCalls[1]!.tools ?? []).toEqual([]);
  expect(model.doGenerateCalls[1]!.toolChoice).toEqual({ type: "none" });
});

test("structured-output schema failures retain the generated candidate and validation cause", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: '{"answer":42}' }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    },
  });
  const agent = createGroupingAgent({
    model,
    instructions: "Group",
    tools: {},
  });
  const error = await agent
    .generate({
      prompt: "Analyze",
      options: {
        schema,
        maxSteps: 1,
        maxOutputTokens: 1000,
        toolsEnabled: false,
      },
    })
    .catch((error: unknown) => error);
  expect(NoObjectGeneratedError.isInstance(error)).toBe(true);
  expect(error).toMatchObject({
    text: '{"answer":42}',
    cause: expect.any(Error),
  });
});

test("each call includes its exact output contract for providers that expose only JSON mode", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: '{"answer":"valid"}' }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    },
  });
  const agent = createGroupingAgent({
    model,
    instructions: "Frozen snapshot only",
    tools: {},
  });
  await agent.generate({
    prompt: "Analyze",
    options: {
      schema,
      maxSteps: 1,
      maxOutputTokens: 1000,
      toolsEnabled: false,
    },
  });
  expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain(
    "Required final JSON schema",
  );
  expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain("answer");
  expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).not.toContain(
    "rationale",
  );
});

test("the final structured step reserves its completion budget for the answer", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: '{"answer":"valid"}' }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    },
  });
  await createGroupingAgent({ model, tools: {} }).generate({
    prompt: "Order prepared files",
    options: {
      schema,
      maxSteps: 1,
      maxOutputTokens: 16000,
      toolsEnabled: false,
    },
  });
  expect(model.doGenerateCalls[0]!.reasoning).toBe("none");
});
