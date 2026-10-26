import { access, cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";

const source = fileURLToPath(
  new URL("../../../apps/local/.next/", import.meta.url),
);
const target = fileURLToPath(new URL("../dist/local-app/", import.meta.url));
await cp(
  fileURLToPath(new URL("../skills/", import.meta.url)),
  fileURLToPath(new URL("../dist/skills/", import.meta.url)),
  { recursive: true },
);
await access(join(source, "standalone/apps/local/server.js"));
await rm(target, { recursive: true, force: true });
// npm drops symlinks; copy the app separately and flatten pnpm's traced runtime aliases.
await cp(join(source, "standalone"), target, {
  recursive: true,
  filter: (path) =>
    !basename(path).startsWith(".env") &&
    !["node_modules", "cache", "route-cache"].includes(basename(path)),
});
await cp(
  join(source, "standalone/node_modules/.pnpm/node_modules"),
  join(target, "node_modules"),
  {
    recursive: true,
    dereference: true,
    // All local images are unoptimized; omit unused platform-specific image binaries.
    filter: (path) => !/^sharp(?:-|$)/.test(basename(path)),
  },
);
// Root peer aliases such as React are absent from pnpm's flattened alias directory.
for (const entry of await readdir(join(source, "standalone/node_modules"))) {
  if (entry.startsWith(".")) continue;
  await cp(
    join(source, "standalone/node_modules", entry),
    join(target, "node_modules", entry),
    { recursive: true, dereference: true },
  );
}
// pnpm keeps optional native executables beside the SDK rather than in its flattened aliases.
const localRequire = createRequire(
  new URL("../../../apps/local/package.json", import.meta.url),
);
const sdkDirectory = dirname(
  localRequire.resolve("@anthropic-ai/claude-agent-sdk"),
);
const sdkRequire = createRequire(join(sdkDirectory, "sdk.mjs"));
const sdkPackage = JSON.parse(
  await readFile(join(sdkDirectory, "package.json"), "utf8"),
);
for (const name of Object.keys(sdkPackage.optionalDependencies)) {
  let packagePath;
  try {
    packagePath = sdkRequire.resolve(`${name}/package.json`);
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") continue;
    throw error;
  }
  await cp(dirname(packagePath), join(target, "node_modules", name), {
    recursive: true,
    dereference: true,
  });
}
await cp(
  join(source, "standalone/apps/local/node_modules/material-icon-theme"),
  join(target, "apps/local/node_modules/material-icon-theme"),
  { recursive: true, dereference: true },
);
// Preserve Next.js hashed aliases for external native packages.
await cp(
  join(source, "standalone/apps/local/.next/node_modules"),
  join(target, "apps/local/.next/node_modules"),
  { recursive: true, dereference: true },
);
await cp(join(source, "static"), join(target, "apps/local/.next/static"), {
  recursive: true,
});
await cp(
  fileURLToPath(new URL("../../../apps/local/public/", import.meta.url)),
  join(target, "apps/local/public"),
  { recursive: true },
);
await cp(
  fileURLToPath(
    new URL("../src/features/workspace/parent-monitor.mjs", import.meta.url),
  ),
  fileURLToPath(new URL("../dist/parent-monitor.mjs", import.meta.url)),
);

// Runtime caches must also stay out of archives packed after a dashboard session.
await writeFile(join(target, ".npmignore"), "**/route-cache/**\n**/cache/**\n");

await cp(
  fileURLToPath(
    new URL("../src/features/workspace/engine-supervisor.mjs", import.meta.url),
  ),
  fileURLToPath(new URL("../dist/engine-supervisor.mjs", import.meta.url)),
);
