import { afterEach, expect, test } from "vitest";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
  readFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { LocalWorkspace } from "../lib/local-workspace";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
test("browser inspection is repository-bound, restarts restore reviews, and terminal handoffs are disposable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-workspace-history-"));
  directories.push(directory);
  await mkdir(join(directory, "repo"));
  const repository = await realpath(join(directory, "repo"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repository });
  git("init");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  await writeFile(join(repository, "file.ts"), "one\n");
  git("add", ".");
  git("commit", "-m", "first");
  await writeFile(join(repository, "file.ts"), "two\n");
  const options = {
    repository,
    databasePath: join(directory, "data/reviews.sqlite"),
    snapshotPath: join(directory, "handoff.json"),
  };
  let workspace = new LocalWorkspace(options);
  const saved = await workspace.inspect({ kind: "commit", commit: "HEAD" });
  expect(saved.files.some((file) => file.path === "file.ts")).toBe(true);
  await expect(
    workspace.inspect({
      kind: "commit",
      commit: "HEAD",
      cwd: "/elsewhere",
    } as never),
  ).rejects.toThrow();
  workspace.store.changeReview(await workspace.root(), saved.id, {
    action: "rename",
    title: "Saved in browser",
  });
  workspace.close();
  workspace = new LocalWorkspace(options);
  try {
    expect((await workspace.current())?.title).toBe("Saved in browser");
    const handoff = { ...saved, id: crypto.randomUUID() };
    await writeFile(options.snapshotPath, JSON.stringify(handoff));
    expect((await workspace.current())?.id).toBe(handoff.id);
    await expect(readFile(options.snapshotPath)).rejects.toThrow();
    workspace.store.deleteReview(await workspace.root(), handoff.id);
    expect(await workspace.current()).toBeNull();
  } finally {
    workspace.close();
  }
});
