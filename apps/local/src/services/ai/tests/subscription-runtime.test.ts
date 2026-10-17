import { expect, test, vi } from "vitest";
import { generateText, isStepCount, Output, tool } from "ai";
import { z } from "zod";
import { resolveLanguageModel } from "../provider-runtime";

vi.mock("server-only", () => ({}));

const events = (complete = true) => {
  const text = '{"answer":"valid"}';
  const values = [
    {
      type: "response.created",
      response: { id: "resp_fixture", created_at: 1, model: "gpt-6-luna" },
    },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        type: "message",
        id: "msg_fixture",
        role: "assistant",
        content: [],
        status: "in_progress",
      },
    },
    {
      type: "response.output_text.delta",
      item_id: "msg_fixture",
      output_index: 0,
      content_index: 0,
      delta: text,
    },
    {
      type: "response.output_item.done",
      output_index: 0,
      item: {
        type: "message",
        id: "msg_fixture",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
        status: "completed",
      },
    },
    ...(complete
      ? [
          {
            type: "response.completed",
            response: {
              id: "resp_fixture",
              model: "gpt-6-luna",
              created_at: 1,
              status: "completed",
              output: [],
              usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
            },
          },
        ]
      : []),
  ];
  return new Response(
    values.map((value) => `data: ${JSON.stringify(value)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
};

test("ChatGPT subscription generation uses streaming transport, namespaces, developer instructions, and no unsupported output cap", async () => {
  let captured: Record<string, unknown> | undefined;
  const fetcher: typeof fetch = async (url, init) => {
    expect(String(url)).toBe("https://api.openai.com/v1/responses");
    captured = JSON.parse(String(init?.body));
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer private-access",
    );
    return events();
  };
  const runtime = resolveLanguageModel(
    {
      provider: "chatgpt-subscription",
      name: "ChatGPT",
      baseURL: "https://api.openai.com/v1",
      contextWindow: null,
      model: "",
    },
    "private-access",
    "gpt-6-luna",
    fetcher,
  );
  const result = await generateText({
    ...runtime,
    instructions: "Frozen source only",
    prompt: "Review",
    maxOutputTokens: 1000,
    tools: {
      readSource: tool({
        description: "Read frozen source",
        inputSchema: z.object({ path: z.string() }),
        execute: async () => "frozen",
      }),
    },
    output: Output.object({ schema: z.object({ answer: z.string() }) }),
  });
  expect(result.output).toEqual({ answer: "valid" });
  expect(captured).toMatchObject({
    stream: true,
    store: false,
    tools: [{ type: "namespace", name: "senslop" }],
  });
  expect(captured).not.toHaveProperty("max_output_tokens");
  expect(JSON.stringify(captured?.input)).not.toContain('"role":"system"');
});

test("a truncated ChatGPT stream cannot be accepted as a completed review", async () => {
  const runtime = resolveLanguageModel(
    {
      provider: "chatgpt-subscription",
      name: "ChatGPT",
      baseURL: "https://api.openai.com/v1",
      contextWindow: null,
      model: "",
    },
    "private-access",
    "gpt-6-luna",
    async () => events(false),
  );
  await expect(
    generateText({ ...runtime, prompt: "Review", maxRetries: 0 }),
  ).rejects.toThrow(/complet|interrupt/i);
});

test("ChatGPT executes a namespaced snapshot tool and sends its result on the next streaming request", async () => {
  const execute = vi.fn(async () => "frozen source");
  let calls = 0;
  const runtime = resolveLanguageModel(
    {
      provider: "chatgpt-subscription",
      name: "ChatGPT",
      baseURL: "https://api.openai.com/v1",
      contextWindow: null,
      model: "",
    },
    "private-access",
    "gpt-6-luna",
    async (_url, init) => {
      calls++;
      if (calls > 1) {
        const body = JSON.parse(String(init?.body));
        expect(body.input).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "function_call",
              name: "readSource",
              namespace: "senslop",
              call_id: "call_fixture",
            }),
            expect.objectContaining({
              type: "function_call_output",
              call_id: "call_fixture",
              output: "frozen source",
            }),
          ]),
        );
        return events();
      }
      const item = {
        type: "function_call",
        id: "fc_fixture",
        name: "readSource",
        namespace: "senslop",
        call_id: "call_fixture",
        arguments: '{"path":"sample.ts"}',
        status: "completed",
      };
      const values = [
        {
          type: "response.created",
          response: { id: "resp_tool", created_at: 1, model: "gpt-6-luna" },
        },
        {
          type: "response.output_item.added",
          output_index: 0,
          item: { ...item, arguments: "", status: "in_progress" },
        },
        {
          type: "response.function_call_arguments.delta",
          item_id: item.id,
          output_index: 0,
          delta: item.arguments,
        },
        { type: "response.output_item.done", output_index: 0, item },
        {
          type: "response.completed",
          response: {
            id: "resp_tool",
            model: "gpt-6-luna",
            created_at: 1,
            status: "completed",
            output: [item],
            usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
          },
        },
      ];
      return new Response(
        values.map((value) => `data: ${JSON.stringify(value)}\n\n`).join(""),
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  );
  const result = await generateText({
    ...runtime,
    prompt: "Read sample.ts",
    tools: {
      readSource: tool({
        inputSchema: z.object({ path: z.string() }),
        execute,
      }),
    },
    stopWhen: isStepCount(3),
    maxRetries: 0,
  });
  expect(execute).toHaveBeenCalledOnce();
  expect(calls).toBe(2);
  expect(result.text).toContain("valid");
});
