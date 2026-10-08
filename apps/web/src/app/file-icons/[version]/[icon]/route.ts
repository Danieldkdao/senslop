import { readFile } from "node:fs/promises";
import { join } from "node:path";
import manifest from "material-icon-theme/dist/material-icons.json";
import { version as packageVersion } from "material-icon-theme/package.json";

const assets = new Set(
  Object.values(manifest.iconDefinitions).map(({ iconPath }) =>
    iconPath.split("/").at(-1),
  ),
);

type IconRouteContext = { params: Promise<{ version: string; icon: string }> };

export const GET = async (_request: Request, { params }: IconRouteContext) => {
  const { version, icon } = await params;
  if (version !== packageVersion || !assets.has(icon))
    return new Response(null, { status: 404 });
  try {
    // Next runs from the web workspace; tracing includes these package assets for deployment.
    const svg = await readFile(
      join(process.cwd(), "node_modules/material-icon-theme/icons", icon),
      "utf8",
    );
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
};
