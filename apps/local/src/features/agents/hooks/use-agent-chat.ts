"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { ConversationSchema, ModelSelectionSchema } from "../schemas";
import type { AgentMessage } from "../types";
import { toConversationMessages } from "../lib/messages";
import { formatMessageText } from "../lib/formatters";
import { useBuddy } from "../../buddy/components/buddy-provider";

export const useAgentChat = (
  conversation: ConversationSchema | undefined,
  refresh: (conversationId: string) => Promise<unknown>,
) => {
  const report = useBuddy();
  const request = useRef<{ id: string; stopped: boolean } | null>(null);
  const loaded = useRef<string | null>(null);
  const outcome = useRef<{
    interrupted: boolean;
    error?: Error;
    messageId?: string;
  }>({ interrupted: false });
  const state = useChat<AgentMessage>({
    transport: new DefaultChatTransport({
      api: "/api/agents/chat",
      prepareSendMessagesRequest: ({ messages, body }) => ({
        body: {
          ...body,
          messageId: messages.at(-1)!.id,
          content: formatMessageText(messages.at(-1)!),
        },
      }),
    }),
    onError: (error) => {
      outcome.current.error = error;
    },
    onFinish: ({ message, isAbort, isDisconnect, isError, finishReason }) => {
      outcome.current = {
        ...outcome.current,
        messageId: message.id,
        interrupted:
          isAbort ||
          isDisconnect ||
          isError ||
          finishReason === "length" ||
          finishReason === "content-filter" ||
          finishReason === "error",
      };
    },
  });
  useEffect(
    () => () => {
      if (request.current)
        report({ type: "activity", id: request.current.id, activity: null });
      request.current = null;
    },
    [report],
  );
  const { setMessages } = state;
  const busy = state.status === "submitted" || state.status === "streaming";
  useEffect(() => {
    if (!conversation || busy) return;
    const last = conversation.messages.at(-1);
    if (
      loaded.current !== conversation.id ||
      (last?.id &&
        last.id === outcome.current.messageId &&
        last.status !== "streaming")
    ) {
      loaded.current = conversation.id;
      setMessages(toConversationMessages(conversation));
    }
  }, [conversation, busy, setMessages]);
  const reset = () => {
    if (request.current)
      report({ type: "activity", id: request.current.id, activity: null });
    request.current = null;
    void state.stop();
    state.clearError();
    setMessages([]);
    loaded.current = null;
    outcome.current = { interrupted: false };
  };
  const send = async (
    conversationId: string,
    model: ModelSelectionSchema,
    content: string,
  ) => {
    loaded.current = conversationId;
    const previousUser = [...state.messages]
      .reverse()
      .find((message) => message.role === "user");
    const messageId =
      (outcome.current.interrupted ||
        state.error ||
        state.messages.at(-1)?.metadata?.status === "interrupted") &&
      previousUser &&
      formatMessageText(previousUser) === content
        ? previousUser.id
        : undefined;
    const retrying = outcome.current.interrupted || !!state.error;
    const id = `chat:${crypto.randomUUID()}`;
    request.current = { id, stopped: false };
    if (retrying)
      report({
        type: "reaction",
        id: `${id}:retry`,
        mood: "retry",
        message: "Let's try that message again.",
      });
    outcome.current = { interrupted: false };
    report({ type: "activity", id, activity: "thinking" });
    try {
      await state.sendMessage(
        {
          text: content,
          messageId,
          metadata: { createdAt: new Date().toISOString() },
        },
        { body: { conversationId, model } },
      );
      await refresh(conversationId);
      if (outcome.current.error) throw outcome.current.error;
      if (outcome.current.interrupted)
        throw new Error(
          "The response was interrupted. Your draft is retained for retry.",
        );
      if (request.current?.id === id)
        report({
          type: "reaction",
          id: `${id}:complete`,
          mood: "happy",
          message: "Your response is ready.",
        });
    } catch (error) {
      if (request.current?.id === id && !request.current.stopped)
        report({
          type: "reaction",
          id: `${id}:failed`,
          mood: "cry",
          message: "That response hit a snag. Your draft is here for retry.",
        });
      throw error;
    } finally {
      report({ type: "activity", id, activity: null });
      if (request.current?.id === id) request.current = null;
    }
  };
  const stop = () => {
    if (request.current) request.current.stopped = true;
    return state.stop();
  };
  return { ...state, busy, send, reset, stop };
};
