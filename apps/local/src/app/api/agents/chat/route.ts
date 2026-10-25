import { convertToModelMessages, validateUIMessages } from "ai";
import { toConversationMessages } from "../../../../features/agents/lib/messages";
import { formatMessageText } from "../../../../features/agents/lib/formatters";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../../features/workspace/lib/server-workspace";
import { AgentStore } from "../../../../features/agents/lib/agent-store";
import { chatTurnSchema } from "../../../../features/agents/schemas";
import { loadContext } from "../../../../services/analysis/frozen-context";
import { createRepositoryAgent } from "../../../../services/ai/repository-agent";
import { agentStreamResponse } from "../../../../services/ai/stream-response";
import { formatAiError } from "../../../../services/ai/errors";

export const POST = async (request: Request) => {
  if (!protectLocalRoute(request))
    return new Response("Invalid local session.", { status: 403 });
  const input = chatTurnSchema.safeParse(
    await readLocalBody(request).catch(() => null),
  );
  if (!input.success)
    return new Response("Choose a model and enter a bounded message.", {
      status: 400,
    });
  const workspace = getWorkspace();
  const agents = new AgentStore(workspace.store, await workspace.root());
  let begun = false;
  try {
    const conversation = agents.conversation(input.data.conversationId);
    if (!conversation) throw new Error("Conversation not found.");
    const snapshot = agents.snapshot(conversation.snapshotId);
    const abort = new AbortController();
    request.signal.addEventListener("abort", () => abort.abort(), {
      once: true,
    });
    const signal = AbortSignal.any([abort.signal, request.signal]);
    const context = await loadContext(
      agents.local,
      agents.repository,
      snapshot,
    );
    const agent = await createRepositoryAgent({
      task: "chat",
      local: agents.local,
      snapshot,
      context,
      settings: agents.settings(),
      selection: input.data.model,
      signal,
    });
    const turn = agents.beginTurn(
      conversation.id,
      input.data.content,
      input.data.model,
      input.data.messageId,
    );
    begun = true;
    const messages = await validateUIMessages({
      messages: toConversationMessages(turn)
        .filter((message) => message.metadata?.status === "complete")
        .slice(-20),
      tools: agent.tools,
    });
    const result = agent.stream(
      await convertToModelMessages(messages, {
        ignoreIncompleteToolCalls: true,
      }),
    );
    return agentStreamResponse(
      result.stream,
      abort,
      async (message, status) => {
        agents.finishTurn(
          conversation.id,
          formatMessageText(message),
          status,
          message,
        );
      },
      turn.messages.at(-1)!.id,
    );
  } catch (error) {
    if (begun) agents.finishTurn(input.data.conversationId, "", "interrupted");
    return new Response(formatAiError(error), { status: 422 });
  }
};
