import { afterEach, expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { simpleGit } from "simple-git";
import { collectSnapshot, readRepository } from "../../git/repository";
import { LocalStore } from "../../../db/local-store";
import {
  materializeReview,
  removeManagedWorkspace,
} from "../execution-manifest";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
test("managed source contains exact dirty and untracked content and leaves the original index unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-execution-"));
  directories.push(directory);
  const root = join(directory, "repo");
  await mkdir(root);
  const git = simpleGit(root);
  await git.init();
  await git.addConfig("user.name", "Fixture");
  await git.addConfig("user.email", "fixture@example.test");
  await writeFile(join(root, "file.ts"), "base\n");
  await git.add(".");
  await git.commit("base");
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
    const review = store.saveReview(
      root,
      { ...snapshot, id: randomUUID(), protocolVersion: 1 },
      repository.fingerprint,
      false,
      { repositoryState: repository },
    );
    const manifest = await materializeReview(
      store,
      root,
      review,
      join(directory, "managed"),
    );
    expect(await readFile(join(manifest.directory, "file.ts"), "utf8")).toBe(
      "dirty\n",
    );
    expect(await readFile(join(manifest.directory, "new.ts"), "utf8")).toBe(
      "untracked\n",
    );
    expect(manifest.files.some((file) => file.path === ".env")).toBe(false);
    expect(await git.diff(["--cached"])).toBe(index);
    await removeManagedWorkspace(store, root, manifest.id);
    expect(await git.diff(["--cached"])).toBe(index);
  } finally {
    store.close();
  }
});
