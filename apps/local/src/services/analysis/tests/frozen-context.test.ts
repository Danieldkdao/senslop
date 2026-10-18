import { afterEach, expect, test } from "vitest";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inspectRepository } from "@senslop/review-core/git";
import { loadContext, captureSources } from "../frozen-context";
const paths: string[] = [];
afterEach(async () => {
  await Promise.all(
    paths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
test("revision context stays frozen and excludes secrets and symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "senslop-context-"));
  paths.push(root);
  const git = async (...args: string[]) =>
    promisify(execFile)("git", args, { cwd: root });
  await git("init");
  await git("config", "user.name", "Test");
  await git("config", "user.email", "test@example.com");
  await writeFile(join(root, "a.ts"), "export const a = 1;");
  await writeFile(
    join(root, "context.ts"),
    "export const context = 'original';",
  );
  await git("add", ".");
  await git("commit", "-m", "first");
  await writeFile(join(root, "a.ts"), "export const a = 2;");
  await git("add", ".");
  await git("commit", "-m", "second");
  const inspection = await inspectRepository(root, {
    kind: "commit",
    commit: "HEAD",
  });
  await writeFile(join(root, "context.ts"), "changed later");
  await writeFile(join(root, ".env"), "SECRET=value");
  await symlink("context.ts", join(root, "link.ts"));
  const captured = await captureSources(root, {
    ...inspection.snapshot,
    fingerprint: inspection.fingerprint,
  });
  expect(captured.sources["context.ts"]).toContain("original");
  expect(captured.before["a.ts"]).toContain("= 1");
  expect(captured.sources["a.ts"]).toContain("= 2");
  expect(captured.sources[".env"]).toBeUndefined();
  expect(captured.sources["link.ts"]).toBeUndefined();
  const renamed = await captureSources(root, {
    ...inspection.snapshot,
    files: [
      {
        ...inspection.snapshot.files[0]!,
        oldPath: "a.ts",
        path: "renamed.ts",
        status: "R",
      },
    ],
    fingerprint: inspection.fingerprint,
  });
  expect(renamed.before["renamed.ts"]).toContain("= 1");
  const working = await inspectRepository(root, { kind: "working-tree" });
  await writeFile(join(root, "context.ts"), "drifted");
  await expect(
    captureSources(root, {
      ...working.snapshot,
      fingerprint: working.fingerprint,
    }),
  ).rejects.toThrow(/fresh snapshot/);
});

test.each([false, true])(
  "deleted files stay available as before evidence without creating current diagnostics; legacy cache: %s",
  async (legacy) => {
    const snapshot = {
      id: "snapshot",
      hash: "hash",
      round: 1,
      files: [
        {
          path: "deleted.ts",
          before: "import { removed } from './removed';",
          after: null,
        },
        {
          path: "current.ts",
          before: "",
          after: "export const value: number = 'wrong';",
        },
      ],
    } as unknown as import("@senslop/contracts").SavedReviewSchema;
    let body = JSON.stringify({
      sources: { "current.ts": "export const value: number = 'wrong';" },
      before: { "deleted.ts": "import { removed } from './removed';" },
      limitations: [],
      hash: "hash",
      round: 1,
      ...(legacy
        ? {
            analysis: {
              edges: [],
              symbols: [],
              diagnostics: [
                {
                  path: "deleted.ts",
                  line: 1,
                  code: 9999,
                  message: "stale",
                  severity: "error",
                },
              ],
              cycles: [],
              limitations: [],
            },
          }
        : {}),
    });
    let writes = 0;
    const store = {
      getReview: () => snapshot,
      database: {
        prepare: () => ({
          get: () => ({ body }),
          run: (value: unknown) => {
            body = String(value);
            writes++;
          },
        }),
      },
    } as unknown as import("@senslop/review-core/storage").LocalStore;
    const context = await loadContext(store, "/unused", snapshot);
    expect(
      context.analysis.diagnostics.some((d) => d.path === "deleted.ts"),
    ).toBe(false);
    expect(
      context.analysis.diagnostics.some(
        (d) => d.path === "current.ts" && d.code === 2322,
      ),
    ).toBe(true);
    expect(context.before["deleted.ts"]).toContain("removed");
    expect(writes).toBe(1);
    await loadContext(store, "/unused", snapshot);
    expect(writes).toBe(1);
  },
);
