// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/components/providers";
import { ApplicationThemeSelect } from "../components/application-theme-select";
import { EditorDiffPreview } from "../components/editor-diff-preview";
import { defaultDiffSettings } from "../../review/constants";
import type { MultiFileDiffProps } from "@pierre/diffs/react";

const sample = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ Toaster: () => null }));
vi.mock("../../review/hooks/use-diff-highlighter", () => ({
  useDiffHighlighter: () => ({ ready: true }),
}));
vi.mock("@pierre/diffs/react", () => ({
  MultiFileDiff: (props: MultiFileDiffProps<undefined, undefined>) => {
    sample.render(props);
    return <div>Sample</div>;
  },
}));
let systemDark = true;
let listeners: ((event: { matches: boolean }) => void)[] = [];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("theme", "sage-light");
  document.documentElement.className = "font-variable";
  document.documentElement.removeAttribute("data-theme");
  systemDark = true;
  listeners = [];
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: systemDark,
      addListener: (listener: (event: { matches: boolean }) => void) =>
        listeners.push(listener),
      removeListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sample.render.mockClear();
});

const Harness = ({ show = true, explicit = false }) => (
  <Providers>
    {show && <ApplicationThemeSelect />}
    <EditorDiffPreview
      settings={
        explicit
          ? { ...defaultDiffSettings, theme: "dracula" }
          : defaultDiffSettings
      }
      view="split"
    />
  </Providers>
);

test.each([false, true])(
  "hover previews globally without saving or changing the editor; Escape restores and selection persists, explicit editor: %s",
  async (explicit) => {
    render(<Harness explicit={explicit} />);
    const user = userEvent.setup();
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("sage-light"),
    );
    const options = () => sample.render.mock.lastCall![0].options;
    const initial = options();
    expect(initial?.themeType).toBe("dark");
    if (!explicit)
      expect(sample.render.mock.lastCall![0].className).toContain(
        "preview-diff-default-dark",
      );
    await user.click(
      screen.getByRole("combobox", { name: "Application theme" }),
    );
    expect(await screen.findAllByRole("option")).toHaveLength(21);
    expect(
      within(screen.getByRole("group", { name: "Light themes" })).getAllByRole(
        "option",
      ),
    ).toHaveLength(10);
    expect(
      within(screen.getByRole("group", { name: "Dark themes" })).getAllByRole(
        "option",
      ),
    ).toHaveLength(10);
    const nord = screen.getByRole("option", { name: "Nord" });
    await user.hover(nord);
    expect(document.documentElement.dataset.theme).toBe("nord-dark");
    expect(document.documentElement.classList.contains("nord-dark")).toBe(true);
    expect(document.documentElement.classList.contains("font-variable")).toBe(
      true,
    );
    expect(localStorage.getItem("theme")).toBe("sage-light");
    expect(options()).toEqual(initial);
    if (!explicit)
      expect(sample.render.mock.lastCall![0].className).toContain(
        "preview-diff-default-dark",
      );
    await user.unhover(nord);
    expect(document.documentElement.dataset.theme).toBe("sage-light");
    await user.hover(nord);
    await user.keyboard("{Escape}");
    expect(document.documentElement.dataset.theme).toBe("sage-light");
    await user.click(
      screen.getByRole("combobox", { name: "Application theme" }),
    );
    await user.click(await screen.findByRole("option", { name: "Nord" }));
    await waitFor(() =>
      expect(localStorage.getItem("theme")).toBe("nord-dark"),
    );
    expect(options()).toEqual(initial);
    expect(
      screen.getByRole("combobox", { name: "Application theme" }).textContent,
    ).toContain("Nord");
  },
);

test("keyboard previews cancel on unmount, and System restores the latest OS preference", async () => {
  localStorage.setItem("theme", "system");
  const view = render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Application theme" }));
  await screen.findByRole("option", { name: "Default Light" });
  await user.keyboard("{ArrowDown}");
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(localStorage.getItem("theme")).toBe("system");
  systemDark = false;
  act(() => listeners.forEach((listener) => listener({ matches: false })));
  await user.keyboard("{Escape}");
  expect(document.documentElement.dataset.theme).toBe("light");
  await user.click(screen.getByRole("combobox", { name: "Application theme" }));
  await user.hover(await screen.findByRole("option", { name: "Espresso" }));
  expect(document.documentElement.dataset.theme).toBe("espresso-dark");
  view.rerender(<Harness show={false} />);
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.documentElement.hasAttribute("data-theme-preview")).toBe(
    false,
  );
});
