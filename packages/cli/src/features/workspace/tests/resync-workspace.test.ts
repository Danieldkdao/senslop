import { expect, test } from "vitest";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { savedReviewSchema } from "@senslop/contracts";
import { startLocalApp } from "../local-app";

// This opt-in exercises the packaged routes with no configured models or network provider.
test.skipIf(process.env.RUN_LOCAL_AI_TESTS !== "1")(
  "packaged workspace re-syncs repeated uncommitted rounds without models or Git mutations",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "senslop-resync-app-"));
    await mkdir(join(directory, "repo"));
    const repository = await realpath(join(directory, "repo"));
    const git = (...args: string[]) =>
      promisify(execFile)("git", args, { cwd: repository });
    await git("init", "-qb", "main");
    await git("config", "user.name", "Fixture");
    await git("config", "user.email", "fixture@example.com");
    await writeFile(join(repository, "a.ts"), "export const a = 0;\n");
    await git("add", ".");
    await git("commit", "-qm", "baseline");
    let app: Awaited<ReturnType<typeof startLocalApp>> | undefined;
    try {
      app = await startLocalApp({
        repository,
        dataDirectory: join(directory, "data"),
        jobs: false,
        serverPath: fileURLToPath(
          new URL(
            "../../../../dist/local-app/apps/local/server.js",
            import.meta.url,
          ),
        ),
      });
      const headers = {
        Authorization: `Bearer ${new URL(app.url).searchParams.get("token")}`,
        "Content-Type": "application/json",
      };
      const send = async (body: object) => {
        const response = await fetch(`${app!.origin}/api/workspace`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        expect(response.status).toBe(200);
        return savedReviewSchema.parse(await response.json());
      };
      await writeFile(join(repository, "a.ts"), "export const a = 1;\n");
      const first = await send({
        action: "inspect",
        source: { kind: "working-tree" },
      });
      expect(first.groupingEnabled).toBe(false);
      expect(first.repositoryState?.branch).toBe("main");
      await writeFile(join(repository, "a.ts"), "export const a = 2;\n");
      const status = (await git("status", "--porcelain=v1")).stdout;
      const second = await send({ action: "resync", id: first.id });
      expect(second.files[0]).toMatchObject({
        before: "export const a = 1;\n",
        after: "export const a = 2;\n",
      });
      expect(second.round).toBe(2);
      expect((await git("status", "--porcelain=v1")).stdout).toBe(status);
      const state = await fetch(
        `${app.origin}/api/agents?snapshotId=${second.id}`,
        { headers },
      );
      expect(state.status).toBe(200);
      expect(await state.json()).toMatchObject({ jobs: [] });
      await app.stop();
      app = await startLocalApp({
        repository,
        dataDirectory: join(directory, "data"),
        jobs: false,
        serverPath: fileURLToPath(
          new URL(
            "../../../../dist/local-app/apps/local/server.js",
            import.meta.url,
          ),
        ),
      });
      const restartHeaders = {
        Authorization: `Bearer ${new URL(app.url).searchParams.get("token")}`,
        "Content-Type": "application/json",
      };
      const reopened = savedReviewSchema.parse(
        await (
          await fetch(`${app.origin}/api/preview`, { headers: restartHeaders })
        ).json(),
      );
      expect(reopened.id).toBe(second.id);
      await writeFile(join(repository, "a.ts"), "export const a = 3;\n");
      const next = await fetch(`${app.origin}/api/workspace`, {
        method: "POST",
        headers: restartHeaders,
        body: JSON.stringify({ action: "resync", id: reopened.id }),
      });
      expect(next.status).toBe(200);
      const third = savedReviewSchema.parse(await next.json());
      expect(third.round).toBe(3);
      expect(third.files[0]?.before).toBe("export const a = 2;\n");
    } finally {
      await app?.stop();
      await rm(directory, { recursive: true, force: true });
    }
  },
  60000,
);
