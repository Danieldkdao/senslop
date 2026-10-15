"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ModelPicker } from "../../providers/components/model-picker";
import type { ModelSelection } from "../../providers/model-schemas";
import {
  chatFormSchema,
  type ChatFormSchema,
  type ChatMessageSchema,
  type ChatMessageRole,
} from "../schemas";
import { sendTestMessage } from "../lib/requests";

const formatMessageRole = (role: ChatMessageRole) => {
  switch (role) {
    case "user":
      return "You";
    case "assistant":
      return "AI";
  }
};

export const AiTestChat = () => {
  const [selection, setSelection] = useState<ModelSelection | null>(null);
  const [messages, setMessages] = useState<ChatMessageSchema[]>([]);
  const controller = useRef<AbortController | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChatFormSchema>({
    resolver: zodResolver(chatFormSchema),
    defaultValues: { message: "" },
  });
  useEffect(() => () => controller.current?.abort(), []);
  const selectModel = useCallback(
    (next: ModelSelection | null) => {
      if (
        selection?.connectionId === next?.connectionId &&
        selection?.modelId === next?.modelId
      )
        return;
      controller.current?.abort();
      setMessages([]);
      setSelection(next);
    },
    [selection],
  );
  return (
    <main className="mx-auto max-w-2xl p-6 text-base flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl">AI test</h1>
        <Link href="/" className="underline">
          Workspace
        </Link>
      </div>
      <p className="text-muted-foreground">
        Messages are sent to the selected provider. Changing models starts a
        fresh conversation.
      </p>
      <ModelPicker
        value={selection}
        onChange={selectModel}
        disabled={isSubmitting}
      />
      <div
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        className="flex flex-col gap-4"
      >
        {!messages.length && (
          <p className="text-muted-foreground">
            Choose a model and send a message.
          </p>
        )}
        {messages.map((message, index) => (
          <div key={index} className="flex flex-col gap-1">
            <p className="font-medium">{formatMessageRole(message.role)}</p>
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>
        ))}
      </div>
      {isSubmitting && <p role="status">Waiting for the model…</p>}
      <form
        noValidate
        aria-busy={isSubmitting}
        className="flex flex-col gap-3"
        onSubmit={(event) =>
          void handleSubmit(async ({ message }) => {
            if (!selection || controller.current) return;
            const requestController = new AbortController();
            controller.current = requestController;
            const nextMessages: ChatMessageSchema[] = [
              ...messages,
              { role: "user", content: message },
            ];
            try {
              const reply = await sendTestMessage(
                {
                  connectionId: selection.connectionId,
                  modelId: selection.modelId,
                  messages: nextMessages,
                },
                requestController.signal,
              );
              if (requestController.signal.aborted) return;
              setMessages([
                ...nextMessages,
                { role: "assistant", content: reply.text },
              ]);
              reset();
            } catch (error) {
              if (!requestController.signal.aborted)
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "The provider request failed. Retry when ready.",
                );
            } finally {
              if (controller.current === requestController)
                controller.current = null;
            }
          })(event)
        }
      >
        <label htmlFor="chat-message">Message</label>
        <div className="flex gap-3">
          <Input
            id="chat-message"
            className="text-base md:text-base"
            {...register("message")}
            disabled={isSubmitting}
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? "chat-message-error" : undefined}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing && event.key === "Enter")
                event.preventDefault();
            }}
          />
          <Button
            type="submit"
            aria-label="Send"
            aria-busy={isSubmitting}
            disabled={!selection || isSubmitting}
          >
            <LoadingSwap isLoading={isSubmitting}>Send</LoadingSwap>
          </Button>
        </div>
        {errors.message && (
          <p id="chat-message-error" role="alert" className="text-destructive">
            {errors.message.message}
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={isSubmitting || !messages.length}
          onClick={() => setMessages([])}
        >
          Clear conversation
        </Button>
      </form>
    </main>
  );
};
