// @vitest-environment jsdom

import { useState } from "react";
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiffSettings } from "../components/diff-settings";
import { defaultDiffSettings } from "../constants";

afterEach(cleanup);

test("the gear exposes every styling control and retains changes after closing", async () => {
  const Harness = () => {
    const [settings, setSettings] = useState(defaultDiffSettings);
    return <DiffSettings settings={settings} onChange={setSettings} />;
  };
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Diff settings" }));
  await user.click(screen.getByRole("button", { name: "Classic" }));
  await user.click(screen.getByRole("combobox", { name: "Inline changes" }));
  await user.click(await screen.findByRole("option", { name: "Character" }));
  await user.click(screen.getByRole("switch", { name: "Backgrounds" }));
  await user.click(screen.getByRole("switch", { name: "Wrapping" }));
  await user.click(screen.getByRole("switch", { name: "Line numbers" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Diff settings" }));
  expect(
    screen
      .getByRole("button", { name: "Classic" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    screen.getByRole("combobox", { name: "Inline changes" }).textContent,
  ).toContain("Character");
  expect(
    screen
      .getByRole("switch", { name: "Backgrounds" })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect(
    screen
      .getByRole("switch", { name: "Wrapping" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  expect(
    screen
      .getByRole("switch", { name: "Line numbers" })
      .getAttribute("aria-checked"),
  ).toBe("false");
});
