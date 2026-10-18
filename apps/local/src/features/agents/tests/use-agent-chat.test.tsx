// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { useAgentChat } from "../hooks/use-agent-chat";
import type { ConversationSchema } from "../schemas";
const buddy = vi.hoisted(() => vi.fn());
vi.mock("../../buddy/components/buddy-provider", () => ({
  useBuddy: () => buddy,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  buddy.mockReset();
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

test("failed chat generation clears thinking and reacts sadly without celebrating", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Provider unavailable.");
    }),
  );
  const { result } = renderHook(() => useAgentChat(undefined, vi.fn()));
  await act(async () => {
    await expect(
      result.current.send(
        "conversation",
        { connectionId: "provider", modelId: "model", name: "Model" },
        "Question",
      ),
    ).rejects.toThrow("Provider unavailable.");
  });
  expect(buddy).toHaveBeenCalledWith(
    expect.objectContaining({ type: "reaction", mood: "cry" }),
  );
  expect(buddy.mock.calls.at(-1)?.[0]).toMatchObject({
    type: "activity",
    activity: null,
  });
  expect(
    buddy.mock.calls.some(
      ([event]) => event.type === "reaction" && event.mood === "happy",
    ),
  ).toBe(false);
});

test("a truncated response cannot produce a success reaction", async () => {
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
  expect(
    buddy.mock.calls.some(
      ([event]) => event.type === "reaction" && event.mood === "happy",
    ),
  ).toBe(false);
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
  expect(buddy).toHaveBeenCalledWith(
    expect.objectContaining({ type: "activity", activity: "thinking" }),
  );
  expect(
    buddy.mock.calls.some(
      ([event]) => event.type === "reaction" && event.mood === "happy",
    ),
  ).toBe(false);
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
  expect(
    buddy.mock.calls.filter(
      ([event]) => event.type === "reaction" && event.mood === "happy",
    ),
  ).toHaveLength(1);
});
