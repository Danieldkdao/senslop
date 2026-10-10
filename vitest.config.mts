import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: {
    alias: [
      {
        find: "@/components/ui",
        replacement: fileURLToPath(
          new URL("./packages/ui/src/components/ui", import.meta.url),
        ),
      },
      {
        find: "@/hooks/use-mobile",
        replacement: fileURLToPath(
          new URL("./packages/ui/src/hooks/use-mobile.ts", import.meta.url),
        ),
      },
      {
        find: "@/lib/utils",
        replacement: fileURLToPath(
          new URL("./packages/ui/src/lib/utils.ts", import.meta.url),
        ),
      },
      {
        find: "@/lib/constants",
        replacement: fileURLToPath(
          new URL("./packages/ui/src/lib/constants.ts", import.meta.url),
        ),
      },
      {
        find: "@/lib/types",
        replacement: fileURLToPath(
          new URL("./packages/ui/src/lib/types.ts", import.meta.url),
        ),
      },
      {
        find: "@/lib/formatters",
        replacement: fileURLToPath(
          new URL("./packages/ui/src/lib/formatters.ts", import.meta.url),
        ),
      },
      {
        find: "@/components/providers",
        replacement: fileURLToPath(
          new URL(
            "./packages/ui/src/components/providers.tsx",
            import.meta.url,
          ),
        ),
      },
      {
        find: "@/components/buddy",
        replacement: fileURLToPath(
          new URL("./packages/ui/src/components/buddy.tsx", import.meta.url),
        ),
      },
      {
        find: "@/components/theme-toggle",
        replacement: fileURLToPath(
          new URL(
            "./packages/ui/src/components/theme-toggle.tsx",
            import.meta.url,
          ),
        ),
      },
      {
        find: "@/components/file-icon",
        replacement: fileURLToPath(
          new URL(
            "./packages/ui/src/components/file-icon.tsx",
            import.meta.url,
          ),
        ),
      },
      {
        find: "@/features/review",
        replacement: fileURLToPath(
          new URL("./apps/local/src/features/review", import.meta.url),
        ),
      },
      {
        find: "@/features/workspace",
        replacement: fileURLToPath(
          new URL("./apps/local/src/features/workspace", import.meta.url),
        ),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("./apps/web/src", import.meta.url)),
      },
    ],
  },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    server: {
      deps: { inline: ["@lobehub/icons", "@lobehub/ui", "@emoji-mart/data"] },
    },
    include: [
      "apps/**/tests/**/*.test.ts",
      "apps/**/tests/**/*.test.tsx",
      "packages/**/tests/**/*.test.ts",
    ],
    testTimeout: 15000,
    restoreMocks: true,
  },
});
