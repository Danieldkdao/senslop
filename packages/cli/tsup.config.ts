import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node24",
  // SQLite is a prefix-only Node built-in; stripping node: makes the CLI unloadable.
  removeNodeProtocol: false,
  clean: true,
  sourcemap: true,
  noExternal: [/^@senslop\//],
});
