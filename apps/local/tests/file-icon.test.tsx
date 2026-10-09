// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { FileIcon } from "@/components/file-icon";

const state = vi.hoisted(() => ({ theme: "dark" }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: state.theme }),
}));

afterEach(() => {
  cleanup();
  state.theme = "dark";
});

test.each([
  ["src/index.ts", "typescript"],
  ["src/component.tsx", "react_ts"],
  ["PACKAGE.JSON", "nodejs"],
  ["src/schema.json", "json"],
  ["src/types.d.ts", "typescript-def"],
  ["src/file.test.ts", "test-ts"],
  ["Dockerfile", "docker"],
  [".gitignore", "git"],
  ["C:\\repo\\INDEX.TS", "typescript"],
  [".config/graphqlrc", "graphql"],
  ["unknown.unknown", "file"],
  ["README", "readme"],
  ["", "file"],
  ["__proto__", "file"],
])("%s resolves to the Material %s icon", (fileName, icon) => {
  const { container } = render(<FileIcon fileName={fileName} />);
  const image = container.querySelector("img");
  expect(image?.getAttribute("src")).toBe(`/file-icons/5.39.0/${icon}.svg`);
  expect(image?.getAttribute("alt")).toBe("");
  expect(image?.getAttribute("width")).toBe("20");
  expect(image?.getAttribute("height")).toBe("20");
});

test.each([
  ["src", "folder-src"],
  ["repo/node_modules/", "folder-node"],
  ["unknown", "folder"],
  ["__proto__", "folder"],
])("isDir maps %s to %s", (fileName, icon) => {
  const { container } = render(<FileIcon fileName={fileName} isDir />);
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    `/file-icons/5.39.0/${icon}.svg`,
  );
});

test("theme changes switch light-specific icons without changing file associations", () => {
  const view = render(<FileIcon fileName="next.config.ts" />);
  expect(view.container.querySelector("img")?.getAttribute("src")).toContain(
    "/next.svg",
  );
  state.theme = "light";
  view.rerender(<FileIcon fileName="next.config.ts" />);
  expect(view.container.querySelector("img")?.getAttribute("src")).toContain(
    "/next_light.svg",
  );
  view.rerender(<FileIcon fileName="index.ts" />);
  expect(view.container.querySelector("img")?.getAttribute("src")).toContain(
    "/typescript.svg",
  );
});
