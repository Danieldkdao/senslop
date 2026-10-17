import { expect, test } from "vitest";
import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, streamText, type UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { agentStreamResponse } from "../stream-response";

const result = (fail = false) =>
  streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "reasoning-start", id: "reason" });
            controller.enqueue({
              type: "reasoning-delta",
              id: "reason",
              delta: "Checking the relevant source",
            });
            controller.enqueue({ type: "reasoning-end", id: "reason" });
            controller.enqueue({ type: "text-start", id: "text" });
            controller.enqueue({
              type: "text-delta",
              id: "text",
              delta: fail ? "partial" : "hello world",
            });
            if (fail)
              controller.enqueue({
                type: "error",
                error: new Error("provider disconnected"),
              });
            else {
              controller.enqueue({ type: "text-end", id: "text" });
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: {
                  inputTokens: {
                    total: 1,
                    noCache: 1,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  outputTokens: { total: 2, text: 2, reasoning: 0 },
                },
              });
            }
            controller.close();
          },
        }),
      }),
    }),
    prompt: "Explain",
    onError: () => {},
  });

test("SDK React Chat consumes the native response and completion persists a UI message", async () => {
  const saved: { message: UIMessage; status: string }[] = [];
  const response = agentStreamResponse(
    result().stream,
    new AbortController(),
    async (message, status) => {
      saved.push({ message, status });
    },
  );
  expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
  const chat = new Chat({
    transport: new DefaultChatTransport({ fetch: async () => response }),
  });
  await chat.sendMessage({ text: "Explain" });
  expect(chat.status).toBe("ready");
  expect(chat.messages.at(-1)?.parts).toContainEqual(
    expect.objectContaining({ type: "text", text: "hello world" }),
  );
  expect(saved).toHaveLength(1);
  expect(saved[0]?.status).toBe("complete");
  expect(saved[0]?.message.id).toBe(chat.messages.at(-1)?.id);
  expect(chat.messages.at(-1)?.parts).toContainEqual(
    expect.objectContaining({
      type: "reasoning",
      text: "Checking the relevant source",
    }),
  );
  expect(saved[0]?.message.metadata).toMatchObject({
    createdAt: expect.any(String),
    thinkingDurationMs: expect.any(Number),
  });
});

test("provider-executed tools remain visible and a final answer in the same step completes normally", async () => {
  const saved: string[] = [];
  const generation = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: "tool-call",
              toolCallId: "native-read",
              toolName: "mcp__senslop__readSource",
              input: '{"path":"a.ts"}',
              providerExecuted: true,
              dynamic: true,
            });
            controller.enqueue({
              type: "tool-result",
              toolCallId: "native-read",
              toolName: "mcp__senslop__readSource",
              result: "captured source",
              dynamic: true,
            });
            controller.enqueue({
              type: "tool-call",
              toolCallId: "native-extra",
              toolName: "ToolSearch",
              input: "{}",
              providerExecuted: true,
              dynamic: true,
            });
            controller.enqueue({
              type: "tool-result",
              toolCallId: "native-extra",
              toolName: "ToolSearch",
              result: "tool metadata",
              dynamic: true,
            });
            controller.enqueue({ type: "text-start", id: "answer" });
            controller.enqueue({
              type: "text-delta",
              id: "answer",
              delta: "Final answer",
            });
            controller.enqueue({ type: "text-end", id: "answer" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 2, text: 2, reasoning: 0 },
              },
            });
            controller.close();
          },
        }),
      }),
    }),
    prompt: "Explain",
    onError: () => {},
  });
  const response = agentStreamResponse(
    generation.stream,
    new AbortController(),
    async (_message, status) => {
      saved.push(status);
    },
  );
  const chat = new Chat({
    transport: new DefaultChatTransport({ fetch: async () => response }),
  });
  await chat.sendMessage({ text: "Explain" });
  expect(chat.status).toBe("ready");
  expect(saved).toEqual(["complete"]);
  expect(chat.messages.at(-1)?.parts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "dynamic-tool",
        toolName: "mcp__senslop__readSource",
      }),
      expect.objectContaining({ type: "dynamic-tool", toolName: "ToolSearch" }),
      expect.objectContaining({ type: "text", text: "Final answer" }),
    ]),
  );
});

test("provider failure preserves partial output and reaches the SDK client as an error", async () => {
  const saved: { message: UIMessage; status: string }[] = [];
  const response = agentStreamResponse(
    result(true).stream,
    new AbortController(),
    async (message, status) => {
      saved.push({ message, status });
    },
  );
  const chat = new Chat({
    transport: new DefaultChatTransport({ fetch: async () => response }),
  });
  await chat.sendMessage({ text: "Explain" });
  expect(chat.status).toBe("error");
  expect(chat.error?.message).toMatch(/provider|unavailable|disconnected/i);
  await expect.poll(() => saved[0]?.status).toBe("interrupted");
  expect(saved[0]?.message.parts).toContainEqual(
    expect.objectContaining({ type: "text", text: "partial" }),
  );
});

test("canceling the response aborts generation and preserves partial output as interrupted", async () => {
  const abort = new AbortController();
  const saved: { message: UIMessage; status: string }[] = [];
  const generation = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "text" });
            controller.enqueue({
              type: "text-delta",
              id: "text",
              delta: "partial",
            });
          },
        }),
      }),
    }),
    prompt: "Explain",
    abortSignal: abort.signal,
  });
  const response = agentStreamResponse(
    generation.stream,
    abort,
    async (message, status) => {
      saved.push({ message, status });
    },
  );
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let received = "";
  while (!received.includes("text-delta"))
    received += decoder.decode((await reader.read()).value);
  await reader.cancel();
  await expect.poll(() => abort.signal.aborted).toBe(true);
  await expect.poll(() => saved[0]?.status).toBe("interrupted");
  expect(saved[0]?.message.parts).toContainEqual(
    expect.objectContaining({ type: "text", text: "partial" }),
  );
});

test("a length-limited response retains partial text as interrupted rather than marking the turn complete", async () => {
  const saved: { message: UIMessage; status: string }[] = [];
  const stream = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "text" });
            controller.enqueue({
              type: "text-delta",
              id: "text",
              delta: "Let me check more",
            });
            controller.enqueue({ type: "text-end", id: "text" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "length", raw: undefined },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            });
            controller.close();
          },
        }),
      }),
    }),
    prompt: "Explain",
  });
  const response = agentStreamResponse(
    stream.stream,
    new AbortController(),
    async (message, status) => {
      saved.push({ message, status });
    },
  );
  const chat = new Chat({
    transport: new DefaultChatTransport({ fetch: async () => response }),
  });
  await chat.sendMessage({ text: "Explain" });
  expect(chat.status).toBe("error");
  await expect.poll(() => saved[0]?.status).toBe("interrupted");
});
