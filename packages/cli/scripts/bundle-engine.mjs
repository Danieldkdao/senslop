import {
  cp,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(join(packageDirectory, "package.json"));
const engine = join(packageDirectory, "node_modules/inngest-cli");
const backup = join(packageDirectory, "node_modules/.senslop-engine-source");

const restoreEngine = async () => {
  try {
    await lstat(backup);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  await rm(engine, { recursive: true, force: true });
  await rename(backup, engine);
};

// Restore pnpm's link after packing or recover it from an interrupted pack.
await restoreEngine();

// npm cannot bundle pnpm's external symlinks; materialize this audited runtime tree.
if (
  !process.argv.includes("--restore") &&
  (await lstat(engine)).isSymbolicLink()
) {
  const staging = await mkdtemp(
    join(packageDirectory, "node_modules/.senslop-engine-"),
  );
  const copyPackage = async (source, target) => {
    const manifest = JSON.parse(
      await readFile(join(source, "package.json"), "utf8"),
    );
    await cp(source, target, {
      recursive: true,
      filter: (path) => path === source || basename(path) !== "node_modules",
    });
    const sourceRequire = createRequire(join(source, "package.json"));
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      const candidates = sourceRequire.resolve.paths(name) ?? [];
      let dependency;
      for (const candidate of candidates) {
        try {
          dependency = await realpath(join(candidate, name));
          break;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      if (!dependency) throw new Error(`Missing engine dependency: ${name}`);
      await copyPackage(dependency, join(target, "node_modules", name));
      // Preserve the patched ZIP version for consumers, whose root ignores our pnpm overrides.
      if (manifest.name === "inngest-cli" && name === "adm-zip") {
        const patched = JSON.parse(
          await readFile(join(dependency, "package.json"), "utf8"),
        );
        if (patched.version !== "0.6.1") {
          throw new Error(
            "Install frozen workspace dependencies before packing: adm-zip must be 0.6.1.",
          );
        }
        manifest.dependencies[name] = patched.version;
      }
    }
    await writeFile(
      join(target, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  };
  try {
    await copyPackage(
      dirname(require.resolve("inngest-cli/package.json")),
      join(staging, "inngest-cli"),
    );
    await rename(engine, backup);
    try {
      await rename(join(staging, "inngest-cli"), engine);
    } catch (error) {
      await restoreEngine();
      throw error;
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
