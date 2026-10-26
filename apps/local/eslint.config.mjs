import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Keep CLI-generated shadcn files intact while surfacing upstream effect warnings.
    files: ["src/components/ui/carousel.tsx", "src/hooks/use-mobile.ts"],
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".analysis/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

export const nodeConfig = defineConfig([...nextTs, globalIgnores(["dist/**"])]);
