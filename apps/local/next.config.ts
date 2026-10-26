import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  output: "standalone",
  images: { unoptimized: true },
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  reactCompiler: true,
  serverExternalPackages: [
    "tree-sitter",
    "tree-sitter-python",
    "tree-sitter-go",
    "@napi-rs/keyring",
    "dependency-cruiser",
    "typescript",
    "ai-sdk-provider-claude-code",
    "@anthropic-ai/claude-agent-sdk",
    "oauth4webapi",
  ],
  logging: {
    // Keep snapshot polling and session capabilities out of the interactive terminal logs.
    incomingRequests: {
      ignore: [
        /^\/api\/(?:preview|health|session|inngest|agents)(?:\/|\?|$)/,
        /^\/auth\/callback(?:\?|$)/,
      ],
    },
  },
  outputFileTracingIncludes: {
    "/*": [
      "./src/app/fonts/cascadia-code-license.txt",
      // The compiler worker and its runtime dependencies must ship with the standalone app.
      "./.analysis/**/*.mjs",
      "./node_modules/typescript/**/*",
      "./node_modules/tree-sitter/**/*",
      "./node_modules/tree-sitter-python/**/*",
      "./node_modules/tree-sitter-go/**/*",
      "./node_modules/node-gyp-build/**/*",
      "./node_modules/@anthropic-ai/claude-agent-sdk/**/*",
      "../../node_modules/.pnpm/@anthropic-ai+claude-agent-sdk*/node_modules/@anthropic-ai/claude-agent-sdk*/**/*",
    ],
    "/file-icons/*": [
      "./node_modules/material-icon-theme/package.json",
      "./node_modules/material-icon-theme/icons/*.svg",
    ],
  },
};

export default nextConfig;
