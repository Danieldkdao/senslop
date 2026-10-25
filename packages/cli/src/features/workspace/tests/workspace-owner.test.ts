import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { claimWorkspaceOwner } from "../workspace-owner";
import { workspaceStateDirectory } from "../runtime-paths";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-owner-"));
  directories.push(directory);
  return directory;
};

test("one owner wins and old cleanup cannot release a replacement in the same process", async () => {
  const directory = await fixture();
  const first = claimWorkspaceOwner(directory, "/repo");
  expect(() => claimWorkspaceOwner(directory, "/repo")).toThrow(
    /already running/i,
  );
  first.release();
  const replacement = claimWorkspaceOwner(directory, "/repo");
  first.release();
  expect(replacement.isCurrent()).toBe(true);
  expect(() => claimWorkspaceOwner(directory, "/repo")).toThrow(
    /already running/i,
  );
  replacement.release();
});

test("stale legacy state is recovered while a live legacy owner is preserved", async () => {
  const directory = await fixture();
  const owner = claimWorkspaceOwner(directory, "/repo");
  owner.release();
  const lock = join(workspaceStateDirectory(directory, "/repo"), "owner.lock");
  await writeFile(lock, "2147483647");
  const recovered = claimWorkspaceOwner(directory, "/repo");
  recovered.release();
  await writeFile(lock, String(process.pid));
  expect(() => claimWorkspaceOwner(directory, "/repo")).toThrow(
    /already running/i,
  );
  expect(await readFile(lock, "utf8")).toBe(String(process.pid));
});

test("simultaneous independent processes elect exactly one workspace owner", async () => {
  const directory = await fixture();
  const source = new URL("../workspace-owner.ts", import.meta.url).href;
  const code = `import { claimWorkspaceOwner } from ${JSON.stringify(source)}; try { claimWorkspaceOwner(${JSON.stringify(directory)}, "/repo"); process.stdout.write("won"); process.stdin.resume(); } catch (error) { process.stdout.write(error.message.includes("already running") ? "owned" : "error"); }`;
  const children = [0, 1].map(() =>
    spawn(
      process.execPath,
      [
        "--import",
        createRequire(import.meta.url).resolve("tsx/esm"),
        "--input-type=module",
        "-e",
        code,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    ),
  );
  const closed = children.map((child) => once(child, "close"));
  try {
    const messages = await Promise.all(
      children.map(async (child, index) => {
        const [chunk] = await Promise.race([
          once(child.stdout!, "data"),
          closed[index]!.then(() => {
            throw new Error("Owner fixture exited early.");
          }),
        ]);
        return String(chunk);
      }),
    );
    expect(messages.sort()).toEqual(["owned", "won"]);
  } finally {
    for (const child of children) child.kill("SIGKILL");
    await Promise.all(closed);
  }
});
