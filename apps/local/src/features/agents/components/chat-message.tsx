"use client";

import { cn } from "@/lib/utils";
import { CopyButton } from "../../../components/copy-button";
import type { AgentMessage } from "../types";
import { formatChatDate, formatMessageText } from "../lib/formatters";
import { getChatPresentation } from "../lib/messages";
import { AgentActivity } from "./agent-activity";
import { AgentMarkdown } from "./agent-markdown";

export const ChatMessage = ({
  message,
  busy,
}: {
  message: AgentMessage;
  busy: boolean;
}) => {
  const user = message.role === "user";
  const presentation = getChatPresentation(message, busy);
  const text = user ? formatMessageText(message) : presentation.answer;
  const sentAt = message.metadata?.createdAt;
  return (
    <article
      aria-label={user ? "Your message" : "Agent response"}
      className={cn(
        "group/message flex w-full min-w-0 flex-col gap-2 @md:max-w-[80%] @md:w-fit",
        user ? "ml-auto" : "mr-auto",
      )}
    >
      {user ? (
        <>
          <div className="ml-auto @md:w-fit min-w-0 rounded-2xl bg-chat-user px-4 py-3 text-card-foreground">
            <p className="whitespace-pre-wrap wrap-anywhere text-base">
              {text}
            </p>
          </div>
          {sentAt && (
            <time
              dateTime={sentAt}
              className="text-right text-base text-muted-foreground opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100 [@media(hover:none)]:opacity-100"
            >
              {formatChatDate(sentAt)}
            </time>
          )}
        </>
      ) : (
        <div className="flex flex-col mr-auto @md:w-fit min-w-0 gap-2">
          <AgentActivity
            presentation={presentation}
            message={message}
            busy={busy}
          />
          {text && (
            <div className="min-w-0 text-foreground">
              <AgentMarkdown streaming={busy}>{text}</AgentMarkdown>
            </div>
          )}
          {!busy &&
            !text &&
            message.metadata?.status !== "interrupted" &&
            presentation.activity.some((step) => step.kind === "tool") && (
              <p className="text-base text-muted-foreground">
                The agent stopped before its final answer. Send a follow-up to
                continue.
              </p>
            )}
          {message.metadata?.status === "interrupted" && (
            <p className="text-base text-muted-foreground">
              Interrupted response
            </p>
          )}
          {text && !busy && (
            <div className="flex justify-start opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100 [@media(hover:none)]:opacity-100">
              <CopyButton text={text} />
            </div>
          )}
        </div>
      )}
    </article>
  );
};
