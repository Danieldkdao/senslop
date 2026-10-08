import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createRequire } from "node:module";
import { access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "material-icon-theme/dist/material-icons.json";
import { GET } from "../src/app/file-icons/[version]/[icon]/route";

beforeEach(() => {
  vi.spyOn(process, "cwd").mockReturnValue(
    fileURLToPath(new URL("../", import.meta.url)),
  );
});
afterEach(() => vi.restoreAllMocks());

const requestIcon = (icon: string, version = "5.39.0") =>
  GET(new Request(`http://localhost/file-icons/${version}/${icon}`), {
    params: Promise.resolve({ version, icon }),
  });

test("Material SVG assets are served locally with cache and content headers", async () => {
  const response = await requestIcon("typescript.svg");
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
  expect(response.headers.get("Cache-Control")).toContain("immutable");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(await response.text()).toContain("<svg");
});

test.each(["../package.json", "package.json", "missing.svg", "__proto__.svg"])(
  "unknown or invalid asset %s cannot read arbitrary files",
  async (icon) => {
    expect((await requestIcon(icon)).status).toBe(404);
  },
);

test("a stale package version cannot serve a differently cached asset", async () => {
  expect((await requestIcon("typescript.svg", "0.0.0")).status).toBe(404);
});

test("every manifest icon points to an existing packaged SVG", async () => {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve("material-icon-theme/package.json"));
  await Promise.all(
    Object.values(manifest.iconDefinitions).map(({ iconPath }) =>
      access(join(root, "dist", iconPath)),
    ),
  );
});
