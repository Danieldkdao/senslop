import { afterAll, expect, test } from "vitest";
import { disposeHighlighter, preloadHighlighter } from "@pierre/diffs";
import {
  defaultDiffSettings,
  darkDiffThemes,
  lightDiffThemes,
} from "../constants";
import { getDiffOptions, getDiffStyle } from "../lib/diff-options";
import type { DiffFont } from "../types";

afterAll(disposeHighlighter);

test("default follows system appearance while explicit editor themes keep their own color mode", () => {
  expect(getDiffOptions(defaultDiffSettings, "split", "dark")).toMatchObject({
    theme: { light: "pierre-light", dark: "pierre-dark" },
    themeType: "dark",
  });
  expect(
    getDiffOptions(
      { ...defaultDiffSettings, theme: "github-light" },
      "unified",
      "dark",
    ),
  ).toMatchObject({
    theme: "github-light",
    themeType: "light",
    diffStyle: "unified",
  });
  expect(
    getDiffOptions(
      { ...defaultDiffSettings, theme: "dracula" },
      "split",
      "light",
    ),
  ).toMatchObject({
    theme: "dracula",
    themeType: "dark",
  });
});

test("all twenty offered themes can load through the installed diff renderer", async () => {
  expect(lightDiffThemes).toHaveLength(10);
  expect(darkDiffThemes).toHaveLength(10);
  await preloadHighlighter({
    themes: [...lightDiffThemes, ...darkDiffThemes],
    langs: ["typescript"],
  });
});

test("typography is scoped to the diff with explicit pixel units", () => {
  expect(
    getDiffStyle({
      ...defaultDiffSettings,
      font: "fira-code",
      fontSize: 32,
      lineHeight: 28,
    }),
  ).toMatchObject({
    "--diffs-font-family": 'var(--font-fira-code), "Fira Code", monospace',
    "--diffs-font-size": "32px",
    "--diffs-line-height": "28px",
  });
  expect(getDiffStyle(defaultDiffSettings)["--diffs-font-family"]).toContain(
    "--font-mono",
  );
});

test("a retired font in an already open tab falls back to the current default", () => {
  expect(
    getDiffStyle({ ...defaultDiffSettings, font: "berkeley-mono" as DiffFont })[
      "--diffs-font-family"
    ],
  ).toContain("--font-mono");
});
