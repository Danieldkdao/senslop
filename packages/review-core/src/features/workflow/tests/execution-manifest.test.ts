import { afterEach, expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { simpleGit } from "simple-git";
import {
  collectSnapshot,
  readRepository,
  resyncSnapshot,
} from "../../git/repository";
import { LocalStore } from "../../../db/local-store";
import {
  materializeReview,
  removeManagedWorkspace,
  executionSourceChanged,
} from "../execution-manifest";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
test.each(["initial", "new-round", "restored-deletion", "staged-addition"])(
  "managed source and cleanup preserve the complete captured state: %s",
  async (scenario) => {
    const directory = await mkdtemp(join(tmpdir(), "senslop-execution-"));
    directories.push(directory);
    const root = join(directory, "repo");
    await mkdir(root);
    const git = simpleGit(root);
    await git.init();
    await git.addConfig("user.name", "Fixture");
    await git.addConfig("user.email", "fixture@example.test");
    await writeFile(join(root, "file.ts"), "base\n");
    await writeFile(join(root, "helper.ts"), "base helper\n");
    await writeFile(join(root, "deleted.ts"), "deleted source\n");
    await git.add(".");
    await git.commit("base");
    await writeFile(join(root, "helper.ts"), "dirty helper\n");
    await rm(join(root, "deleted.ts"));
    await writeFile(join(root, "file.ts"), "staged\n");
    await git.add(".");
    await writeFile(join(root, "file.ts"), "dirty\n");
    await writeFile(join(root, "new.ts"), "untracked\n");
    await writeFile(join(root, ".env"), "SECRET=fixture\n");
    const snapshot = await collectSnapshot({
      cwd: root,
      source: { kind: "working-tree" },
    });
    const repository = await readRepository(root);
    const index = await git.diff(["--cached"]);
    const store = new LocalStore(join(directory, "reviews.sqlite"));
    try {
      let review = store.saveReview(
        root,
        { ...snapshot, id: randomUUID(), protocolVersion: 1 },
        repository.fingerprint,
        false,
        { repositoryState: repository },
      );
      if (scenario === "new-round") {
        await writeFile(join(root, "file.ts"), "new round\n");
        const current = await collectSnapshot({
          cwd: root,
          source: { kind: "working-tree" },
        });
        const next = await resyncSnapshot(root, snapshot.files, current);
        const state = await readRepository(root);
        review = store.saveReview(
          root,
          { ...next, id: randomUUID(), protocolVersion: 1 },
          state.fingerprint,
          false,
          { repositoryState: state, syncBaseline: current.files },
        );
        expect(review.files.some((file) => file.path === "helper.ts")).toBe(
          false,
        );
      }
      const manifest = await materializeReview(
        store,
        root,
        review,
        join(directory, "managed"),
      );
      expect(await readFile(join(manifest.directory, "file.ts"), "utf8")).toBe(
        scenario === "new-round" ? "new round\n" : "dirty\n",
      );
      expect(await readFile(join(manifest.directory, "new.ts"), "utf8")).toBe(
        "untracked\n",
      );
      expect(manifest.files.some((file) => file.path === ".env")).toBe(false);
      expect(manifest.files.some((file) => file.path === "deleted.ts")).toBe(
        false,
      );
      expect(
        await readFile(join(manifest.directory, "helper.ts"), "utf8"),
      ).toBe("dirty helper\n");
      if (scenario === "restored-deletion" || scenario === "staged-addition") {
        const path =
          scenario === "restored-deletion" ? "deleted.ts" : "staged.ts";
        await writeFile(join(manifest.directory, path), "new edits\n");
        if (scenario === "staged-addition")
          await simpleGit(manifest.directory).add(path);
        expect(await executionSourceChanged(manifest)).toBe(true);
        await expect(
          removeManagedWorkspace(store, root, manifest.id),
        ).rejects.toThrow(/newer changes/);
        expect(await readFile(join(manifest.directory, path), "utf8")).toBe(
          "new edits\n",
        );
        await removeManagedWorkspace(store, root, manifest.id, true);
        return;
      }
      expect(await git.diff(["--cached"])).toBe(index);
      await removeManagedWorkspace(store, root, manifest.id);
      expect(await git.diff(["--cached"])).toBe(index);
    } finally {
      store.close();
    }
  },
);
