import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { POST as chatRoute } from "../../../app/api/agents/chat/route";
import { POST as explainRoute } from "../../../app/api/agents/explain/route";
import { defaultAiSettings } from "../constants";

const state = vi.hoisted(() => ({
  signal: undefined as AbortSignal | undefined,
  finish: vi.fn(),
}));
const conversationId = "11111111-1111-4111-8111-111111111111";
const snapshotId = "22222222-2222-4222-8222-222222222222";
const model = {
  connectionId: "33333333-3333-4333-8333-333333333333",
  modelId: "fixture",
  name: "Fixture",
};
vi.mock("server-only", () => ({}));
vi.mock("../../workspace/lib/server-workspace", () => ({
  protectLocalRoute: () => true,
  readLocalBody: (request: Request) => request.json(),
  getWorkspace: () => ({ store: {}, root: async () => "/fixture" }),
}));
vi.mock("../lib/agent-store", () => ({
  AgentStore: class {
    local = {};
    repository = "/fixture";
    conversation = () => ({ id: conversationId, snapshotId });
    snapshot = () => ({
      id: snapshotId,
      files: [{ path: "a.ts", binary: false, after: "source" }],
    });
    settings = () => ({ ...defaultAiSettings, shared: model });
    beginTurn = () => ({
      id: conversationId,
      messages: [
        {
          id: "question",
          role: "user",
          content: "Explain",
          status: "complete",
          model: null,
          updatedAt: new Date().toISOString(),
        },
        {
          id: "answer",
          role: "assistant",
          content: "",
          status: "streaming",
          model: null,
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    finishTurn = (...args: unknown[]) => state.finish(...args);
  },
}));
vi.mock("../../../services/analysis/frozen-context", () => ({
  loadContext: async () => ({}),
}));
vi.mock("../../../services/ai/repository-agent", () => ({
  assignedModel: () => model,
  createRepositoryAgent: async ({ signal }: { signal: AbortSignal }) => {
    state.signal = signal;
    return {
      tools: {},
      stream: () =>
        streamText({
          abortSignal: signal,
          onError: () => {},
          prompt: "Synthetic slow response",
          model: new MockLanguageModelV4({
            doStream: async () => ({
              stream: new ReadableStream({
                start(controller) {
                  controller.enqueue({ type: "text-start", id: "text" });
                  let chunks = 0;
                  const timer = setInterval(() => {
                    controller.enqueue({
                      type: "text-delta",
                      id: "text",
                      delta: `Part ${++chunks}. `,
                    });
                    if (chunks !== 6) return;
                    clearInterval(timer);
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
                        outputTokens: { total: 6, text: 6, reasoning: 0 },
                      },
                    });
                    controller.close();
                  }, 30000);
                  signal.addEventListener("abort", () => clearInterval(timer), {
                    once: true,
                  });
                },
              }),
            }),
          }),
        }),
    };
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  state.signal = undefined;
  state.finish.mockClear();
  // Native AbortSignal timers bypass fake timers; retain their behavior on the test clock.
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException("Timed out", "TimeoutError")),
      milliseconds,
    );
    return controller.signal;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test.each([
  { name: "chat", route: chatRoute },
  { name: "explanation", route: explainRoute },
])(
  "$name preserves an actively streaming answer beyond 150 seconds",
  async ({ name, route }) => {
    const ended = vi.fn();
    const client = new Chat({
      onFinish: ended,
      transport: new DefaultChatTransport({
        fetch: async (_url, options) =>
          route(
            new Request("http://localhost/api/agents/chat", {
              ...options,
              body: JSON.stringify(
                name === "chat"
                  ? { conversationId, model, content: "Explain" }
                  : {
                      snapshotId,
                      path: "a.ts",
                      side: "after",
                      start: 1,
                      end: 1,
                    },
              ),
            }),
          ),
      }),
    });
    const completion = client.sendMessage({ text: "Explain" });
    await vi.waitFor(() => expect(state.signal).toBeDefined());
    await vi.advanceTimersByTimeAsync(180100);
    await completion;
    expect(state.signal!.aborted).toBe(false);
    expect(ended).toHaveBeenCalledWith(
      expect.objectContaining({
        isAbort: false,
        isError: false,
        isDisconnect: false,
      }),
    );
    expect(client.messages.at(-1)?.parts).toContainEqual(
      expect.objectContaining({
        type: "text",
        text: "Part 1. Part 2. Part 3. Part 4. Part 5. Part 6. ",
      }),
    );
    if (name === "chat")
      expect(state.finish).toHaveBeenCalledWith(
        conversationId,
        expect.any(String),
        "complete",
        expect.any(Object),
      );
  },
);

test("Stop still cancels the provider immediately and saves the partial chat response", async () => {
  const client = new Chat({
    transport: new DefaultChatTransport({
      fetch: async (_url, options) =>
        chatRoute(
          new Request("http://localhost/api/agents/chat", {
            ...options,
            body: JSON.stringify({ conversationId, model, content: "Explain" }),
          }),
        ),
    }),
  });
  const completion = client.sendMessage({ text: "Explain" });
  await vi.waitFor(() => expect(state.signal).toBeDefined());
  await vi.advanceTimersByTimeAsync(30001);
  await client.stop();
  await completion;
  expect(state.signal!.aborted).toBe(true);
  await vi.waitFor(() =>
    expect(state.finish).toHaveBeenCalledWith(
      conversationId,
      expect.stringContaining("Part 1."),
      "interrupted",
      expect.any(Object),
    ),
  );
});
