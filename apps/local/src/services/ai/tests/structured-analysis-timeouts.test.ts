import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { createGroupingAgent, createReviewAgent } from "../analysis-agents";
import { generateStructuredAnalysis } from "../structured-analysis";
import { resolveLanguageModel } from "../provider-runtime";

vi.mock("server-only", () => ({}));
const answer = { answer: "complete" };
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(
      () =>
        controller.abort(new DOMException("Request timed out", "TimeoutError")),
      milliseconds,
    );
    return controller.signal;
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

const fixture = (
  provider: "vercel" | "chatgpt-subscription",
  active = true,
  quietMs = 0,
) => {
  const abort = new AbortController();
  const duration = 9 * 60 * 1000;
  const model = new MockLanguageModelV4({
    doGenerate: ({ abortSignal }) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            resolve({
              content: [{ type: "text", text: JSON.stringify(answer) }],
              finishReason: { unified: "stop", raw: "stop" },
              usage,
              warnings: [],
            }),
          duration,
        );
        abortSignal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(abortSignal.reason);
          },
          { once: true },
        );
      }),
    doStream: async ({ abortSignal }) => ({
      stream: new ReadableStream({
        start(controller) {
          let stopped = false;
          const startedAt = Date.now();
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "reasoning-start", id: "reasoning" });
          const heartbeat = active
            ? setInterval(() => {
                if (Date.now() - startedAt < quietMs) return;
                controller.enqueue({
                  type: "reasoning-delta",
                  id: "reasoning",
                  delta: "Working",
                });
              }, 60000)
            : undefined;
          const timer = setTimeout(() => {
            stopped = true;
            clearInterval(heartbeat);
            controller.enqueue({ type: "reasoning-end", id: "reasoning" });
            controller.enqueue({ type: "text-start", id: "answer" });
            controller.enqueue({
              type: "text-delta",
              id: "answer",
              delta: JSON.stringify(answer),
            });
            controller.enqueue({ type: "text-end", id: "answer" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage,
            });
            controller.close();
          }, duration);
          abortSignal?.addEventListener(
            "abort",
            () => {
              clearInterval(heartbeat);
              clearTimeout(timer);
              if (!stopped) {
                stopped = true;
                controller.error(abortSignal.reason);
              }
            },
            { once: true },
          );
        },
      }),
    }),
  });
  const request = generateStructuredAnalysis({
    agent: createReviewAgent({
      model,
      tools: {},
      instructions: "Review frozen source",
    }),
    schema: z.object({ answer: z.string() }),
    prompt: "Review",
    signal: abort.signal,
    maxSteps: 1,
    maxOutputTokens: 1024,
    providerOptions: {},
    contextWindow: 32000,
    diagnostics: { provider, snapshotId: "fixture" },
    prepareMessages: (messages) => messages,
    onRequest: () => {},
    toolsEnabled: false,
  }).then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  return { model, abort, request };
};

test.each(["vercel", "chatgpt-subscription"] as const)(
  "%s structured analysis keeps an active response alive beyond eight minutes using streaming transport",
  async (provider) => {
    const { model, request } = fixture(provider);
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000 + 1);
    expect(await request).toEqual({ value: answer });
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doGenerateCalls).toHaveLength(0);
  },
);

test.each(["vercel", "chatgpt-subscription"] as const)(
  "%s allows a long initial reasoning pause during structured analysis",
  async (provider) => {
    const { request } = fixture(provider, true, 5 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000 + 1);
    expect(await request).toEqual({ value: answer });
  },
);

test("a stalled provider stream still stops instead of waiting for the full batch timeout", async () => {
  const { abort, request } = fixture("vercel", false);
  const settled = vi.fn();
  void request.then(settled);
  try {
    await vi.advanceTimersByTimeAsync(8 * 60 * 1000 + 1);
    expect(settled).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.anything() }),
    );
  } finally {
    abort.abort(new Error("Test cleanup"));
    await request;
  }
});

test("canceling a subscription analysis aborts its active stream without another request", async () => {
  const { model, abort, request } = fixture("chatgpt-subscription");
  await vi.advanceTimersByTimeAsync(1000);
  abort.abort(new Error("Review stopped"));
  expect(await request).toEqual({
    error: expect.objectContaining({ message: "Review stopped" }),
  });
  expect(model.doStreamCalls).toHaveLength(1);
});

test.each([
  { provider: "vercel", complete: true },
  { provider: "vercel", complete: false },
  { provider: "chatgpt-subscription", complete: true },
  { provider: "chatgpt-subscription", complete: false },
] as const)(
  "$provider adapter uses streamed structured analysis and requires completion, complete $complete",
  async ({ provider, complete }) => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      let events: unknown[];
      if (provider === "vercel") {
        expect(
          new Headers(init?.headers).get("ai-language-model-streaming"),
        ).toBe("true");
        events = [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "answer" },
          { type: "text-delta", id: "answer", delta: JSON.stringify(answer) },
          { type: "text-end", id: "answer" },
          ...(complete
            ? [
                {
                  type: "finish",
                  finishReason: { unified: "stop", raw: "stop" },
                  usage,
                },
              ]
            : []),
        ];
      } else {
        expect(JSON.parse(String(init?.body)).stream).toBe(true);
        const message = {
          type: "message",
          id: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(answer),
              annotations: [],
            },
          ],
          status: "completed",
        };
        events = [
          {
            type: "response.created",
            response: { id: "response", created_at: 1, model: "gpt-5.6-luna" },
          },
          {
            type: "response.output_item.added",
            output_index: 0,
            item: { ...message, content: [], status: "in_progress" },
          },
          {
            type: "response.output_text.delta",
            item_id: "message",
            output_index: 0,
            content_index: 0,
            delta: JSON.stringify(answer),
          },
          { type: "response.output_item.done", output_index: 0, item: message },
          ...(complete
            ? [
                {
                  type: "response.completed",
                  response: {
                    id: "response",
                    created_at: 1,
                    status: "completed",
                    output: [message],
                    usage: {
                      input_tokens: 10,
                      output_tokens: 10,
                      total_tokens: 20,
                    },
                  },
                },
              ]
            : []),
        ];
      }
      return new Response(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
        { headers: { "content-type": "text/event-stream" } },
      );
    });
    const runtime = resolveLanguageModel(
      {
        provider,
        name: "Fixture",
        baseURL: "https://api.openai.com/v1",
        model: "",
        contextWindow: null,
      },
      "fixture-key",
      provider === "vercel" ? "minimax/minimax-m3.1-flash" : "gpt-5.6-luna",
      fetcher,
    );
    const request = generateStructuredAnalysis({
      agent: (provider === "vercel" ? createGroupingAgent : createReviewAgent)({
        ...runtime,
        tools: {},
        instructions: "Frozen source only",
        maxRetries: 0,
      }),
      schema: z.object({ answer: z.string() }),
      prompt: "Review",
      signal: new AbortController().signal,
      maxSteps: 1,
      maxOutputTokens: 1024,
      providerOptions: {},
      contextWindow: 32000,
      diagnostics: { provider, snapshotId: "fixture" },
      prepareMessages: (messages) => messages,
      onRequest: () => {},
      toolsEnabled: false,
    });
    if (complete) await expect(request).resolves.toEqual(answer);
    else await expect(request).rejects.toThrow(/complet|interrupt/i);
  },
);
