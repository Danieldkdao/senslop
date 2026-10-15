"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { ConversationSchema, ModelSelectionSchema } from "../schemas";
import type { AgentMessage } from "../types";
import { toConversationMessages } from "../lib/messages";
import { formatMessageText } from "../lib/formatters";

export const useAgentChat = (
  conversation: ConversationSchema | undefined,
  refresh: (conversationId: string) => Promise<unknown>,
) => {
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
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      outcome.current = {
        ...outcome.current,
        messageId: message.id,
        interrupted: isAbort || isDisconnect || isError,
      };
    },
  });
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
    outcome.current = { interrupted: false };
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
  };
  return { ...state, busy, send, reset };
};
