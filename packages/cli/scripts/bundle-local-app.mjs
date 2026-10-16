import { access, cp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, join } from "node:path";

const source = fileURLToPath(
  new URL("../../../apps/local/.next/", import.meta.url),
);
const target = fileURLToPath(new URL("../dist/local-app/", import.meta.url));
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
await cp(
  join(source, "standalone/apps/local/node_modules/material-icon-theme"),
  join(target, "apps/local/node_modules/material-icon-theme"),
  { recursive: true },
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
