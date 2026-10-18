import { expect, test } from "vitest";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { startAnalysisProvider } from "../src/features/workspace/tests/analysis-provider";

const execute = promisify(execFile);

// Opt-in tooling starts the real bundled app and engine in an isolated data directory.
test.skipIf(process.env.SENSLOP_AGENT_TEST !== "1")(
  "an independent agent can prepare, inspect, sync, configure and stop the bundled workspace through the CLI",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "senslop-agent-test-"));
    const repository = join(directory, "repo");
    await mkdir(repository);
    const git = (...args: string[]) =>
      execute("git", args, { cwd: repository });
    await git("init", "-q");
    await git("config", "user.name", "Fixture");
    await git("config", "user.email", "fixture@example.com");
    await writeFile(join(repository, "a.ts"), "export const a = 1;\n");
    await git("add", ".");
    await git("commit", "-qm", "fixture");
    await writeFile(join(repository, "a.ts"), "export const a = 2;\n");
    // Test tooling can target a clean npm installation instead of the checkout bundle.
    const cliPath =
      process.env.SENSLOP_AGENT_CLI ??
      fileURLToPath(new URL("../dist/index.js", import.meta.url));
    const env = {
      ...process.env,
      SENSLOP_DATA_DIRECTORY: join(directory, "data"),
    };
    const cli = async (...args: string[]) => {
      const result = await execute(
        process.execPath,
        [cliPath, ...args, "--repo", repository, "--json"],
        { env, timeout: 60000, maxBuffer: 5 * 1024 * 1024 },
      );
      return JSON.parse(result.stdout);
    };
    const provider = await startAnalysisProvider();
    const app = spawn(
      process.execPath,
      [cliPath, "app", "start", "--repo", repository, "--json", "--no-open"],
      { env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let logs = "";
    app.stderr.on("data", (chunk) => {
      logs = (logs + String(chunk)).slice(-12000);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`App startup timed out: ${logs}`)),
          30000,
        );
        app.once("exit", (code) => {
          clearTimeout(timeout);
          reject(new Error(`App exited ${code}: ${logs}`));
        });
        app.stdout.on("data", (chunk) => {
          if (String(chunk).includes('"running":true')) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      expect((await cli("app", "status")).running).toBe(true);
      const saved = await cli(
        "providers",
        "save",
        "--provider",
        "llama-cpp",
        "--endpoint",
        `${provider.origin}/v1`,
      );
      expect(saved.check.ok).toBe(true);
      const connectionId = saved.connection.id;
      await cli("providers", "default", connectionId);
      expect(
        (await cli("providers", "models", connectionId)).models[0].id,
      ).toBe("fixture");
      await cli(
        "settings",
        "set",
        "shared",
        JSON.stringify({ connectionId, modelId: "fixture", name: "Fixture" }),
      );
      await cli("settings", "set", "groupingMode", "never");
      const handoff = await cli(
        "reviews",
        "create",
        "--working-tree",
        "--group",
        "--wait",
        "--timeout",
        "30",
      );
      const id = handoff.id;
      expect(handoff.preparation.grouping.status).toBe("completed");
      expect(handoff.url).not.toContain("token");
      expect((await cli("reviews", "list")).history[0].id).toBe(id);
      expect((await cli("reviews", "files", id))[0].path).toBe("a.ts");
      expect(
        await cli("reviews", "diff", id, "--file", "a.ts", "--side", "before"),
      ).toBe("export const a = 1;\n");
      expect((await cli("groups", "show", id)).result.groups[0].title).toBe(
        "Value change",
      );
      await cli("reviews", "rename", id, "Agent snapshot");
      await cli(
        "notes",
        "add",
        id,
        "a.ts",
        "--body",
        "Agent note",
        "--side",
        "after",
        "--start",
        "1",
      );
      const noteId = (await cli("notes", "list", id))[0].id;
      await cli("notes", "edit", id, noteId, "--body", "Updated note");
      await cli("reviews", "complete", id, "a.ts");
      expect((await cli("reviews", "show", id)).completedPaths).toEqual([
        "a.ts",
      ]);
      await cli("reviews", "incomplete", id, "a.ts");
      const run = await cli("reviews", "run", id, "--wait", "--timeout", "30");
      expect(run.status).toBe("completed");
      expect(run.result.findings).toEqual([]);
      expect((await cli("runs", "export", run.id)).result.fixAllPrompt).toBe(
        "No fixes needed.",
      );
      await cli("runs", "rename", run.id, "Agent findings");
      await cli(
        "settings",
        "set",
        "autoAdvance",
        "true",
        "--section",
        "review",
      );
      await cli("settings", "set", "view", "unified", "--section", "ui");
      expect((await cli("settings", "show", "--section", "ui")).view).toBe(
        "unified",
      );
      await writeFile(join(repository, "a.ts"), "export const a = 3;\n");
      const synced = await cli(
        "reviews",
        "sync",
        id,
        "--mode",
        "keep",
        "--group",
        "--wait",
        "--timeout",
        "30",
      );
      expect(synced.id).toBe(id);
      expect(synced.review.round).toBe(2);
      expect(synced.review.notes[0].body).toBe("Updated note");
      await writeFile(join(repository, "a.ts"), "export const a = 4;\n");
      const newer = await cli(
        "reviews",
        "sync",
        id,
        "--mode",
        "new",
        "--no-group",
      );
      expect(newer.id).not.toBe(id);
      await cli("reviews", "select", id, "a.ts");
      expect((await cli("reviews", "show", "current")).id).toBe(id);
      expect((await cli("reviews", "export", id)).runs.length).toBeGreaterThan(
        0,
      );
      provider.pause();
      const pending = await cli("reviews", "run", newer.id);
      await cli("runs", "cancel", pending.id);
      await expect(
        cli("runs", "watch", pending.id, "--timeout", "2"),
      ).rejects.toMatchObject({ code: 4 });
      provider.release();
      expect(
        (await cli("runs", "retry", pending.id, "--wait", "--timeout", "30"))
          .status,
      ).toBe("completed");
      const installed = await cli("skills", "install", "--agent", "agents");
      expect(await readFile(installed.path, "utf8")).toContain(
        "name: senslop-review",
      );
      await cli("notes", "delete", id, noteId, "--yes");
      await cli("runs", "delete", run.id, "--yes");
      await cli("reviews", "delete", id, "--yes");
      await cli("providers", "delete", connectionId, "--yes");
      const stopped = once(app, "exit");
      expect((await cli("app", "stop")).stopped).toBe(true);
      await stopped;
    } finally {
      if (app.exitCode === null && app.signalCode === null) {
        const closed = once(app, "exit");
        app.kill("SIGTERM");
        await closed;
      }
      await provider.stop();
      await rm(directory, { recursive: true, force: true });
    }
  },
  180000,
);
