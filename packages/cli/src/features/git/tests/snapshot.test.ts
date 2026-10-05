import { test, expect } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { collectSnapshot } from "../snapshot.js";
const execute = promisify(execFile);
const lines = (count: number, prefix = "original") =>
  Array.from({ length: count }, (_, i) => `${prefix} ${i + 1}`).join("\n") +
  "\n";
const fixture = async (
  run: (
    cwd: string,
    git: (...args: string[]) => Promise<string>,
  ) => Promise<void>,
) => {
  const cwd = await mkdtemp(join(tmpdir(), "senslop-git-test-"));
  const git = async (...args: string[]) =>
    (await execute("git", args, { cwd })).stdout.trim();
  try {
    await git("init", "-b", "main");
    await git("config", "user.email", "fixture@example.test");
    await git("config", "user.name", "Fixture");
    await git("config", "commit.gpgsign", "false");
    await run(cwd, git);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
};
test("root snapshot has exact multilingual source and counts smaller files without qualifying them", async () =>
  fixture(async (cwd, git) => {
    for (const name of [
      "types.ts",
      "service.ts",
      "main.py",
      "main.go",
      "main.rs",
    ])
      await writeFile(join(cwd, name), lines(10, name));
    await writeFile(join(cwd, "read me\t☃.md"), "tiny\n");
    await git("add", ".");
    await git("commit", "-m", "root");
    const snapshot = await collectSnapshot({
      cwd,
      source: { kind: "commit", commit: "HEAD" },
    });
    expect(snapshot.files.length).toBe(6);
    expect(snapshot.eligibility.eligible).toBe(true);
    expect(snapshot.eligibility.qualifyingFiles).toBe(5);
    expect(
      snapshot.files.find((file) => file.path === "types.ts")?.before,
    ).toBe(null);
    expect(snapshot.files[0]!.diff).toMatch(/@@ -0,0 \+1,10 @@/);
    expect(
      snapshot.files.find((file) => file.path.startsWith("read me"))?.added,
    ).toBe(1);
    expect(snapshot.hash).toMatch(/^[a-f0-9]{64}$/);
  }));
test("endpoint ranges preserve rename/deletion and reject reversed or unrelated history", async () =>
  fixture(async (cwd, git) => {
    await writeFile(join(cwd, "old name.ts"), lines(12));
    await writeFile(join(cwd, "delete.py"), lines(11));
    await git("add", ".");
    await git("commit", "-m", "base");
    const base = await git("rev-parse", "HEAD");
    await git("mv", "old name.ts", "new name.ts");
    await git("rm", "delete.py");
    await git("commit", "-m", "change");
    const snapshot = await collectSnapshot({
      cwd,
      source: { kind: "range", base, head: "HEAD" },
    });
    const rename = snapshot.files.find((file) => file.path === "new name.ts")!;
    expect(rename.oldPath).toBe("old name.ts");
    expect(rename.before).toBe(rename.after);
    expect(rename.added).toBe(0);
    const deleted = snapshot.files.find((file) => file.path === "delete.py")!;
    expect(deleted.after).toBe(null);
    expect(deleted.deleted).toBe(11);
    expect(deleted.diff).toMatch(/\+\+\+ \/dev\/null/);
    await expect(
      collectSnapshot({
        cwd,
        source: { kind: "range", base: "HEAD", head: base },
      }),
    ).rejects.toThrow(/ancestor/);
    await git("checkout", "--orphan", "unrelated");
    await git("rm", "-rf", ".");
    await writeFile(join(cwd, "different.txt"), "different\n");
    await git("add", ".");
    await git("commit", "-m", "unrelated");
    await expect(
      collectSnapshot({ cwd, source: { kind: "range", base, head: "HEAD" } }),
    ).rejects.toThrow(/ancestor/);
  }));
test("merge uses the first-parent delta and reports that choice", async () =>
  fixture(async (cwd, git) => {
    await writeFile(join(cwd, "base.ts"), "base\n");
    await git("add", ".");
    await git("commit", "-m", "base");
    await git("checkout", "-b", "feature");
    await writeFile(join(cwd, "feature.ts"), lines(10));
    await git("add", ".");
    await git("commit", "-m", "feature");
    await git("checkout", "main");
    await writeFile(join(cwd, "main.ts"), "main\n");
    await git("add", ".");
    await git("commit", "-m", "main");
    const parent = await git("rev-parse", "HEAD");
    await git("merge", "--no-ff", "feature", "-m", "merge");
    const snapshot = await collectSnapshot({
      cwd,
      source: { kind: "commit", commit: "HEAD" },
    });
    expect(snapshot.source.base).toBe(parent);
    expect(snapshot.source.firstParent).toBe(true);
    expect(snapshot.files.map((file) => file.path)).toEqual(["feature.ts"]);
  }));
test("working tree freezes staged plus unstaged edits, respects ignores, excludes secrets and never follows links", async () =>
  fixture(async (cwd, git) => {
    await writeFile(join(cwd, "tracked.ts"), lines(5));
    await writeFile(join(cwd, ".gitignore"), "ignored.txt\n");
    await git("add", ".");
    await git("commit", "-m", "base");
    await writeFile(join(cwd, "tracked.ts"), lines(6, "staged"));
    await git("add", "tracked.ts");
    await writeFile(join(cwd, "tracked.ts"), lines(7, "final"));
    await writeFile(join(cwd, "untracked.py"), lines(10));
    await writeFile(join(cwd, "ignored.txt"), lines(10));
    await writeFile(join(cwd, ".env.local"), "SECRET=do-not-read\n");
    await writeFile(join(cwd, ".env.example"), "DEMO=\n");
    await writeFile(join(cwd, "binary.dat"), Buffer.from([0, 1, 2]));
    await symlink("/etc/passwd", join(cwd, "escape.ts"));
    const snapshot = await collectSnapshot({
      cwd,
      source: { kind: "working-tree" },
    });
    expect(
      snapshot.files.find((file) => file.path === "tracked.ts")?.after,
    ).toBe(lines(7, "final"));
    expect(
      snapshot.files.find((file) => file.path === "tracked.ts")?.added,
    ).toBe(7);
    expect(
      snapshot.files.find((file) => file.path === "tracked.ts")?.deleted,
    ).toBe(5);
    expect(snapshot.files.some((file) => file.path === "ignored.txt")).toBe(
      false,
    );
    expect(snapshot.files.some((file) => file.path === ".env.example")).toBe(
      true,
    );
    expect(
      snapshot.files.find((file) => file.path === "binary.dat")?.binary,
    ).toBe(true);
    expect(
      snapshot.files.find((file) => file.path === "binary.dat")?.added,
    ).toBe(0);
    expect(snapshot.excluded.map((file) => file.path).sort()).toEqual([
      ".env.local",
      "escape.ts",
    ]);
    await writeFile(join(cwd, "tracked.ts"), "later edit\n");
    expect(snapshot.frozenContents["tracked.ts"]?.after).toBe(
      lines(7, "final"),
    );
  }));
test("rejects oversized files and total snapshots without truncation", async () =>
  fixture(async (cwd, git) => {
    await writeFile(join(cwd, "base"), "base");
    await git("add", ".");
    await git("commit", "-m", "base");
    await writeFile(join(cwd, "large.ts"), Buffer.alloc(1024 * 1024 + 1, 65));
    await expect(
      collectSnapshot({ cwd, source: { kind: "working-tree" } }),
    ).rejects.toThrow(/1 MiB/);
    await rm(join(cwd, "large.ts"));
    await mkdir(join(cwd, "many"));
    for (let index = 0; index < 21; index++)
      await writeFile(
        join(cwd, "many", `${index}.txt`),
        Buffer.alloc(1024 * 1024, 65),
      );
    await expect(
      collectSnapshot({ cwd, source: { kind: "working-tree" } }),
    ).rejects.toThrow(/20 MiB/);
  }));
test("working-tree deletion handles missing parent directories and preserves exact old/new hunk coordinates", async () =>
  fixture(async (cwd, git) => {
    await mkdir(join(cwd, "nested"));
    await writeFile(join(cwd, "nested", "deleted.rs"), lines(10));
    await writeFile(join(cwd, "coordinates.ts"), lines(12));
    await git("add", ".");
    await git("commit", "-m", "base");
    await rm(join(cwd, "nested"), { recursive: true });
    await writeFile(
      join(cwd, "coordinates.ts"),
      lines(12).replace("original 6\n", "replacement six\nreplacement seven\n"),
    );
    const snapshot = await collectSnapshot({
      cwd,
      source: { kind: "working-tree" },
    });
    const changed = snapshot.files.find(
      (file) => file.path === "coordinates.ts",
    )!;
    expect(changed.added).toBe(2);
    expect(changed.deleted).toBe(1);
    expect(changed.diff).toMatch(/@@ -3,7 \+3,8 @@/);
    expect(changed.diff).toMatch(
      /-original 6\n\+replacement six\n\+replacement seven/,
    );
    expect(
      snapshot.files.find((file) => file.path === "nested/deleted.rs")?.deleted,
    ).toBe(10);
  }));
test("commit links and invalid UTF-8 binaries remain metadata without reading targets; revisions reject option injection", async () =>
  fixture(async (cwd, git) => {
    await writeFile(join(cwd, "non-utf8.bin"), Buffer.from([255, 254, 253]));
    await symlink("/etc/passwd", join(cwd, "external.ts"));
    await git("add", ".");
    await git("commit", "-m", "base");
    const snapshot = await collectSnapshot({
      cwd,
      source: { kind: "commit", commit: "HEAD" },
    });
    expect(snapshot.files[0]?.binary).toBe(true);
    expect(snapshot.files[0]?.after).toBe(null);
    expect(snapshot.files[0]!.afterHash!).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.excluded[0]?.path).toBe("external.ts");
    await expect(
      collectSnapshot({
        cwd,
        source: { kind: "commit", commit: "--output=leak" },
      }),
    ).rejects.toThrow(/not a Git option/);
  }));
