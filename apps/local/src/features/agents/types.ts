import type { UIMessage } from "ai";
import type { MessageStatus, ModelSelectionSchema } from "./schemas";

export type AgentMessage = UIMessage<{
  status?: MessageStatus;
  model?: ModelSelectionSchema | null;
  createdAt?: string;
  thinkingDurationMs?: number;
}>;

export type ChatActivity = {
  id: string;
  kind: "reasoning" | "tool" | "text" | "source";
  status: "running" | "complete" | "failed";
  toolName?: string;
  text?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
};
