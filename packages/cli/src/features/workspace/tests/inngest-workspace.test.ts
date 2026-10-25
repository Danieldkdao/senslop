import { expect, test } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { startLocalApp } from "../local-app";
import { createAnalysisFixtureResult } from "./analysis-provider";

// This opt-in starts the packaged server and real engine with a deterministic test provider.
test.skipIf(process.env.RUN_LOCAL_AI_TESTS !== "1")(
  "packaged local engine groups and reviews without a browser connection",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "senslop-ai-integration-"));
    const git = (...args: string[]) =>
      promisify(execFile)("git", args, { cwd: directory });
    await git("init", "-q");
    await git("config", "user.name", "Fixture");
    await git("config", "user.email", "fixture@example.com");
    await writeFile(join(directory, "a.ts"), "export const a = 1;\n");
    await git("add", ".");
    await git("commit", "-qm", "fixture");
    const base = (await git("rev-parse", "HEAD")).stdout.trim();
    await writeFile(join(directory, "a.ts"), "export const a = 2;\n");
    await git("add", ".");
    await git("commit", "-qm", "change");
    const head = (await git("rev-parse", "HEAD")).stdout.trim();
    let pauseNext = false;
    let paused!: () => void;
    let resume!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      paused = resolve;
    });
    const providerResume = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const provider = createServer(async (request, response) => {
      const buffers: Buffer[] = [];
      for await (const part of request) buffers.push(part);
      const body = JSON.parse(Buffer.concat(buffers).toString() || "{}");
      if (body.stream) {
        response.setHeader("Content-Type", "text/event-stream");
        response.end(
          `data: ${JSON.stringify({ id: "stream", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: { role: "assistant", content: "### Explanation\nThe changed constant is two." }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "stream", object: "chat.completion.chunk", created: 1, model: "fixture", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
        );
        return;
      }
      if (pauseNext) {
        pauseNext = false;
        paused();
        await providerResume;
      }
      const output = createAnalysisFixtureResult(body);
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
              message: { role: "assistant", content: JSON.stringify(output) },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        }),
      );
    });
    provider.listen(0, "127.0.0.1");
    await once(provider, "listening");
    const address = provider.address();
    if (!address || typeof address === "string")
      throw new Error("Provider failed to start.");
    let app: Awaited<ReturnType<typeof startLocalApp>> | undefined;
    try {
      app = await startLocalApp({
        repository: directory,
        dataDirectory: join(directory, "data"),
        serverPath: fileURLToPath(
          new URL(
            "../../../../dist/local-app/apps/local/server.js",
            import.meta.url,
          ),
        ),
      });
      const token = new URL(app.url).searchParams.get("token")!;
      let headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const send = async (path: string, body: object, method = "POST") => {
        const response = await fetch(app!.origin + path, {
          method,
          headers,
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as Record<string, unknown>;
        if (!response.ok) throw new Error(JSON.stringify(data));
        return data;
      };
      const saved = await send("/api/providers", {
        action: "save",
        connection: {
          provider: "llama-cpp",
          name: "Fixture",
          baseURL: `http://127.0.0.1:${address.port}/v1`,
          model: "fixture",
          contextWindow: null,
          apiKey: "",
        },
      });
      const connection = saved.connection as { id: string };
      const model = {
        connectionId: connection.id,
        modelId: "fixture",
        name: "Fixture",
      };
      await send(
        "/api/agents/settings",
        {
          groupingMode: "always",
          separate: false,
          shared: model,
          roles: { grouping: null, context: null, review: null, explain: null },
          prompt: "Group prerequisite first.",
        },
        "PUT",
      );
      await app.setSnapshot({
        protocolVersion: 1,
        source: { kind: "commit", base, head, firstParent: false },
        files: [
          {
            path: "a.ts",
            oldPath: "a.ts",
            status: "M",
            before: "export const a = 1;\n",
            after: "export const a = 2;\n",
            beforeHash: "a".repeat(64),
            afterHash: "b".repeat(64),
            binary: false,
            added: 1,
            deleted: 1,
            diff: "@@ -1 +1 @@\n-export const a = 1;\n+export const a = 2;",
          },
        ],
        excluded: [],
        id: randomUUID(),
      });
      const snapshot = (await (
        await fetch(app.origin + "/api/preview", { headers })
      ).json()) as { id: string };
      const wait = async (kind: string) => {
        const deadline = Date.now() + 60000;
        let progress: unknown;
        while (Date.now() < deadline) {
          const state = (await (
            await fetch(`${app!.origin}/api/agents?snapshotId=${snapshot.id}`, {
              headers,
            })
          ).json()) as {
            jobs: {
              id: string;
              kind: string;
              status: string;
              error: string;
              result: unknown;
            }[];
          };
          const job = state.jobs.find((job) => job.kind === kind);
          progress = job;
          if (job?.status === "completed") return job;
          if (job?.status === "failed") throw new Error(job.error);
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        throw new Error(
          `Timed out waiting for ${kind}: ${JSON.stringify(progress)}`,
        );
      };
      expect((await wait("grouping")).result).toMatchObject({
        groups: [{ title: "Value change" }],
      });
      await send("/api/agents", {
        action: "job",
        snapshotId: snapshot.id,
        kind: "review",
      });
      expect((await wait("review")).result).toMatchObject({ findings: [] });
      const conversation = await send("/api/agents", {
        action: "create",
        snapshotId: snapshot.id,
      });
      const chat = await fetch(app.origin + "/api/agents/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          conversationId: conversation.id,
          model,
          content: "Explain the constant",
        }),
      });
      expect(chat.status).toBe(200);
      expect(chat.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
      const chatStream = await chat.text();
      expect(chatStream).toContain('"type":"finish"');
      expect(chatStream).toContain('"type":"text-delta"');
      const savedConversation = (await (
        await fetch(
          `${app.origin}/api/agents?conversationId=${conversation.id}`,
          { headers },
        )
      ).json()) as {
        messages: {
          id: string;
          content: string;
          status: string;
          parts: unknown[];
        }[];
      };
      expect(savedConversation.messages.at(-1)).toMatchObject({
        content: "### Explanation\nThe changed constant is two.",
        status: "complete",
        id: expect.any(String),
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "text",
            text: "### Explanation\nThe changed constant is two.",
          }),
        ]),
      });
      expect(chatStream).toContain(savedConversation.messages.at(-1)!.id);
      const explanation = await fetch(app.origin + "/api/agents/explain", {
        method: "POST",
        headers,
        body: JSON.stringify({
          snapshotId: snapshot.id,
          path: "a.ts",
          side: "after",
          start: 1,
          end: 1,
        }),
      });
      expect(explanation.status).toBe(200);
      expect(explanation.headers.get("x-vercel-ai-ui-message-stream")).toBe(
        "v1",
      );
      expect(await explanation.text()).toContain('"type":"finish"');
      pauseNext = true;
      const pausedJob = await send("/api/agents", {
        action: "job",
        snapshotId: snapshot.id,
        kind: "review",
      });
      await Promise.race([
        providerStarted,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Review did not reach the provider")),
            10000,
          ),
        ),
      ]);
      await app.stop();
      resume();
      app = await startLocalApp({
        repository: directory,
        dataDirectory: join(directory, "data"),
        serverPath: fileURLToPath(
          new URL(
            "../../../../dist/local-app/apps/local/server.js",
            import.meta.url,
          ),
        ),
      });
      headers = {
        ...headers,
        Authorization: `Bearer ${new URL(app.url).searchParams.get("token")}`,
      };
      expect((await wait("grouping")).result).toMatchObject({
        groups: [{ title: "Value change" }],
      });
      const restoredReview = await wait("review");
      expect(restoredReview.id).toBe(pausedJob.id);
      expect(restoredReview.result).toMatchObject({ findings: [] });
    } finally {
      resume();
      await app?.stop();
      await new Promise<void>((resolve) => provider.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  },
  180000,
);
