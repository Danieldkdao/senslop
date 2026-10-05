import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) },
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: [
      "apps/**/tests/**/*.test.ts",
      "apps/**/tests/**/*.test.tsx",
      "packages/**/tests/**/*.test.ts",
    ],
    testTimeout: 15000,
    restoreMocks: true,
  },
});
