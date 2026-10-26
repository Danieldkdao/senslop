import { afterEach, expect, test } from "vitest";
import { execFile } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const executeFile = promisify(execFile);
const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

test.each(["missing", "materialized"] as const)(
  "packing recovers a leftover backup with a %s engine and restores the original link",
  async (state) => {
    const directory = await mkdtemp(join(tmpdir(), "senslop-engine-pack-"));
    directories.push(directory);
    const modules = join(directory, "node_modules");
    const source = join(directory, "store/node_modules/inngest-cli");
    const zip = join(directory, "store/node_modules/adm-zip");
    const engine = join(modules, "inngest-cli");
    const backup = join(modules, ".senslop-engine-source");
    const originalLink = "../store/node_modules/inngest-cli";
    const script = join(directory, "scripts/bundle-engine.mjs");
    await mkdir(modules);
    await mkdir(source, { recursive: true });
    await mkdir(zip, { recursive: true });
    await mkdir(join(directory, "scripts"));
    await cp(new URL("../scripts/bundle-engine.mjs", import.meta.url), script);
    await writeFile(join(directory, "package.json"), '{"type":"module"}');
    const manifest = {
      name: "inngest-cli",
      version: "1.46.0",
      main: "index.cjs",
      dependencies: { "adm-zip": "^0.5.10" },
    };
    await writeFile(join(source, "package.json"), JSON.stringify(manifest));
    await writeFile(
      join(source, "index.cjs"),
      'module.exports = "original-engine";',
    );
    await writeFile(
      join(zip, "package.json"),
      JSON.stringify({ name: "adm-zip", version: "0.6.1" }),
    );
    await symlink(originalLink, backup, "dir");
    if (state === "materialized") {
      await mkdir(engine);
      await writeFile(join(engine, "package.json"), '{"name":"stale-engine"}');
    }

    await executeFile(process.execPath, [script]);
    expect((await lstat(engine)).isSymbolicLink()).toBe(false);
    expect(await readlink(backup)).toBe(originalLink);
    expect(
      JSON.parse(await readFile(join(engine, "package.json"), "utf8")),
    ).toMatchObject({
      ...manifest,
      dependencies: { "adm-zip": "0.6.1" },
    });

    await executeFile(process.execPath, [script, "--restore"]);
    expect((await lstat(engine)).isSymbolicLink()).toBe(true);
    expect(await readlink(engine)).toBe(originalLink);
    expect(await realpath(engine)).toBe(await realpath(source));
    expect(
      JSON.parse(await readFile(join(source, "package.json"), "utf8")),
    ).toEqual(manifest);
    expect(await readFile(join(engine, "index.cjs"), "utf8")).toContain(
      "original-engine",
    );
    await expect(lstat(backup)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(modules)).toEqual(["inngest-cli"]);

    await executeFile(process.execPath, [script, "--restore"]);
    expect(await readlink(engine)).toBe(originalLink);
  },
);
