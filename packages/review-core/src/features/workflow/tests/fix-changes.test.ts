import { expect, test } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  chmod,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { simpleGit } from "simple-git";
import { LocalStore } from "../../../db/local-store";
import {
  collectSnapshot,
  readRepository,
  resyncSnapshot,
} from "../../git/repository";
import { WorkflowStore } from "../workflow-store";
import { FixTasks } from "../fix-tasks";
import {
  prepareFixTask,
  captureFixChanges,
  applyFixChanges,
} from "../fix-changes";
test.each([
  "content",
  "mode-only",
  "content-and-mode",
  "new-executable",
  "new-round-helper",
])(
  "returned managed edits retain changes or explicitly reject unsupported modes: %s",
  async (change) => {
    const directory = await mkdtemp(join(tmpdir(), "senslop-fixes-"));
    const root = join(directory, "repo");
    await mkdir(root);
    const git = simpleGit(root);
    await git.init();
    await git.addConfig("user.name", "Fixture");
    await git.addConfig("user.email", "fixture@example.test");
    await writeFile(join(root, "file.ts"), "base\n");
    await chmod(join(root, "file.ts"), 0o644);
    await writeFile(join(root, "helper.ts"), "base helper\n");
    await git.add(".");
    await git.commit("base");
    await writeFile(join(root, "file.ts"), "bug\n");
    if (change === "new-round-helper")
      await writeFile(join(root, "helper.ts"), "dirty helper\n");
    const store = new LocalStore(join(directory, "reviews.sqlite"));
    try {
      const repo = await readRepository(root);
      const snapshot = await collectSnapshot({
        cwd: root,
        source: { kind: "working-tree" },
      });
      let review = store.saveReview(
        root,
        { ...snapshot, id: randomUUID(), protocolVersion: 1 },
        repo.fingerprint,
        false,
        { repositoryState: repo },
      );
      if (change === "new-round-helper") {
        await writeFile(join(root, "file.ts"), "next bug\n");
        const current = await collectSnapshot({
          cwd: root,
          source: { kind: "working-tree" },
        });
        const state = await readRepository(root);
        review = store.saveReview(
          root,
          {
            ...(await resyncSnapshot(root, snapshot.files, current)),
            id: randomUUID(),
            protocolVersion: 1,
          },
          state.fingerprint,
          false,
          { repositoryState: state, syncBaseline: current.files },
        );
      }
      const findings = new WorkflowStore(store, root).observe(
        review,
        randomUUID(),
        [
          {
            title: "Bug",
            severity: "high",
            problem: "Bug",
            path: "file.ts",
            side: "after",
            start: 1,
            end: 1,
            code: "bug",
            fixPrompt: "Fix",
          },
        ],
      );
      const tasks = new FixTasks(store, root);
      let task = tasks.create(review, {
        title: "Fix",
        findingIds: [findings[0]!.id],
        workspaceKind: "managed",
      });
      task = await prepareFixTask(
        store,
        root,
        task,
        join(directory, "managed"),
      );
      tasks.claim(task.id, "Fixture agent", review);
      if (change === "new-round-helper") {
        await writeFile(join(task.directory!, "helper.ts"), "fixed helper\n");
        const returned = await captureFixChanges(store, root, task.id, review);
        expect(returned.changes).toMatchObject([
          {
            path: "helper.ts",
            before: "dirty helper\n",
            after: "fixed helper\n",
          },
        ]);
        await applyFixChanges(store, root, task.id, review, ["helper.ts"]);
        expect(await readFile(join(root, "helper.ts"), "utf8")).toBe(
          "fixed helper\n",
        );
        return;
      }
      if (change !== "content") {
        const path = join(
          task.directory!,
          change === "new-executable" ? "script.sh" : "file.ts",
        );
        if (change === "content-and-mode")
          await writeFile(join(task.directory!, "file.ts"), "fixed\n");
        if (change === "new-executable") await writeFile(path, "#!/bin/sh\n");
        await chmod(path, 0o755);
        await expect(
          captureFixChanges(store, root, task.id, review),
        ).rejects.toThrow(/mode.*manual/i);
        expect(tasks.get(task.id)?.status).toBe("in-progress");
        return;
      }
      await writeFile(join(task.directory!, "file.ts"), "fixed\n");
      task = await captureFixChanges(store, root, task.id, review);
      expect(task.changes[0]).toMatchObject({
        before: "bug\n",
        after: "fixed\n",
      });
      expect(await readFile(join(root, "file.ts"), "utf8")).toBe("bug\n");
      await writeFile(join(root, "file.ts"), "newer\n");
      await expect(
        applyFixChanges(store, root, task.id, review, ["file.ts"]),
      ).rejects.toThrow(/changed/);
      expect(await readFile(join(root, "file.ts"), "utf8")).toBe("newer\n");
    } finally {
      store.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
