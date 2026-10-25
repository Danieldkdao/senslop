import { expect, test } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  realpath,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { startLocalApp } from "../local-app";
import { connectWorkspace } from "../workspace-client";
import { executeReviewCommand } from "../../reviews/commands";
import { parseCliCommand } from "../../commands/parse-command";
import { startAnalysisProvider } from "./analysis-provider";

// Opt-in tooling starts the built app, real engine, and a deterministic loopback provider.
test.skipIf(process.env.RUN_LOCAL_AI_TESTS !== "1")(
  "the packaged CLI fixes one finding, verifies exact source, and preserves the other finding",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "senslop-fix-verify-app-"));
    const root = join(await realpath(directory), "repo");
    await mkdir(root);
    const git = (...args: string[]) =>
      promisify(execFile)("git", args, { cwd: root });
    await git("init", "-qb", "main");
    await git("config", "user.name", "Fixture");
    await git("config", "user.email", "fixture@example.test");
    await writeFile(
      join(root, "a.ts"),
      "export const a = 1;\nexport const b = 1;\n",
    );
    await git("add", ".");
    await git("commit", "-qm", "baseline");
    await writeFile(
      join(root, "a.ts"),
      "export const a = 2;\nexport const b = 2;\n",
    );
    const provider = await startAnalysisProvider(
      [1, 2].map((line) => ({
        title: `Fixture issue ${line}`,
        severity: "high",
        problem:
          "Deterministic workflow fixture; not an evaluation of diagnosis quality.",
        path: "a.ts",
        side: "after",
        start: line,
        end: line,
        code: `export const ${line === 1 ? "a" : "b"} = 2;`,
        fixPrompt: "Apply only the requested fixture fix.",
      })),
    );
    let app: Awaited<ReturnType<typeof startLocalApp>> | undefined;
    try {
      app = await startLocalApp({
        repository: root,
        dataDirectory: join(directory, "data"),
        serverPath: fileURLToPath(
          new URL(
            "../../../../dist/local-app/apps/local/server.js",
            import.meta.url,
          ),
        ),
      });
      const client = await connectWorkspace(root, join(directory, "data"));
      const cliPath = fileURLToPath(
        new URL("../../../../dist/index.js", import.meta.url),
      );
      const cli = async (...args: string[]) => {
        // Suppress browser navigation on creation; exercise the built CLI for subsequent commands.
        if (args[0] === "reviews" && args[1] === "create")
          return executeReviewCommand(
            client,
            parseCliCommand(args),
            async () => {},
          );
        const result = await promisify(execFile)(
          process.execPath,
          [cliPath, ...args, "--repo", root, "--json"],
          {
            env: {
              ...process.env,
              SENSLOP_DATA_DIRECTORY: join(directory, "data"),
            },
            timeout: 60000,
            maxBuffer: 5 * 1024 * 1024,
          },
        );
        return JSON.parse(result.stdout) as unknown;
      };
      const saved = await client.request<{ connection: { id: string } }>(
        "/api/providers",
        {
          action: "save",
          connection: {
            provider: "llama-cpp",
            name: "Fixture",
            baseURL: `${provider.origin}/v1`,
            model: "fixture",
            contextWindow: null,
            apiKey: "",
          },
        },
      );
      await client.request(
        "/api/agents/settings",
        {
          shared: {
            connectionId: saved.connection.id,
            modelId: "fixture",
            name: "Fixture",
          },
        },
        "PATCH",
      );
      const handoff = (await cli(
        "reviews",
        "create",
        "--working-tree",
        "--no-group",
        "--run-review",
        "--wait",
        "--timeout",
        "30",
      )) as { id: string };
      const findings = (await cli("findings", "list", handoff.id)) as {
        id: string;
        decision: string;
      }[];
      expect(findings).toHaveLength(2);
      await cli(
        "findings",
        "decide",
        handoff.id,
        findings[0]!.id,
        "--status",
        "accepted",
      );
      const task = (await cli(
        "tasks",
        "create",
        handoff.id,
        "--findings",
        findings[0]!.id,
      )) as { id: string; directory: string };
      await cli("tasks", "claim", task.id, "--agent-name", "Fixture agent");
      await writeFile(
        join(task.directory, "a.ts"),
        "export const a = 3;\nexport const b = 2;\n",
      );
      await cli("tasks", "return", task.id);
      expect(await readFile(join(root, "a.ts"), "utf8")).toContain("a = 2");
      await cli("tasks", "apply", task.id, "--paths", "a.ts", "--yes");
      expect(await readFile(join(root, "a.ts"), "utf8")).toBe(
        "export const a = 3;\nexport const b = 2;\n",
      );
      const check = (await cli(
        "checks",
        "run",
        handoff.id,
        "--command",
        "node -e \"const s=require('fs').readFileSync('a.ts','utf8');if(!s.includes('a = 3')||!s.includes('b = 2'))process.exit(1)\"",
        "--findings",
        findings[0]!.id,
        "--compare-base",
      )) as { id: string };
      expect(
        await cli("checks", "watch", check.id, "--timeout", "30"),
      ).toMatchObject({
        status: "passed",
        review: { round: 2 },
        sourceModified: false,
      });
      await cli(
        "findings",
        "verify",
        handoff.id,
        "--findings",
        findings[0]!.id,
      );
      let runs: { status: string }[] = [];
      for (let attempt = 0; attempt < 100; attempt++) {
        runs = (await cli("verifications", "list", handoff.id)) as {
          status: string;
        }[];
        if (runs[0]?.status === "completed" || runs[0]?.status === "failed")
          break;
        await sleep(200);
      }
      expect(runs[0]?.status).toBe("completed");
      const updated = (await cli("findings", "list", handoff.id)) as {
        id: string;
        decision: string;
        assessment: { outcome: string; checkIds: string[] } | null;
      }[];
      expect(
        updated.find((finding) => finding.id === findings[0]!.id),
      ).toMatchObject({
        decision: "accepted",
        assessment: { outcome: "apparently-fixed", checkIds: [check.id] },
      });
      expect(
        updated.find((finding) => finding.id === findings[1]!.id)?.decision,
      ).toBe("open");
      expect(
        await cli("rounds", "show", handoff.id, "--round", "1"),
      ).toMatchObject({
        files: [{ after: "export const a = 2;\nexport const b = 2;\n" }],
      });
      expect(
        ((await cli("usage", "show", handoff.id)) as unknown[]).length,
      ).toBeGreaterThan(0);
    } finally {
      await app?.stop();
      await provider.stop();
      await rm(directory, { recursive: true, force: true });
    }
  },
  120000,
);
