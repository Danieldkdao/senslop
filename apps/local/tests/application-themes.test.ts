import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  applicationThemes,
  lightApplicationThemes,
  darkApplicationThemes,
} from "@/lib/constants";
import { formatApplicationThemeMode } from "@/lib/formatters";

test("application themes provide ten choices per mode plus System", () => {
  expect(lightApplicationThemes).toHaveLength(10);
  expect(darkApplicationThemes).toHaveLength(10);
  expect(new Set(applicationThemes).size).toBe(21);
  expect(formatApplicationThemeMode("nord-dark")).toBe("dark");
  expect(formatApplicationThemeMode("sage-light")).toBe("light");
  expect(formatApplicationThemeMode("system", "dark")).toBe("dark");
});

const luminance = (hex: string) => {
  const values = hex.match(/[a-f\d]{2}/gi)!.map((part) => {
    const channel = parseInt(part, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
};

test("every added palette has distinct surfaces and readable text and buttons", () => {
  const css = readFileSync(
    new URL("../../../packages/ui/src/application-themes.css", import.meta.url),
    "utf8",
  );
  const backgrounds = new Set<string>();
  for (const theme of applicationThemes.filter(
    (value) => !["light", "dark", "system"].includes(value),
  )) {
    const body = css.match(new RegExp(`\\.${theme}\\s*\\{([^}]+)\\}`))?.[1];
    expect(body, theme).toBeTruthy();
    const colors = Object.fromEntries(
      [...body!.matchAll(/--palette-([\w-]+):\s*(#[a-f\d]{6})/gi)].map(
        ([, name, color]) => [name, color!],
      ),
    );
    backgrounds.add(colors.background!);
    for (const [text, surface] of [
      ["foreground", "background"],
      ["foreground", "surface"],
      ["muted-foreground", "muted"],
      ["muted-foreground", "background"],
      ["primary-foreground", "primary"],
    ]) {
      const levels = [
        luminance(colors[text!]!),
        luminance(colors[surface!]!),
      ].sort((a, b) => b - a);
      expect(
        (levels[0]! + 0.05) / (levels[1]! + 0.05),
        `${theme}: ${text} on ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(backgrounds.size).toBe(18);
});

test("Default editor colors cannot inherit an application palette", () => {
  const css = readFileSync(
    new URL("../../../packages/ui/src/global.css", import.meta.url),
    "utf8",
  );
  const editor = css.match(/\.preview-diff-default\s*\{([^}]+)\}/)![1];
  expect(css).toContain(".preview-diff-default-dark");
  expect(editor).not.toContain("light-dark(");
  expect(editor).not.toMatch(
    /var\(--(?:primary|destructive|background|muted|palette-)/,
  );
});
