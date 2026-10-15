import { expect, test } from "vitest";
import { convertToModelMessages, validateUIMessages } from "ai";
import { toConversationMessages } from "../lib/messages";
import { formatMessageText } from "../lib/formatters";
import type { ConversationSchema } from "../schemas";

test("legacy saved text becomes stable SDK messages without dropping provenance", async () => {
  const conversation = {
    id: "conversation",
    messages: [
      { role: "user", content: "question", status: "complete", model: null },
      {
        role: "assistant",
        content: "partial",
        status: "interrupted",
        model: null,
      },
    ],
  } as ConversationSchema;
  const messages = await validateUIMessages({
    messages: toConversationMessages(conversation),
  });
  expect(messages[0]).toMatchObject({
    id: "conversation:0",
    parts: [{ type: "text", text: "question" }],
    metadata: { status: "complete", model: null },
  });
  expect(formatMessageText(messages[1]!)).toBe("partial");
  expect(toConversationMessages(conversation)[1]?.id).toBe(messages[1]?.id);
});

test("saved SDK tool results survive reload and convert into model history", async () => {
  const parts = [
    {
      type: "tool-readSource",
      toolCallId: "read",
      state: "output-available",
      input: { path: "a.ts" },
      output: "source",
    },
    { type: "text", text: "answer" },
  ];
  const conversation = {
    id: "conversation",
    messages: [
      {
        id: "assistant",
        role: "assistant",
        content: "answer",
        status: "complete",
        model: null,
        parts,
        createdAt: "2026-10-12T15:00:00.000Z",
        thinkingDurationMs: 64000,
      },
    ],
  } as unknown as ConversationSchema;
  const messages = await validateUIMessages({
    messages: toConversationMessages(conversation),
  });
  expect(messages[0]?.parts).toEqual(parts);
  expect(messages[0]?.metadata).toMatchObject({
    createdAt: "2026-10-12T15:00:00.000Z",
    thinkingDurationMs: 64000,
  });
  const modelMessages = await convertToModelMessages(messages);
  expect(modelMessages.some((message) => message.role === "tool")).toBe(true);
});

test("legacy completed messages recover elapsed time from their user turn instead of losing the duration", () => {
  const conversation = {
    id: "old",
    messages: [
      {
        role: "user",
        content: "Question",
        status: "complete",
        model: null,
        updatedAt: "2026-10-12T15:00:00.000Z",
      },
      {
        role: "assistant",
        content: "Response",
        status: "complete",
        model: null,
        updatedAt: "2026-10-12T15:00:04.000Z",
      },
    ],
  } as ConversationSchema;
  expect(
    toConversationMessages(conversation)[1]?.metadata?.thinkingDurationMs,
  ).toBe(4000);
});
