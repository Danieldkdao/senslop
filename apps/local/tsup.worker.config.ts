import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/services/analysis/source-analysis-worker.ts"],
  outDir: ".analysis",
  format: ["esm"],
  outExtension: () => ({ js: ".mjs" }),
  target: "node24",
  removeNodeProtocol: false,
  noExternal: [/^@senslop\//, "zod", "@t3-oss/env-core", "dependency-cruiser"],
  external: [
    "typescript",
    "tree-sitter",
    "tree-sitter-go",
    "tree-sitter-python",
    "enhanced-resolve/lib/createInnerCallback",
  ],
  banner: {
    js: 'import { createRequire as workerCreateRequire } from "node:module"; const require = workerCreateRequire(import.meta.url);',
  },
  clean: true,
});
