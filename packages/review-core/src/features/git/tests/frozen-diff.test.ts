import { afterEach, expect, test, vi } from "vitest";
import { applyPatch, structuredPatch } from "diff";
import type { SnapshotFile } from "../snapshot";
import { collectSnapshot } from "../snapshot";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("diff", async (original) => {
  const diff = await original<typeof import("diff")>();
  return { ...diff, structuredPatch: vi.fn(diff.structuredPatch) };
});
afterEach(() => vi.restoreAllMocks());

test("inspection preserves exact frozen contents and counts when JavaScript diffing reaches its bound", async () => {
  const root = await mkdtemp(join(tmpdir(), "senslop-diff-fallback-test-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  const path = "lock file\t☃.yaml";
  const before = "packages:\n  original: 1\n";
  const after = "packages:\n  updated: 2";
  try {
    git("init", "-qb", "main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.test");
    await writeFile(join(root, path), before);
    git("add", ".");
    git("commit", "-qm", "baseline");
    await writeFile(join(root, path), after);
    vi.mocked(structuredPatch).mockReturnValueOnce(undefined as never);
    const snapshot = await collectSnapshot({
      cwd: root,
      source: { kind: "working-tree" },
    });
    const file: SnapshotFile = snapshot.files[0]!;
    expect(file).toMatchObject({ path, before, after, added: 1, deleted: 1 });
    expect(applyPatch(before, file.diff)).toBe(after);
    expect(file.diff).not.toContain("senslop-frozen-diff-");
    expect(git("status", "--porcelain=v1").toString()).toContain(" M ");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
