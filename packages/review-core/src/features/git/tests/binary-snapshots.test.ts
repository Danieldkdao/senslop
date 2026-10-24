import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { createHash } from "node:crypto";
import { collectSnapshot, resyncSnapshot, SNAPSHOT_LIMITS } from "../snapshot";

const directories: string[] = [];
const artwork = Buffer.alloc(SNAPSHOT_LIMITS.fileBytes + 1);
const artworkHash = createHash("sha256").update(artwork).digest("hex");
const fixture = async () => {
  const cwd = await mkdtemp(join(tmpdir(), "senslop-binary-snapshot-"));
  directories.push(cwd);
  const git = simpleGit(cwd);
  await git.init();
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@example.com");
  await writeFile(join(cwd, "file.ts"), "export const value = 1;\n");
  await git.add(".");
  await git.commit("baseline");
  return { cwd, git, base: (await git.revparse(["HEAD"])).trim() };
};

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test.each(["untracked", "staged", "commit", "range"] as const)(
  "%s inspection retains large binary metadata alongside exact text changes",
  async (selection) => {
    const { cwd, git, base } = await fixture();
    await writeFile(join(cwd, "artwork.png"), artwork);
    await writeFile(join(cwd, "file.ts"), "export const value = 2;\n");
    if (selection !== "untracked") await git.add(".");
    if (selection === "commit" || selection === "range")
      await git.commit("artwork");
    const source =
      selection === "commit"
        ? { kind: "commit" as const, commit: "HEAD" }
        : selection === "range"
          ? { kind: "range" as const, base, head: "HEAD" }
          : { kind: "working-tree" as const };
    const snapshot = await collectSnapshot({ cwd, source });
    expect(
      snapshot.files.find((file) => file.path === "artwork.png"),
    ).toMatchObject({
      binary: true,
      before: null,
      after: null,
      afterHash: artworkHash,
      added: 0,
      deleted: 0,
    });
    expect(snapshot.frozenContents["artwork.png"]).toBeUndefined();
    expect(snapshot.frozenContents["file.ts"]).toEqual({
      before: "export const value = 1;\n",
      after: "export const value = 2;\n",
    });
  },
);

test("large binary deletion preserves the original hash without uploading binary contents", async () => {
  const { cwd, git } = await fixture();
  await writeFile(join(cwd, "artwork.png"), artwork);
  await git.add(".");
  await git.commit("artwork");
  await rm(join(cwd, "artwork.png"));
  const snapshot = await collectSnapshot({
    cwd,
    source: { kind: "working-tree" },
  });
  expect(snapshot.files[0]).toMatchObject({
    binary: true,
    beforeHash: artworkHash,
    afterHash: null,
    before: null,
    after: null,
  });
});

test.each(["working-tree", "merge"] as const)(
  "%s inspection counts binary metadata rather than aggregate artwork bytes toward the snapshot limit",
  async (selection) => {
    const { cwd, git } = await fixture();
    const originalBranch = (await git.branch()).current;
    if (selection === "merge") await git.checkoutLocalBranch("artwork");
    const bytes = Buffer.alloc(SNAPSHOT_LIMITS.totalBytes / 2 + 1);
    for (const path of ["first.png", "second.pxo"])
      await writeFile(join(cwd, path), bytes);
    await writeFile(join(cwd, "file.ts"), "export const value = 2;\n");
    if (selection === "merge") {
      await git.add(".");
      await git.commit("artwork");
      await git.checkout(originalBranch);
      await writeFile(
        join(cwd, "main-only.ts"),
        "export const retained = true;\n",
      );
      await git.add(".");
      await git.commit("independent change");
      await git.merge(["--no-ff", "artwork", "-m", "merge artwork"]);
    }
    const snapshot = await collectSnapshot({
      cwd,
      source:
        selection === "merge"
          ? { kind: "commit", commit: "HEAD" }
          : { kind: "working-tree" },
    });
    expect(snapshot.source.firstParent).toBe(selection === "merge");
    expect(snapshot.files.map((file) => file.path).sort()).toEqual([
      "file.ts",
      "first.png",
      "second.pxo",
    ]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    for (const path of ["first.png", "second.pxo"])
      expect(snapshot.files.find((file) => file.path === path)).toMatchObject({
        binary: true,
        before: null,
        after: null,
        beforeHash: null,
        afterHash: hash,
      });
    expect(snapshot.frozenContents).toEqual({
      "file.ts": {
        before: "export const value = 1;\n",
        after: "export const value = 2;\n",
      },
    });
    expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThan(
      SNAPSHOT_LIMITS.totalBytes,
    );
  },
);

test("oversized text still rejects inspection even when its replacement is binary", async () => {
  const { cwd, git } = await fixture();
  await writeFile(
    join(cwd, "large.ts"),
    Buffer.alloc(SNAPSHOT_LIMITS.fileBytes + 1, 65),
  );
  await expect(
    collectSnapshot({ cwd, source: { kind: "working-tree" } }),
  ).rejects.toThrow(/1 MiB file limit/);
  await git.add(".");
  await git.commit("oversized text");
  await writeFile(join(cwd, "large.ts"), artwork);
  await expect(
    collectSnapshot({ cwd, source: { kind: "working-tree" } }),
  ).rejects.toThrow(/1 MiB file limit/);
});

test("re-sync captures large binary reversions relative to the previous review", async () => {
  const { cwd, git } = await fixture();
  await writeFile(join(cwd, "artwork.png"), artwork);
  await git.add(".");
  await git.commit("artwork");
  const changedArtwork = Buffer.from(artwork);
  changedArtwork[changedArtwork.length - 1] = 1;
  await writeFile(join(cwd, "artwork.png"), changedArtwork);
  const first = await collectSnapshot({
    cwd,
    source: { kind: "working-tree" },
  });
  await writeFile(join(cwd, "artwork.png"), artwork);
  const current = await collectSnapshot({
    cwd,
    source: { kind: "working-tree" },
  });
  const next = await resyncSnapshot(cwd, first.files, current);
  expect(next.files[0]).toMatchObject({
    binary: true,
    beforeHash: first.files[0]!.afterHash,
    afterHash: artworkHash,
    before: null,
    after: null,
  });
});

test("large binaries remain bounded by the existing collection limit", async () => {
  const { cwd, git } = await fixture();
  await writeFile(
    join(cwd, "artwork.png"),
    Buffer.alloc(SNAPSHOT_LIMITS.totalBytes + 1),
  );
  await expect(
    collectSnapshot({ cwd, source: { kind: "working-tree" } }),
  ).rejects.toThrow(/20 MiB/);
  await git.add(".");
  await git.commit("large artwork");
  await expect(
    collectSnapshot({ cwd, source: { kind: "commit", commit: "HEAD" } }),
  ).rejects.toThrow(/20 MiB/);
});
