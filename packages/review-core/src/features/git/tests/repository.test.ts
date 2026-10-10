import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import {
  collectSnapshot,
  inspectRepository,
  readRepository,
} from "../repository";

vi.mock("../snapshot", async (importOriginal) => {
  const original = await importOriginal<typeof import("../snapshot")>();
  return { ...original, collectSnapshot: vi.fn(original.collectSnapshot) };
});

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const fixture = async () => {
  const cwd = await mkdtemp(join(tmpdir(), "senslop-browser-git-"));
  directories.push(cwd);
  const git = simpleGit(cwd);
  await git.init();
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@example.com");
  await writeFile(join(cwd, "file.ts"), "one\n");
  await git.add(".");
  await git.commit("first");
  const base = (await git.revparse(["HEAD"])).trim();
  await writeFile(join(cwd, "file.ts"), "two\n");
  await git.add(".");
  await git.commit("second");
  await git.branch(["comparison"]);
  return { cwd, git, base };
};
test("browser selectors read local HEAD and branches without changing Git state", async () => {
  const { cwd, git } = await fixture();
  const before = await git.raw(["status", "--porcelain=v1"]);
  const repository = await readRepository(cwd);
  expect(repository.root).toBe(await realpath(cwd));
  expect(repository.head).toBe((await git.revparse(["HEAD"])).trim());
  expect(repository.commits[0]?.id).toBe(repository.head);
  expect(repository.branches).toContain("comparison");
  expect(await git.raw(["status", "--porcelain=v1"])).toBe(before);
});
test("all browser selections share terminal contents and reject reversed ranges and Git options", async () => {
  const { cwd, base } = await fixture();
  await writeFile(join(cwd, "new.ts"), "local\n");
  for (const source of [
    { kind: "working-tree" } as const,
    { kind: "commit", commit: "HEAD" } as const,
    { kind: "range", base, head: "HEAD" } as const,
    { kind: "branch", base, branch: "comparison" } as const,
  ]) {
    const inspection = await inspectRepository(cwd, source);
    expect(inspection.snapshot).toEqual(await collectSnapshot({ cwd, source }));
    expect(inspection.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  }
  await expect(
    inspectRepository(cwd, { kind: "range", base: "HEAD", head: base }),
  ).rejects.toThrow(/ancestor/);
  await expect(
    inspectRepository(cwd, { kind: "commit", commit: "--all" }),
  ).rejects.toThrow();
});
test("freshness detects same-status content edits and excludes secret contents", async () => {
  const { cwd } = await fixture();
  await writeFile(join(cwd, "file.ts"), "three\n");
  await writeFile(join(cwd, ".env"), "SECRET=one");
  const first = await inspectRepository(cwd, { kind: "working-tree" });
  await writeFile(join(cwd, ".env"), "SECRET=two");
  expect((await readRepository(cwd)).fingerprint).toBe(first.fingerprint);
  await writeFile(join(cwd, "file.ts"), "four\n");
  expect((await readRepository(cwd)).fingerprint).not.toBe(first.fingerprint);
  expect(JSON.stringify(first)).not.toContain("SECRET=");
});

test("repository refresh checks freshness without collecting contents or patches", async () => {
  const { cwd, git } = await fixture();
  await writeFile(join(cwd, "file.ts"), "third\n");
  vi.mocked(collectSnapshot).mockClear();
  const first = await readRepository(cwd);
  expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect((await readRepository(cwd)).fingerprint).toBe(first.fingerprint);
  await writeFile(join(cwd, "file.ts"), "forth\n");
  expect((await readRepository(cwd)).fingerprint).not.toBe(first.fingerprint);
  await git.add("file.ts");
  const staged = await readRepository(cwd);
  await writeFile(join(cwd, "file.ts"), "fifth\n");
  await git.add("file.ts");
  expect((await readRepository(cwd)).fingerprint).not.toBe(staged.fingerprint);
  expect(collectSnapshot).not.toHaveBeenCalled();
});
