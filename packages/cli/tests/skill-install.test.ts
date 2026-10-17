import { afterEach, expect, test, vi } from "vitest";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { installReviewSkill } from "../src/features/skills/install.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, symlink: vi.fn(original.symlink) };
});

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

test.each([
  ["agents", ".agents"],
  ["claude", ".claude"],
] as const)(
  "the %s skill installs in %s and repeat installation preserves custom skills",
  async (agent, folder) => {
    const directory = await mkdtemp(join(tmpdir(), "senslop-skill-"));
    directories.push(directory);
    const result = await installReviewSkill(directory, agent);
    expect(result.path).toBe(
      join(directory, folder, "skills", "senslop-review", "SKILL.md"),
    );
    const content = await readFile(result.path, "utf8");
    expect(content).toContain("name: senslop-review");
    expect(content).toContain("senslop reviews create");
    expect(await installReviewSkill(directory, agent)).toMatchObject({
      installed: false,
      path: result.path,
    });
    await writeFile(result.path, "Owner's custom skill");
    await expect(installReviewSkill(directory, agent)).rejects.toThrow(
      /overwrite/,
    );
    expect(await readFile(result.path, "utf8")).toBe("Owner's custom skill");
  },
);

test("Claude and all other agents receive the same skill in independent directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-skill-"));
  directories.push(directory);
  const shared = await installReviewSkill(directory);
  const claude = await installReviewSkill(directory, "claude");
  expect(shared.path).toBe(
    join(directory, ".agents", "skills", "senslop-review", "SKILL.md"),
  );
  expect(await readFile(claude.path, "utf8")).toBe(
    await readFile(shared.path, "utf8"),
  );
  await writeFile(claude.path, "Custom Claude instructions");
  expect((await installReviewSkill(directory)).installed).toBe(false);
  expect(await readFile(claude.path, "utf8")).toBe(
    "Custom Claude instructions",
  );
});

test("both targets create independent regular files when linking is declined", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-skill-"));
  directories.push(directory);
  const result = await installReviewSkill(directory, "both", false);
  const paths = [result.paths[0], result.paths[1]];
  for (const path of paths) expect((await lstat(path)).isFile()).toBe(true);
  expect(await readFile(paths[0], "utf8")).toBe(
    await readFile(paths[1], "utf8"),
  );
  expect(await installReviewSkill(directory, "both", false)).toMatchObject({
    installed: false,
    symlink: false,
  });
  await writeFile(paths[1], "Claude only");
  expect(await readFile(paths[0], "utf8")).not.toBe("Claude only");
});

test("both targets can share one skill through a relative Claude link", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-skill-"));
  directories.push(directory);
  const result = await installReviewSkill(directory, "both", true);
  expect(result).toMatchObject({ installed: true, symlink: true });
  expect((await lstat(result.paths[0])).isFile()).toBe(true);
  expect((await lstat(result.paths[1])).isSymbolicLink()).toBe(true);
  const target = await readlink(result.paths[1]);
  expect(isAbsolute(target)).toBe(false);
  expect(resolve(dirname(result.paths[1]), target)).toBe(result.paths[0]);
  expect(await installReviewSkill(directory, "both", true)).toMatchObject({
    installed: false,
    symlink: true,
  });
  expect((await installReviewSkill(directory, "claude")).installed).toBe(false);
  await writeFile(result.paths[0], "Shared edit");
  expect(await readFile(result.paths[1], "utf8")).toBe("Shared edit");
});

test("switching between two files and a symlink preserves the matching bundled skill", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-skill-"));
  directories.push(directory);
  const copied = await installReviewSkill(directory, "both", false);
  const content = await readFile(copied.paths[0], "utf8");
  expect((await installReviewSkill(directory, "both", true)).installed).toBe(
    true,
  );
  expect((await lstat(copied.paths[1])).isSymbolicLink()).toBe(true);
  expect((await installReviewSkill(directory, "both", false)).installed).toBe(
    true,
  );
  expect((await lstat(copied.paths[1])).isFile()).toBe(true);
  expect(await readFile(copied.paths[1], "utf8")).toBe(content);
});

test.each([true, false])(
  "both targets protect an existing custom skill before writing either target, link=%s",
  async (link) => {
    const directory = await mkdtemp(join(tmpdir(), "senslop-skill-"));
    directories.push(directory);
    const claude = await installReviewSkill(directory, "claude");
    await writeFile(claude.path, "Owner's Claude skill");
    await expect(
      installReviewSkill(directory, "both", link),
    ).rejects.toMatchObject({ code: "skill_exists" });
    await expect(
      lstat(join(directory, ".agents/skills/senslop-review/SKILL.md")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(claude.path, "utf8")).toBe("Owner's Claude skill");
  },
);

test("both targets preserve links to unrelated files and dangling links", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-skill-"));
  directories.push(directory);
  const path = join(directory, ".claude/skills/senslop-review/SKILL.md");
  await mkdir(dirname(path), { recursive: true });
  const external = join(directory, "external-skill.md");
  await writeFile(
    external,
    await readFile(
      new URL("../skills/senslop-review/SKILL.md", import.meta.url),
    ),
  );
  await symlink(external, path, "file");
  await expect(
    installReviewSkill(directory, "both", true),
  ).rejects.toMatchObject({ code: "skill_exists" });
  expect(await readlink(path)).toBe(external);
  await unlink(path);
  await symlink("missing-custom-skill.md", path, "file");
  await expect(
    installReviewSkill(directory, "both", true),
  ).rejects.toMatchObject({ code: "skill_exists" });
  expect(await readlink(path)).toBe("missing-custom-skill.md");
  await expect(
    lstat(join(directory, ".agents/skills/senslop-review/SKILL.md")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

test("a symlink permission failure preserves existing skill files and cleans staged replacements", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-skill-"));
  directories.push(directory);
  const copied = await installReviewSkill(directory, "both", false);
  const content = await readFile(copied.paths[1]!, "utf8");
  vi.mocked(symlink).mockRejectedValueOnce(
    Object.assign(new Error("Permission denied"), { code: "EPERM" }),
  );
  await expect(
    installReviewSkill(directory, "both", true),
  ).rejects.toMatchObject({
    code: "symlink_failed",
    message: expect.stringContaining("--no-symlink"),
  });
  expect((await lstat(copied.paths[1]!)).isFile()).toBe(true);
  expect(await readFile(copied.paths[1]!, "utf8")).toBe(content);
  expect(await readdir(dirname(copied.paths[1]!))).toEqual(["SKILL.md"]);
});
