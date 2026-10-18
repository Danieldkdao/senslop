import { createServer } from "node:http";
import { once } from "node:events";

export const startAnalysisProvider = async () => {
  let paused = false;
  const waiting = new Set<() => void>();
  const server = createServer(async (request, response) => {
    if (request.method === "GET") {
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({ data: [{ id: "fixture", name: "Fixture" }] }),
      );
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    if (paused)
      await new Promise<void>((resolve) => {
        waiting.add(resolve);
      });
    if (response.destroyed) return;
    let schema = body.response_format?.json_schema?.schema;
    for (const message of body.messages ?? [])
      if (
        typeof message.content === "string" &&
        message.content.startsWith("Required final JSON schema:")
      )
        schema = JSON.parse(message.content.split("\n").slice(1).join("\n"));
    const properties = schema?.properties ?? {};
    const file = {
      path: "a.ts",
      summary: "Updates the exported constant.",
      related: [],
    };
    let result: unknown;
    if (properties.groups && properties.files)
      result = {
        groups: [
          {
            title: "Value change",
            rationale: "Constant before consumers",
            index: 0,
          },
        ],
        files: [{ ...file, groupIndex: 0, beforePath: null }],
      };
    else if (properties.groups)
      result = {
        groups: [
          {
            title: "Value change",
            rationale: "Constant before consumers",
            files:
              properties.groups.items?.properties?.files?.items?.type ===
              "integer"
                ? [0]
                : [file],
          },
        ],
      };
    else if (properties.files)
      result = { files: [{ path: "a.ts", findings: [] }], limitations: [] };
    else
      result = {
        findings: [],
        limitations: ["Deterministic provider; not a model quality evaluation"],
        fixAllPrompt: "No fixes needed.",
      };
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        id: "fixture",
        object: "chat.completion",
        created: 1,
        model: "fixture",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: JSON.stringify(result) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as { port: number };
  const release = () => {
    paused = false;
    for (const resume of waiting) resume();
    waiting.clear();
  };
  return {
    origin: `http://127.0.0.1:${port}`,
    pause: () => {
      paused = true;
    },
    release,
    stop: async () => {
      release();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};
