import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const localRequire = createRequire(
  new URL("./apps/local/package.json", import.meta.url),
);
const babel = localRequire("next/dist/compiled/babel/core") as {
  transformSync: (
    code: string,
    options: Record<string, unknown>,
  ) => { code?: string } | null;
};

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    {
      name: "chat-composer-react-compiler",
      enforce: "pre",
      transform(code, id) {
        // Plain JSX tests missed the stale field binding caused by production memoization.
        if (!id.endsWith("/features/agents/components/agent-form.tsx")) return;
        return babel.transformSync(code, {
          filename: id,
          parserOpts: { plugins: ["typescript", "jsx"] },
          plugins: [localRequire("babel-plugin-react-compiler")],
          configFile: false,
          babelrc: false,
        })?.code;
      },
    },
  ],
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
        find: "@/hooks/use-confirm",
        replacement: fileURLToPath(
          new URL("./packages/ui/src/hooks/use-confirm.tsx", import.meta.url),
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
