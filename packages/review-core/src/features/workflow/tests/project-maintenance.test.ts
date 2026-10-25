import { expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { simpleGit } from "simple-git";
import { LocalStore } from "../../../db/local-store";
import { collectSnapshot, readRepository } from "../../git/repository";
import { CheckRunner } from "../check-runner";
import { maintainProjectData, deleteReviewData } from "../project-maintenance";
import { discoverWorktrees } from "../project-registry";

test("retention trims old logs, removes only unchanged inactive owned workspaces, and preserves metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-maintenance-"));
  const root = join(directory, "repo");
  await mkdir(root);
  const git = simpleGit(root);
  await git.init();
  await git.addConfig("user.name", "Fixture");
  await git.addConfig("user.email", "fixture@example.test");
  await writeFile(join(root, "a.txt"), "base");
  await git.add(".");
  await git.commit("base");
  await writeFile(join(root, "a.txt"), "dirty");
  const store = new LocalStore(join(directory, "reviews.sqlite"));
  try {
    const repository = await readRepository(root);
    const review = store.saveReview(
      root,
      {
        ...(await collectSnapshot({
          cwd: root,
          source: { kind: "working-tree" },
        })),
        id: randomUUID(),
        protocolVersion: 1,
      },
      repository.fingerprint,
      false,
      { repositoryState: repository },
    );
    const runner = new CheckRunner(store, root, join(directory, "managed"));
    const run = (await runner.run(
      runner.create(review, { command: "node -e \"console.log('fixture')\"" })
        .id,
    ))!;
    const metadata = store.database
      .prepare("SELECT body FROM execution_manifests WHERE id=?")
      .get(run.manifestId!)!;
    const manifest = JSON.parse(String(metadata.body));
    await writeFile(join(manifest.directory, "a.txt"), "agent work");
    const later = Date.now() + 40 * 86400000;
    await maintainProjectData(store, root, later);
    expect(
      await access(manifest.directory).then(
        () => true,
        () => false,
      ),
    ).toBe(true);
    expect(runner.get(run.id)?.output).toContain("expired");
    await writeFile(join(manifest.directory, "a.txt"), "dirty");
    await maintainProjectData(store, root, later);
    expect(
      await access(manifest.directory).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    expect(runner.get(run.id)?.status).toBe("passed");
    await git.raw([
      "worktree",
      "add",
      "-b",
      "fixture-other",
      join(directory, "other"),
      "HEAD",
    ]);
    expect(
      (await discoverWorktrees(root)).some(
        (worktree) => worktree.branch === "fixture-other",
      ),
    ).toBe(true);
    const pending = runner.create(review, {
      command: 'node -e "console.log(1)"',
    });
    await expect(deleteReviewData(store, root, review.id)).rejects.toThrow(
      /active/i,
    );
    runner.cancel(pending.id);
    await deleteReviewData(store, root, review.id);
    expect(store.getReview(root, review.id)).toBeNull();
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
