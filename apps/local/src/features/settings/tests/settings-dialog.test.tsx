// @vitest-environment jsdom
import { useState } from "react";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { ReviewSettings } from "../components/review-settings";
import { defaultDiffSettings } from "../../review/constants";
import { parseDiffFromFile } from "@pierre/diffs";
import type { MultiFileDiffProps } from "@pierre/diffs/react";
import type { ProviderId, PublicConnectionSchema } from "@senslop/contracts";

vi.mock("../hooks/use-review-preferences", () => ({
  useReviewPreferences: () => ({
    preferences: { data: { autoAdvance: false } },
    saving: false,
    save: vi.fn(),
  }),
}));
vi.mock("../../agents/hooks/use-ai-settings", async () => {
  const { defaultAiSettings } = await import("../../agents/constants");
  return {
    useAiSettings: () => ({
      settings: { data: defaultAiSettings },
      save: vi.fn(async () => {}),
    }),
  };
});
const preview = vi.hoisted(() => ({ render: vi.fn(), theme: "dark" }));
vi.mock("../../review/hooks/use-diff-highlighter", () => ({
  useDiffHighlighter: () => ({ ready: true, error: false, retry: vi.fn() }),
}));
const originalScrollTo = HTMLElement.prototype.scrollTo;
vi.mock("../../providers/hooks/use-provider-models", () => ({
  useProviderModels: () => ({
    settings: { data: { connections: [], defaultId: null } },
    entries: [],
    refresh: vi.fn(),
  }),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: preview.theme,
    resolvedTheme: preview.theme,
    setTheme: vi.fn(),
  }),
}));
vi.mock("@pierre/diffs/react", () => ({
  MultiFileDiff: (props: MultiFileDiffProps<undefined, undefined>) => {
    preview.render(props);
    return <div>Sample diff rendered</div>;
  },
}));
vi.mock("../../../components/provider-icon", () => ({
  ProviderIcon: () => <span />,
}));
vi.mock("@/components/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
afterEach(() => {
  cleanup();
  HTMLElement.prototype.scrollTo = originalScrollTo;
  vi.unstubAllGlobals();
  preview.render.mockClear();
  preview.theme = "dark";
});

test.each([
  ["ollama", "Ollama", "http://localhost:11434"],
  ["lm-studio", "LM Studio", "http://localhost:1234/v1"],
  ["llama-cpp", "llama.cpp", "http://localhost:8080/v1"],
] as const)(
  "%s check feedback survives navigation and retries only the saved connection",
  async (provider, label, baseURL) => {
    const connection: PublicConnectionSchema = {
      id: "00000000-0000-4000-8000-000000000005",
      provider: provider as ProviderId,
      name: label,
      baseURL,
      model: "",
      contextWindow: null,
      configured: false,
      credentialError: null,
    };
    let saved = false;
    let valid = false;
    const calls: object[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options?: RequestInit) => {
        if (!options?.body)
          return {
            ok: true,
            json: async () => ({
              connections: saved ? [connection] : [],
              defaultId: null,
              cleanupPending: false,
            }),
          };
        const body = JSON.parse(String(options.body));
        calls.push(body);
        if (body.action === "save") {
          saved = true;
          return {
            ok: true,
            json: async () => ({ connection, warning: null }),
          };
        }
        return {
          ok: valid,
          json: async () =>
            valid
              ? { supported: true, models: [], message: "Metadata received." }
              : { message: "Server unavailable." },
        };
      }),
    );
    const user = userEvent.setup();
    render(
      <ReviewSettings
        settings={defaultDiffSettings}
        onChange={vi.fn()}
        view="split"
        onViewChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(
      screen.getByRole("button", { name: "Configure Providers" }),
    );
    await user.click(
      await screen.findByRole("button", { name: `Configure ${label}` }),
    );
    await user.click(screen.getByRole("button", { name: "Save connection" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Server unavailable.",
    );
    await user.click(screen.getByRole("button", { name: "Back to settings" }));
    await user.click(
      await screen.findByRole("button", { name: `Configure ${label}` }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Server unavailable.",
    );
    valid = true;
    await user.click(
      screen.getByRole("button", { name: "Retry connection check" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Metadata received.",
      ),
    );
    expect(calls).toHaveLength(3);
    expect(calls[2]).toEqual({ action: "test", id: connection.id });
    expect(screen.queryByRole("alert")).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(
      screen.getByRole("button", { name: "Configure Providers" }),
    );
    await user.click(
      await screen.findByRole("button", { name: `Configure ${label}` }),
    );
    expect(screen.queryByText(/Metadata received/)).toBeNull();
  },
);

test("editor preview follows every diff control with representative code and no review actions", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        connections: [],
        defaultId: null,
        cleanupPending: false,
      }),
    }),
  );
  const Harness = () => {
    const [settings, setSettings] = useState(defaultDiffSettings);
    const [view, setView] = useState<"split" | "unified">("split");
    return (
      <ReviewSettings
        settings={settings}
        onChange={setSettings}
        view={view}
        onViewChange={setView}
      />
    );
  };
  const user = userEvent.setup();
  const rendered = render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const region = screen.getByRole("region", { name: "Diff preview" });
  expect(within(region).getByText("Sample diff rendered")).toBeTruthy();
  const props = () =>
    preview.render.mock.lastCall![0] as MultiFileDiffProps<
      undefined,
      undefined
    >;
  const initial = props();
  const patch = parseDiffFromFile(initial.oldFile, initial.newFile);
  expect(
    patch.hunks.some((hunk) =>
      hunk.hunkContent.some((content) => content.type === "context"),
    ),
  ).toBe(true);
  expect(patch.deletionLines.join("")).toContain("const retryLimit = 3;");
  expect(patch.additionLines.join("")).toContain("const retryLimit = 5;");
  expect(patch.deletionLines.join("")).toContain('"Hello"');
  expect(patch.additionLines.join("")).toContain('"Welcome"');
  expect(patch.additionLines.some((line) => line.length > 150)).toBe(true);
  expect(initial.options).toMatchObject({
    diffStyle: "split",
    themeType: "dark",
  });
  expect(initial.options?.enableGutterUtility).toBeFalsy();
  expect(initial.options?.onLineNumberClick).toBeUndefined();
  expect(initial.lineAnnotations).toBeUndefined();
  expect(initial.edit).toBeFalsy();
  await user.click(screen.getByRole("button", { name: "Unified" }));
  expect(props().options?.diffStyle).toBe("unified");
  for (const indicator of ["Classic", "None", "Bars"]) {
    await user.click(
      within(
        screen.getByRole("group", { name: "Change indicators" }),
      ).getByRole("button", { name: indicator }),
    );
    expect(props().options?.diffIndicators).toBe(indicator.toLowerCase());
  }
  for (const [label, value] of [
    ["Word", "word"],
    ["Character", "char"],
    ["None", "none"],
    ["Word-line", "word-line"],
    ["Word-alt", "word-alt"],
  ]) {
    await user.click(screen.getByRole("combobox", { name: "Inline changes" }));
    await user.click(await screen.findByRole("option", { name: label }));
    expect(props().options?.lineDiffType).toBe(value);
  }
  await user.click(screen.getByRole("switch", { name: "Backgrounds" }));
  await user.click(screen.getByRole("switch", { name: "Wrapping" }));
  await user.click(screen.getByRole("switch", { name: "Line numbers" }));
  expect(props().options).toMatchObject({
    disableBackground: true,
    overflow: "wrap",
    disableLineNumbers: true,
  });
  expect(props().oldFile).toBe(initial.oldFile);
  expect(props().newFile).toBe(initial.newFile);
  preview.theme = "light";
  rendered.rerender(<Harness />);
  expect(props().options?.themeType).toBe("light");
  expect(screen.queryByLabelText("Comment")).toBeNull();
  expect(screen.queryByRole("button", { name: "Mark reviewed" })).toBeNull();
});
test("one settings dialog orders appearance/editor/AI, search navigates nested local config and breadcrumbs return", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        connections: [],
        defaultId: null,
        cleanupPending: false,
      }),
    }),
  );
  const Harness = () => {
    const [settings, setSettings] = useState(defaultDiffSettings);
    const [view, setView] = useState<"split" | "unified">("split");
    return (
      <ReviewSettings
        settings={settings}
        onChange={setSettings}
        view={view}
        onViewChange={setView}
      />
    );
  };
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const headings = screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent);
  expect(headings.slice(1)).toEqual([
    "Appearance",
    "Review Preferences",
    "Editor",
    "AI",
  ]);
  const sidebar = within(
    screen.getByRole("navigation", { name: "Settings sections" }),
  );
  await user.click(sidebar.getByRole("button", { name: "AI" }));
  await user.click(sidebar.getByRole("button", { name: "Providers" }));
  expect(screen.getByRole("heading", { name: "Providers" })).toBeTruthy();
  expect(
    await screen.findByRole("button", { name: "Configure Ollama" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Configure LM Studio" }),
  ).toBeTruthy();
  expect(sidebar.queryByRole("button", { name: "Ollama" })).toBeNull();
  await user.click(sidebar.getByRole("button", { name: "Providers" }));
  expect(
    within(
      screen.getByRole("navigation", { name: "Settings breadcrumb" }),
    ).getAllByRole("button", { name: "Providers" }),
  ).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Back to settings" }));
  await user.type(screen.getByLabelText("Search settings"), "ollama");
  expect(
    sidebar.getAllByRole("button").map((button) => button.textContent),
  ).toEqual(["AI", "Providers"]);
  await user.click(sidebar.getByRole("button", { name: "Providers" }));
  await user.click(
    await screen.findByRole("button", { name: "Configure Ollama" }),
  );
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByLabelText("API base URL")).toBeTruthy();
  expect(screen.queryByLabelText(/Connection name/)).toBeNull();
  await user.click(screen.getByRole("button", { name: "Back to settings" }));
  expect(
    await screen.findByRole("button", { name: "Configure Ollama" }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Back to settings" }));
  await user.clear(screen.getByLabelText("Search settings"));
  await user.click(screen.getByRole("button", { name: "Unified" }));
  expect(
    screen
      .getByRole("button", { name: "Unified" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("standalone provider settings has one sidebar entry and all providers in its content", async () => {
  HTMLElement.prototype.scrollTo = vi.fn();
  const { ProviderSettingsDialog } =
    await import("../components/provider-settings-dialog");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        connections: [],
        defaultId: null,
        cleanupPending: false,
      }),
    }),
  );
  render(<ProviderSettingsDialog open onOpenChange={vi.fn()} />);
  const sidebar = within(
    screen.getByRole("navigation", { name: "Settings sections" }),
  );
  const providers = sidebar.getByRole("button", { name: "Providers" });
  expect(providers.hasAttribute("aria-expanded")).toBe(false);
  expect(sidebar.getAllByRole("button")).toHaveLength(1);
  expect(
    await screen.findByRole("button", { name: "Configure Ollama" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Configure LM Studio" }),
  ).toBeTruthy();
});

test("only nested contents collapse; provider touch targets toggle without jumping and search reveals links", async () => {
  const { SettingsDialog } = await import("../components/settings-dialog");
  const user = userEvent.setup();
  render(
    <SettingsDialog>
      {() => [
        {
          id: "appearance",
          label: "Appearance",
          keywords: "appearance",
          content: <p>Theme preferences</p>,
        },
        {
          id: "providers",
          label: "Providers",
          keywords: "providers",
          content: <p>Provider preferences</p>,
          links: [{ id: "ollama", label: "Ollama" }],
        },
      ]}
    </SettingsDialog>,
  );
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const sidebar = screen.getByRole("navigation", { name: "Settings sections" });
  const appearance = sidebar.querySelector("button")!;
  expect(appearance.hasAttribute("aria-expanded")).toBe(false);
  const providers = Array.from(sidebar.querySelectorAll("button")).find(
    (button) => button.textContent === "Providers",
  )!;
  expect(providers.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("button", { name: "Ollama" })).toBeNull();
  await user.click(providers);
  expect(providers.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("button", { name: "Ollama" })).toBeTruthy();
  await user.click(providers);
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Ollama" })).toBeNull(),
  );
  await user.type(screen.getByLabelText("Search settings"), "ollama");
  expect(screen.getByRole("button", { name: "Ollama" })).toBeTruthy();
});
