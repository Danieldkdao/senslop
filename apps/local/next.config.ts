import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  output: "standalone",
  images: { unoptimized: true },
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  reactCompiler: true,
  outputFileTracingIncludes: {
    "/file-icons/*": [
      "./node_modules/material-icon-theme/package.json",
      "./node_modules/material-icon-theme/icons/*.svg",
    ],
  },
};

export default nextConfig;
