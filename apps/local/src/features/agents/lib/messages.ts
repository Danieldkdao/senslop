import type { ConversationSchema } from "../schemas";
import type { AgentMessage } from "../types";
import type { ChatActivity } from "../types";
import { getToolName, isToolUIPart } from "ai";

export const toConversationMessages = (
  conversation: ConversationSchema,
): AgentMessage[] =>
  conversation.messages.map((message, index) => {
    const previous = conversation.messages[index - 1];
    const startedAt =
      message.createdAt ??
      (previous?.role === "user"
        ? (previous.createdAt ?? previous.updatedAt)
        : undefined);
    const elapsed = Date.parse(message.updatedAt) - Date.parse(startedAt ?? "");
    return {
      id: message.id ?? `${conversation.id}:${index}`,
      role: message.role,
      parts: (message.parts?.length
        ? message.parts
        : [{ type: "text", text: message.content }]) as AgentMessage["parts"],
      metadata: {
        status: message.status,
        model: message.model,
        createdAt: message.createdAt ?? message.updatedAt,
        thinkingDurationMs:
          message.thinkingDurationMs ??
          (message.role === "assistant" &&
          message.status !== "streaming" &&
          Number.isFinite(elapsed) &&
          elapsed >= 0
            ? elapsed
            : undefined),
      },
    };
  });

export const getChatPresentation = (message: AgentMessage, busy: boolean) => {
  const parts = message.parts;
  let stepStart = -1;
  parts.forEach((part, index) => {
    if (part.type === "step-start") stepStart = index;
  });
  const currentStep = parts.slice(stepStart + 1);
  const hasTools = currentStep.some(isToolUIPart);
  const answerStarted =
    currentStep.some((part) => part.type === "text" && !!part.text.trim()) &&
    !hasTools;
  const activity: ChatActivity[] = [];
  let answer = "";
  for (const [index, part] of parts.entries()) {
    const id = `${message.id}:${index}`;
    if (part.type === "text") {
      if (answerStarted && index > stepStart) answer += part.text;
      else if (part.text)
        activity.push({
          id,
          kind: "text",
          status: "complete",
          text: part.text,
        });
    } else if (part.type === "reasoning") {
      activity.push({
        id,
        kind: "reasoning",
        status: busy && part.state === "streaming" ? "running" : "complete",
        text: part.text,
      });
    } else if (isToolUIPart(part)) {
      const complete = part.state === "output-available";
      const failed =
        part.state === "output-error" ||
        part.state === "output-denied" ||
        (!busy && !complete);
      activity.push({
        id: part.toolCallId,
        kind: "tool",
        toolName: getToolName(part),
        status: failed ? "failed" : complete ? "complete" : "running",
        input: part.input,
        output: "output" in part ? part.output : undefined,
        error:
          "errorText" in part
            ? part.errorText
            : failed
              ? "Tool call did not complete."
              : undefined,
      });
    } else if (part.type === "source-url") {
      activity.push({
        id,
        kind: "source",
        status: "complete",
        text: part.title ?? part.url,
      });
    } else if (part.type === "source-document") {
      activity.push({
        id,
        kind: "source",
        status: "complete",
        text: part.title,
      });
    }
  }
  const latestActivity = [...activity].reverse();
  const liveReasoning =
    busy && !answerStarted
      ? latestActivity.find(
          (step) => step.kind === "reasoning" && step.status === "running",
        )
      : undefined;
  const current =
    latestActivity.find((step) => step.status === "running") ?? activity.at(-1);
  return { answer, answerStarted, activity, liveReasoning, current };
};
