import { afterEach, expect, test } from "vitest";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inspectRepository } from "@senslop/review-core/git";
import { captureSources } from "../frozen-context";
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
