import { randomUUID } from "node:crypto";
import { recordNotification } from "@senslop/review-core/notifications";
import {
  getWorkspace,
  protectLocalRoute,
  readLocalBody,
} from "../../../../features/workspace/lib/server-workspace";
import { AgentStore } from "../../../../features/agents/lib/agent-store";
import { explainRequestSchema } from "../../../../features/agents/schemas";
import {
  assignedModel,
  createRepositoryAgent,
} from "../../../../services/ai/repository-agent";
import { loadContext } from "../../../../services/analysis/frozen-context";
import { agentStreamResponse } from "../../../../services/ai/stream-response";
import { AiServiceError, formatAiError } from "../../../../services/ai/errors";

export const POST = async (request: Request) => {
  if (!protectLocalRoute(request))
    return new Response("Invalid local session.", { status: 403 });
  try {
    const input = explainRequestSchema.parse(await readLocalBody(request));
    const workspace = getWorkspace();
    const agents = new AgentStore(workspace.store, await workspace.root());
    const snapshot = agents.snapshot(input.snapshotId);
    const file = snapshot.files.find((file) => file.path === input.path);
    if (!file || file.binary || file[input.side] === null)
      throw new AiServiceError("This file has no text on the selected side.");
    const text = file[input.side]!;
    const end = input.end ?? text.split("\n").length;
    const start = input.start ?? 1;
    if (end < start || end > text.split("\n").length)
      throw new AiServiceError("Select valid source lines.");
    const settings = agents.settings();
    const selection = assignedModel(settings, "explain");
    if (!selection)
      throw new AiServiceError("Choose an Explain model in Settings → AI.");
    const abort = new AbortController();
    request.signal.addEventListener("abort", () => abort.abort(), {
      once: true,
    });
    const context = await loadContext(
      agents.local,
      agents.repository,
      snapshot,
    );
    const agent = await createRepositoryAgent({
      task: "explain",
      local: agents.local,
      snapshot,
      context,
      settings,
      selection,
      signal: AbortSignal.any([abort.signal, request.signal]),
    });
    const result = agent.stream(
      [
        {
          role: "user",
          content: `Explain ${file.path}, ${input.side} side, lines ${start}–${end}. Exact selected text:\n${text
            .split("\n")
            .slice(start - 1, end)
            .join("\n")}`,
        },
      ],
      true,
    );
    return agentStreamResponse(
      result.stream,
      abort,
      async (_message, status) => {
        if (status === "complete")
          try {
            recordNotification(workspace.store, agents.repository, {
              id: `explanation:${randomUUID()}`,
              kind: "explanation",
              reviewId: snapshot.id,
              title: snapshot.title,
            });
          } catch {
            /* Notification delivery must not fail a completed response. */
          }
      },
    );
  } catch (error) {
    return new Response(formatAiError(error), { status: 422 });
  }
};
