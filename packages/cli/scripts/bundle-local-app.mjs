import { access, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, join } from "node:path";

const source = fileURLToPath(
  new URL("../../../apps/local/.next/", import.meta.url),
);
const target = fileURLToPath(new URL("../dist/local-app/", import.meta.url));
await access(join(source, "standalone/apps/local/server.js"));
// npm drops symlinks; copy the app separately and flatten pnpm's traced runtime aliases.
await cp(join(source, "standalone"), target, {
  recursive: true,
  filter: (path) =>
    !basename(path).startsWith(".env") &&
    !["node_modules", "cache"].includes(basename(path)),
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
await cp(join(source, "static"), join(target, "apps/local/.next/static"), {
  recursive: true,
});
await cp(
  fileURLToPath(
    new URL("../src/features/workspace/parent-monitor.mjs", import.meta.url),
  ),
  fileURLToPath(new URL("../dist/parent-monitor.mjs", import.meta.url)),
);
