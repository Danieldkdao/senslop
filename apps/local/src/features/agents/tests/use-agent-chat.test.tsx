// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { useAgentChat } from "../hooks/use-agent-chat";
import type { ConversationSchema } from "../schemas";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const saved = (id: string, content: string) =>
  ({
    id,
    messages: [{ role: "assistant", content, status: "complete", model: null }],
  }) as ConversationSchema;

test("switching histories replaces SDK messages without leaking the previous conversation", async () => {
  const { result, rerender } = renderHook(
    ({ conversation }) => useAgentChat(conversation, vi.fn()),
    { initialProps: { conversation: saved("first", "First answer") } },
  );
  await waitFor(() => expect(result.current.messages[0]?.id).toBe("first:0"));
  rerender({ conversation: saved("second", "Second answer") });
  await waitFor(() => expect(result.current.messages[0]?.id).toBe("second:0"));
  expect(result.current.messages).toHaveLength(1);
});

test("a truncated response is retained as interrupted", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      createUIMessageStreamResponse({
        stream: new ReadableStream<UIMessageChunk>({
          start(controller) {
            controller.enqueue({ type: "start", messageId: "assistant" });
            controller.enqueue({ type: "finish", finishReason: "length" });
            controller.close();
          },
        }),
      }),
    ),
  );
  const { result } = renderHook(() => useAgentChat(undefined, vi.fn()));
  await act(async () => {
    await expect(
      result.current.send(
        "conversation",
        { connectionId: "provider", modelId: "model", name: "Model" },
        "Question",
      ),
    ).rejects.toThrow(/interrupted/i);
  });
});

test("stopping an SDK request retains partial output and refreshes the correct conversation", async () => {
  const requests: { messageId: string }[] = [];
  vi.stubGlobal("fetch", (_url: string, options: RequestInit) =>
    Promise.resolve(
      createUIMessageStreamResponse({
        stream: new ReadableStream<UIMessageChunk>({
          start(controller) {
            requests.push(JSON.parse(options.body as string));
            controller.enqueue({ type: "start", messageId: "assistant" });
            controller.enqueue({ type: "text-start", id: "text" });
            controller.enqueue({
              type: "text-delta",
              id: "text",
              delta: "Partial answer",
            });
            if (requests.length > 1) {
              controller.enqueue({ type: "text-end", id: "text" });
              controller.enqueue({ type: "finish" });
              controller.close();
              return;
            }
            options.signal?.addEventListener(
              "abort",
              () => controller.error(new DOMException("Stopped", "AbortError")),
              { once: true },
            );
          },
        }),
      }),
    ),
  );
  const refresh = vi.fn();
  const { result } = renderHook(() => useAgentChat(undefined, refresh));
  let request!: Promise<void>;
  act(() => {
    request = result.current.send(
      "conversation",
      { connectionId: "provider", modelId: "model", name: "Model" },
      "Question",
    );
  });
  await waitFor(() =>
    expect(result.current.messages.at(-1)?.parts).toContainEqual(
      expect.objectContaining({ text: "Partial answer" }),
    ),
  );
  act(() => {
    void result.current.stop();
  });
  await act(async () => {
    await expect(request).rejects.toThrow(/interrupted|stopped/i);
  });
  expect(refresh).toHaveBeenCalledWith("conversation");
  expect(result.current.messages.at(-1)?.parts).toContainEqual(
    expect.objectContaining({ text: "Partial answer" }),
  );
  expect(result.current.busy).toBe(false);
  await act(async () => {
    await result.current.send(
      "conversation",
      { connectionId: "provider", modelId: "model", name: "Model" },
      "Question",
    );
  });
  expect(requests[1]?.messageId).toBe(requests[0]?.messageId);
  expect(
    result.current.messages.filter((message) => message.role === "user"),
  ).toHaveLength(1);
});
