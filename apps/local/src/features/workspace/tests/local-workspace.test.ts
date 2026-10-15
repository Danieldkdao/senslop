import { afterEach, expect, test, vi } from "vitest";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
  readFile,
  unlink,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { AgentStore } from "../../agents/lib/agent-store";
import { LocalWorkspace } from "../lib/local-workspace";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("a delayed handoff cannot delete the next terminal snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-handoff-race-"));
  directories.push(directory);
  const repository = await realpath(directory);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repository });
  git("init");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  await writeFile(join(repository, "file.ts"), "one\n");
  git("add", ".");
  git("commit", "-m", "first");
  const options = {
    repository,
    databasePath: join(directory, "data/reviews.sqlite"),
    snapshotPath: join(directory, "handoff.json"),
  };
  const workspace = new LocalWorkspace(options);
  try {
    const saved = await workspace.inspect({ kind: "commit", commit: "HEAD" });
    const first = {
      ...saved,
      id: crypto.randomUUID(),
      repositoryFingerprint: null,
    };
    const second = { ...saved, id: crypto.randomUUID() };
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    let resume!: (
      value: Awaited<ReturnType<typeof workspace.repository>>,
    ) => void;
    const resumed = new Promise<
      Awaited<ReturnType<typeof workspace.repository>>
    >((resolve) => {
      resume = resolve;
    });
    const repositoryState = await workspace.repository();
    vi.spyOn(workspace, "repository").mockImplementationOnce(() => {
      enter();
      return resumed;
    });
    await writeFile(options.snapshotPath, JSON.stringify(first));
    const current = workspace.current();
    await entered;
    await writeFile(options.snapshotPath, JSON.stringify(second));
    resume(repositoryState);
    expect((await current)?.id).toBe(first.id);
    expect((await workspace.current())?.id).toBe(second.id);
    await expect(readFile(options.snapshotPath)).rejects.toThrow();
  } finally {
    workspace.close();
  }
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
  const agents = new AgentStore(workspace.store, repository);
  expect(agents.settings().groupingMode).toBe("never");
  const saved = await workspace.inspect(
    { kind: "commit", commit: "HEAD" },
    false,
  );
  expect(saved.groupingEnabled).toBe(false);
  agents.saveSettings({ ...agents.settings(), groupingMode: "never" });
  const plain = await workspace.inspect({ kind: "working-tree" }, true);
  expect(plain.groupingEnabled).toBe(false);
  expect(() => agents.createJob(plain.id, "grouping")).toThrow(/disabled/);
  agents.saveSettings({
    ...agents.settings(),
    groupingMode: "ask",
    shared: {
      connectionId: crypto.randomUUID(),
      modelId: "test",
      name: "Test",
    },
  });
  expect(
    (await workspace.inspect({ kind: "working-tree" }, false)).groupingEnabled,
  ).toBe(false);
  expect(
    (await workspace.inspect({ kind: "working-tree" }, true)).groupingEnabled,
  ).toBe(true);
  expect(workspace.store.getReview(repository, plain.id)?.groupingEnabled).toBe(
    false,
  );
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
  workspace.store.openReview(repository, saved.id);
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

const syncWorkspace = async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-resync-"));
  directories.push(directory);
  await mkdir(join(directory, "repo"));
  const repository = await realpath(join(directory, "repo"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repository, encoding: "utf8" });
  git("init", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  await writeFile(join(repository, "a.ts"), "export const a = 0;\n");
  await writeFile(join(repository, "b.ts"), "export const b = 0;\n");
  git("add", ".");
  git("commit", "-m", "baseline");
  const workspace = new LocalWorkspace({
    repository,
    databasePath: join(directory, "data/reviews.sqlite"),
    snapshotPath: join(directory, "handoff.json"),
  });
  return { workspace, repository, git };
};

test("re-sync advances the captured baseline across rounds without changing Git, and retains reviewed rounds and notes", async () => {
  const { workspace, repository, git } = await syncWorkspace();
  try {
    await writeFile(join(repository, "a.ts"), "export const a = 1;\n");
    await writeFile(join(repository, "b.ts"), "export const b = 1;\n");
    const first = await workspace.inspect({ kind: "working-tree" });
    workspace.store.changeReview(repository, first.id, {
      action: "rename",
      title: "Feature",
    });
    const note = {
      id: crypto.randomUUID(),
      previewId: first.id,
      path: "a.ts",
      body: "Round one",
      line: {
        side: "additions" as const,
        lineNumber: 1,
        code: "export const a = 1;",
      },
    };
    workspace.store.changeReview(repository, first.id, {
      action: "add-note",
      note,
    });
    await writeFile(join(repository, "a.ts"), "export const a = 2;\n");
    git("add", "a.ts");
    const status = git("status", "--porcelain=v1");
    const index = git("write-tree");
    const second = await workspace.resync(first.id);
    expect(second.title).toBe("Feature");
    expect(second.previousReviewId).toBe(first.id);
    expect(second.round).toBe(2);
    expect(second.files.map((file) => file.path)).toEqual(["a.ts"]);
    expect(second.files[0]).toMatchObject({
      before: "export const a = 1;\n",
      after: "export const a = 2;\n",
    });
    expect(second.completedPaths).toEqual([]);
    expect(workspace.store.getReview(repository, first.id)?.notes).toEqual([
      note,
    ]);
    expect(
      workspace.store.getReview(repository, first.id)?.completedPaths,
    ).toEqual(["a.ts", "b.ts"]);
    expect(git("status", "--porcelain=v1")).toBe(status);
    expect(git("write-tree")).toBe(index);
    await expect(workspace.resync(first.id)).rejects.toThrow(/active|current/i);
    await expect(workspace.resync(second.id)).rejects.toThrow(/No new changes/);
    expect((await workspace.current())?.id).toBe(second.id);
    await writeFile(join(repository, "b.ts"), "export const b = 2;\n");
    const third = await workspace.resync(second.id);
    expect(third.round).toBe(3);
    expect(third.files.map((file) => file.path)).toEqual(["b.ts"]);
    expect(third.files[0]?.before).toBe("export const b = 1;\n");
    const context = JSON.parse(
      String(
        workspace.store.database
          .prepare("SELECT body FROM ai_context WHERE snapshot_id = ?")
          .get(third.id)?.body,
      ),
    );
    expect(context.before["a.ts"]).toBe("export const a = 2;\n");
    expect(context.before["b.ts"]).toBe("export const b = 1;\n");
  } finally {
    workspace.close();
  }
});

test("re-sync includes reversions, new files, deletions, and renames relative to the last round", async () => {
  const { workspace, repository } = await syncWorkspace();
  try {
    await writeFile(join(repository, "a.ts"), "export const a = 1;\n");
    await writeFile(join(repository, "new.ts"), "new\n");
    const first = await workspace.inspect({ kind: "working-tree" });
    await writeFile(join(repository, "a.ts"), "export const a = 0;\n");
    await rename(join(repository, "new.ts"), join(repository, "renamed.ts"));
    await unlink(join(repository, "b.ts"));
    const second = await workspace.resync(first.id);
    expect(second.files.find((file) => file.path === "a.ts")).toMatchObject({
      before: "export const a = 1;\n",
      after: "export const a = 0;\n",
      status: "M",
    });
    expect(second.files.find((file) => file.path === "new.ts")).toMatchObject({
      before: "new\n",
      after: null,
      status: "D",
    });
    expect(
      second.files.find((file) => file.path === "renamed.ts"),
    ).toMatchObject({ before: null, after: "new\n", status: "A" });
    expect(second.files.find((file) => file.path === "b.ts")).toMatchObject({
      before: "export const b = 0;\n",
      after: null,
      status: "D",
    });
  } finally {
    workspace.close();
  }
});

test("re-sync refuses mismatched branch, HEAD, unsupported sources, and legacy reviews without identity", async () => {
  const { workspace, repository, git } = await syncWorkspace();
  try {
    const commit = await workspace.inspect({ kind: "commit", commit: "HEAD" });
    await expect(workspace.resync(commit.id)).rejects.toThrow(/uncommitted/i);
    await writeFile(join(repository, "a.ts"), "one\n");
    const first = await workspace.inspect({ kind: "working-tree" });
    git("switch", "-c", "other");
    await expect(workspace.resync(first.id)).rejects.toThrow(/branch|HEAD/);
    git("switch", "main");
    git("commit", "--allow-empty", "-m", "move HEAD");
    await expect(workspace.resync(first.id)).rejects.toThrow(/branch|HEAD/);
    expect(
      workspace.store.getReview(repository, first.id)?.completedPaths,
    ).toEqual([]);
    const legacy = workspace.store.saveReview(
      repository,
      { ...first, id: crypto.randomUUID() },
      first.fingerprint,
    );
    await expect(workspace.resync(legacy.id)).rejects.toThrow(
      /identity|fresh|uncommitted/i,
    );
  } finally {
    workspace.close();
  }
});

test("a missing grouping model never blocks inspection even when a saved preference requests grouping", async () => {
  const { workspace, repository } = await syncWorkspace();
  try {
    const agents = new AgentStore(workspace.store, repository);
    agents.saveSettings({ ...agents.settings(), groupingMode: "always" });
    await writeFile(join(repository, "a.ts"), "one\n");
    expect(
      (await workspace.inspect({ kind: "working-tree" })).groupingEnabled,
    ).toBe(false);
  } finally {
    workspace.close();
  }
});

test("re-sync handles an entirely restored tree and refuses publication if repository identity changes during collection", async () => {
  const { workspace, repository, git } = await syncWorkspace();
  try {
    await writeFile(join(repository, "a.ts"), "one\n");
    const first = await workspace.inspect({ kind: "working-tree" });
    await writeFile(join(repository, "a.ts"), "export const a = 0;\n");
    const second = await workspace.resync(first.id);
    expect(second.files[0]).toMatchObject({
      before: "one\n",
      after: "export const a = 0;\n",
    });
    expect(second.syncBaseline).toEqual([]);
    expect(git("status", "--porcelain=v1")).toBe("");
    await writeFile(join(repository, "a.ts"), "two\n");
    const third = await workspace.resync(second.id);
    expect(third.files[0]?.before).toBe("export const a = 0;\n");
    await writeFile(join(repository, "a.ts"), "three\n");
    const identity = await workspace.repository();
    const historyLength = workspace.store.listReviews(repository).length;
    vi.spyOn(workspace, "repository")
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce({ ...identity, branch: "changed" });
    await expect(workspace.resync(third.id)).rejects.toThrow(
      /changed during re-sync/,
    );
    expect(workspace.store.listReviews(repository)).toHaveLength(historyLength);
    expect(workspace.store.currentReview(repository)?.id).toBe(third.id);
    expect(
      workspace.store.getReview(repository, third.id)?.completedPaths,
    ).toEqual([]);
  } finally {
    workspace.close();
  }
});

test("re-sync retains binary hashes and compares tracked renames against their captured destination", async () => {
  const { workspace, repository, git } = await syncWorkspace();
  try {
    await writeFile(join(repository, "image.bin"), Buffer.from([0, 1]));
    git("mv", "a.ts", "renamed.ts");
    const first = await workspace.inspect({ kind: "working-tree" });
    await writeFile(join(repository, "renamed.ts"), "renamed changed\n");
    await writeFile(join(repository, "image.bin"), Buffer.from([0, 2]));
    const second = await workspace.resync(first.id);
    expect(second.files.map((file) => file.path)).toEqual([
      "image.bin",
      "renamed.ts",
    ]);
    expect(
      second.files.find((file) => file.path === "renamed.ts"),
    ).toMatchObject({
      before: "export const a = 0;\n",
      after: "renamed changed\n",
      status: "M",
    });
    const binary = second.files.find((file) => file.path === "image.bin")!;
    expect(binary).toMatchObject({
      binary: true,
      before: null,
      after: null,
      status: "M",
    });
    expect(binary.beforeHash).not.toBe(binary.afterHash);
  } finally {
    workspace.close();
  }
});

test("re-sync recognizes a recreated original path after a captured rename", async () => {
  const { workspace, repository, git } = await syncWorkspace();
  try {
    git("mv", "a.ts", "renamed.ts");
    const first = await workspace.inspect({ kind: "working-tree" });
    await writeFile(join(repository, "a.ts"), "export const fresh = true;\n");
    git("add", "a.ts");
    const second = await workspace.resync(first.id);
    expect(second.files).toHaveLength(1);
    expect(second.files[0]).toMatchObject({
      path: "a.ts",
      before: null,
      after: "export const fresh = true;\n",
      status: "A",
    });
  } finally {
    workspace.close();
  }
});

test("cumulative re-sync preserves the round baseline, notes, completion and follows current grouping settings", async () => {
  const { workspace, repository, git } = await syncWorkspace();
  try {
    await writeFile(join(repository, "a.ts"), "export const a = 1;\n");
    await writeFile(join(repository, "b.ts"), "export const b = 1;\n");
    const first = await workspace.inspect({ kind: "working-tree" });
    workspace.store.changeReview(repository, first.id, {
      action: "complete",
      path: "b.ts",
      complete: true,
    });
    const note = {
      id: crypto.randomUUID(),
      previewId: first.id,
      path: "b.ts",
      body: "Keep",
      line: null,
    };
    workspace.store.changeReview(repository, first.id, {
      action: "add-note",
      note,
    });
    await writeFile(join(repository, "a.ts"), "export const a = 2;\n");
    const status = git("status", "--porcelain=v1");
    const second = await workspace.resync(first.id, "keep");
    expect(second.files.map((file) => file.path)).toEqual(["a.ts", "b.ts"]);
    expect(second.files[0]?.before).toBe("export const a = 0;\n");
    expect(second.completedPaths).toEqual(["b.ts"]);
    expect(second.notes).toEqual([{ ...note, previewId: second.id }]);
    expect(
      workspace.store.getReview(repository, first.id)?.completedPaths,
    ).toEqual(["b.ts"]);
    expect(git("status", "--porcelain=v1")).toBe(status);
    await writeFile(join(repository, "b.ts"), "export const b = 2;\n");
    const third = await workspace.resync(second.id, "new");
    expect(third.files.map((file) => file.path)).toEqual(["b.ts"]);
    expect(third.files[0]?.before).toBe("export const b = 1;\n");
    await writeFile(join(repository, "b.ts"), "export const b = 3;\n");
    const fourth = await workspace.resync(third.id, "keep");
    expect(fourth.files[0]?.before).toBe("export const b = 1;\n");
  } finally {
    workspace.close();
  }
});

test("cumulative re-sync drops reverted additions and removed files and can produce an empty review", async () => {
  const { workspace, repository } = await syncWorkspace();
  try {
    await writeFile(join(repository, "a.ts"), "export const a = 1;\n");
    await writeFile(join(repository, "new.ts"), "new\n");
    const first = await workspace.inspect({ kind: "working-tree" });
    await writeFile(join(repository, "a.ts"), "export const a = 0;\n");
    await unlink(join(repository, "new.ts"));
    const second = await workspace.resync(first.id, "keep");
    expect(second.files).toEqual([]);
    expect(second.groupingEnabled).toBe(false);
  } finally {
    workspace.close();
  }
});

test("each re-sync applies the current always, never and ask grouping preference", async () => {
  const { workspace, repository } = await syncWorkspace();
  try {
    const agents = new AgentStore(workspace.store, repository);
    agents.saveSettings({
      ...agents.settings(),
      shared: {
        connectionId: crypto.randomUUID(),
        modelId: "fixture",
        name: "Fixture",
      },
      groupingMode: "never",
    });
    await writeFile(join(repository, "a.ts"), "export const a = 1;\n");
    let round = await workspace.inspect({ kind: "working-tree" });
    for (const [index, mode, chosen, expected] of [
      [2, "always", false, true],
      [3, "never", true, false],
      [4, "ask", false, false],
      [5, "ask", true, true],
    ] as const) {
      agents.saveSettings({ ...agents.settings(), groupingMode: mode });
      await writeFile(join(repository, "a.ts"), `export const a = ${index};\n`);
      round = await workspace.resync(round.id, "keep", chosen);
      expect(round.groupingEnabled).toBe(expected);
    }
  } finally {
    workspace.close();
  }
});
