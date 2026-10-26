import { afterEach, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStore } from "../../../db/local-store";
import { collectSnapshot } from "../../git/snapshot";
import { GitOperations } from "../git-operations";

const paths: string[] = [];
afterEach(() =>
  paths
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true })),
);
const setup = () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-git-"));
  paths.push(directory);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  writeFileSync(join(directory, "one.txt"), "one\n");
  writeFileSync(join(directory, "two.txt"), "two\n");
  git("add", ".");
  git("commit", "-qm", "initial");
  const store = new LocalStore(join(directory, ".git", "senslop.sqlite"));
  return {
    directory,
    git,
    store,
    service: new GitOperations(store, directory),
  };
};

test("staging and committing selected content preserves unrelated edits and rejects stale previews", async () => {
  const { directory, git, store, service } = setup();
  try {
    writeFileSync(join(directory, "one.txt"), "changed one\n");
    writeFileSync(join(directory, "two.txt"), "changed two\n");
    const before = await service.status();
    await service.act({
      action: "stage",
      path: "one.txt",
      expected: before.identity,
    });
    await expect(
      service.act({
        action: "stage",
        path: "two.txt",
        expected: before.identity,
      }),
    ).rejects.toThrow(/changed/);
    const staged = await service.status();
    await service.act({
      action: "commit",
      subject: "fix: selected change",
      body: "",
      expected: staged.identity,
    });
    expect(git("show", "HEAD:one.txt")).toBe("changed one");
    expect(git("show", "HEAD:two.txt")).toBe("two");
    expect(readFileSync(join(directory, "two.txt"), "utf8")).toBe(
      "changed two\n",
    );
  } finally {
    store.close();
  }
});

test("hooks run but cannot silently change the approved commit candidate", async () => {
  const { directory, git, store, service } = setup();
  try {
    writeFileSync(join(directory, "one.txt"), "approved\n");
    git("add", "one.txt");
    const hook = join(directory, ".git/hooks/pre-commit");
    writeFileSync(
      hook,
      '#!/bin/sh\nprintf "hook edit\\n" > two.txt\ngit add two.txt\n',
    );
    chmodSync(hook, 0o755);
    const head = git("rev-parse", "HEAD");
    await expect(
      service.act({
        action: "commit",
        subject: "fix: guarded commit",
        body: "",
        expected: (await service.status()).identity,
      }),
    ).rejects.toThrow(/changed|candidate/i);
    expect(git("rev-parse", "HEAD")).toBe(head);
  } finally {
    store.close();
  }
});

test("conflicts expose frozen index sides and abort is stale guarded", async () => {
  const { directory, git, store, service } = setup();
  try {
    const branch = git("branch", "--show-current");
    git("checkout", "-qb", "incoming");
    writeFileSync(join(directory, "one.txt"), "incoming change\n");
    git("commit", "-qam", "incoming");
    git("checkout", "-q", branch);
    writeFileSync(join(directory, "one.txt"), "local change\n");
    git("commit", "-qam", "local");
    try {
      git("merge", "incoming");
    } catch {}
    const state = await service.status();
    expect(state.mergeInProgress).toBe(true);
    expect(await service.conflict("one.txt")).toEqual({
      base: "one\n",
      local: "local change\n",
      incoming: "incoming change\n",
    });
    writeFileSync(join(directory, "two.txt"), "preserve this\n");
    await expect(
      service.act({ action: "abort-merge", expected: state.identity }),
    ).rejects.toThrow(/changed/);
    await service.act({
      action: "abort-merge",
      expected: (await service.status()).identity,
    });
    expect((await service.status()).conflicts).toEqual([]);
    expect(readFileSync(join(directory, "two.txt"), "utf8")).toBe(
      "preserve this\n",
    );
  } finally {
    store.close();
  }
});

test("unborn repository preview changes when unstaged contents change", async () => {
  const directory = mkdtempSync(join(tmpdir(), "senslop-unborn-"));
  paths.push(directory);
  execFileSync("git", ["init", "-q"], { cwd: directory });
  const store = new LocalStore(join(directory, ".git", "senslop.sqlite"));
  try {
    writeFileSync(join(directory, "new.txt"), "first\n");
    const service = new GitOperations(store, directory);
    const state = await service.status();
    writeFileSync(join(directory, "new.txt"), "second longer\n");
    await expect(
      service.act({
        action: "stage",
        path: "new.txt",
        expected: state.identity,
      }),
    ).rejects.toThrow(/changed/);
  } finally {
    store.close();
  }
});

test.each([false, true])(
  "bulk staging preserves working bytes and guards stale state, unborn=%s",
  async (unborn) => {
    const { directory, git, store, service } = setup();
    try {
      if (unborn) git("update-ref", "-d", "HEAD");
      writeFileSync(join(directory, "one.txt"), "edited\n");
      writeFileSync(join(directory, "new.txt"), "new\n");
      const state = await service.status();
      await service.act({ action: "stage-all", expected: state.identity });
      expect(git("diff", "--cached", "--name-only")).toContain("new.txt");
      await expect(
        service.act({ action: "unstage-all", expected: state.identity }),
      ).rejects.toThrow(/changed/);
      await service.act({
        action: "unstage-all",
        expected: (await service.status()).identity,
      });
      expect(git("diff", "--cached", "--name-only")).toBe("");
      expect(readFileSync(join(directory, "one.txt"), "utf8")).toBe("edited\n");
    } finally {
      store.close();
    }
  },
);

test("live previews distinguish the index, HEAD and working bytes", async () => {
  const { directory, git, store, service } = setup();
  try {
    writeFileSync(join(directory, "one.txt"), "staged\n");
    git("add", "one.txt");
    writeFileSync(join(directory, "one.txt"), "working\n");
    expect(await service.preview("one.txt", true)).toMatchObject({
      before: "one\n",
      after: "staged\n",
      added: 1,
      deleted: 1,
    });
    expect(await service.preview("one.txt", false)).toMatchObject({
      before: "staged\n",
      after: "working\n",
    });
    writeFileSync(join(directory, "new.txt"), "untracked\n");
    expect(await service.preview("new.txt", false)).toMatchObject({
      status: "A",
      before: null,
      after: "untracked\n",
    });
  } finally {
    store.close();
  }
});

test("untracked file hunks stage through the same preview patch", async () => {
  const { directory, git, store, service } = setup();
  try {
    writeFileSync(join(directory, "new.txt"), "new\n");
    await service.act({
      action: "stage",
      path: "new.txt",
      hunk: 0,
      expected: (await service.status()).identity,
    });
    expect(git("show", ":new.txt")).toBe("new");
  } finally {
    store.close();
  }
});

test("staged and unstaged preview hashes match captured raw content", async () => {
  const { directory, git, store, service } = setup();
  try {
    writeFileSync(join(directory, "one.txt"), "staged é content\n");
    git("add", "one.txt");
    const stagedSnapshot = await collectSnapshot({
      cwd: directory,
      source: { kind: "working-tree" },
    });
    const stagedFile = stagedSnapshot.files.find(
      (file) => file.path === "one.txt",
    )!;
    const staged = await service.preview("one.txt", true);
    expect(staged.beforeHash).toBe(stagedFile.beforeHash);
    expect(staged.afterHash).toBe(stagedFile.afterHash);
    writeFileSync(join(directory, "one.txt"), "unstaged é content\n");
    const workingSnapshot = await collectSnapshot({
      cwd: directory,
      source: { kind: "working-tree" },
    });
    const workingFile = workingSnapshot.files.find(
      (file) => file.path === "one.txt",
    )!;
    const working = await service.preview("one.txt", false);
    expect(working.beforeHash).toBe(stagedFile.afterHash);
    expect(working.afterHash).toBe(workingFile.afterHash);
  } finally {
    store.close();
  }
});

test("binary preview hashes preserve non-UTF8 Git object bytes", async () => {
  const { directory, git, store, service } = setup();
  try {
    writeFileSync(join(directory, "one.txt"), Buffer.from([0xff, 0, 0xfe]));
    git("add", "one.txt");
    const snapshot = await collectSnapshot({
      cwd: directory,
      source: { kind: "working-tree" },
    });
    const file = snapshot.files.find((item) => item.path === "one.txt")!;
    const staged = await service.preview("one.txt", true);
    expect(staged.binary).toBe(true);
    expect(staged.afterHash).toBe(file.afterHash);
    writeFileSync(join(directory, "one.txt"), Buffer.from([0xff, 0, 0xfd]));
    const next = await service.preview("one.txt", false);
    expect(next.beforeHash).toBe(file.afterHash);
  } finally {
    store.close();
  }
});

test("unstaging a rename restores both index paths without changing working files", async () => {
  const { directory, git, store, service } = setup();
  try {
    git("mv", "one.txt", "renamed.txt");
    const state = await service.status();
    expect(
      state.files.find((file) => file.path === "renamed.txt")?.oldPath,
    ).toBe("one.txt");
    await service.act({
      action: "unstage",
      path: "renamed.txt",
      expected: state.identity,
    });
    expect(git("diff", "--cached", "--name-only")).toBe("");
    expect(readFileSync(join(directory, "renamed.txt"), "utf8")).toBe("one\n");
  } finally {
    store.close();
  }
});

test("exact-object push sets tracking for the current local branch", async () => {
  const { git, store, service } = setup();
  const remote = mkdtempSync(join(tmpdir(), "senslop-tracking-"));
  paths.push(remote);
  try {
    execFileSync("git", ["init", "--bare", "-q", remote]);
    git("remote", "add", "origin", remote);
    const branch = git("branch", "--show-current");
    await service.act({
      action: "push",
      remote: "origin",
      branch: "published",
      expected: (await service.status()).identity,
    });
    expect(git("config", `branch.${branch}.remote`)).toBe("origin");
    expect(git("config", `branch.${branch}.merge`)).toBe(
      "refs/heads/published",
    );
    expect(git("rev-parse", "@{upstream}")).toBe(git("rev-parse", "HEAD"));
  } finally {
    store.close();
  }
});
