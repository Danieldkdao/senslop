import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  // Dynamic SVG reads must remain available in traced deployments.
  outputFileTracingIncludes: {
    "/file-icons/*": [
      "./node_modules/material-icon-theme/package.json",
      "./node_modules/material-icon-theme/icons/*.svg",
    ],
  },
};
export default nextConfig;
