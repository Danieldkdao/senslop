// @vitest-environment jsdom

import { afterEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/components/providers";
import { LocalPreferences } from "../components/local-preferences";
import { ApplicationThemeSelect } from "../components/application-theme-select";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUiPreferences } from "../hooks/use-ui-preferences";
import { defaultUiPreferences } from "../constants";
import { mergeUiPreferences } from "../lib/ui-preferences";
import type { ReactNode } from "react";

vi.mock("../../workspace/hooks/use-workspace-updates", () => ({
  useWorkspaceUpdates: vi.fn(),
}));

const feedback = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({
  toast: feedback,
  Toaster: () => null,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const mount = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(useUiPreferences, { wrapper });
};

test("rapid changes update immediately, serialize saves, and restore from the server on a fresh mount", async () => {
  let saved = defaultUiPreferences;
  let finishFirst: (() => void) | undefined;
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method === "PATCH") {
        writes++;
        if (writes === 1)
          await new Promise<void>((resolve) => {
            finishFirst = resolve;
          });
        saved = mergeUiPreferences(saved, JSON.parse(options.body));
      }
      return Response.json(saved);
    }),
  );
  const { result, unmount } = mount();
  await waitFor(() => expect(result.current.preferences.isSuccess).toBe(true));
  act(() => {
    result.current.save({ editor: { fontSize: 20 } });
    result.current.save({ editor: { lineHeight: 28 }, view: "unified" });
  });
  await waitFor(() =>
    expect(result.current.values.editor).toMatchObject({
      fontSize: 20,
      lineHeight: 28,
    }),
  );
  expect(writes).toBe(1);
  await act(async () => finishFirst!());
  await waitFor(() =>
    expect(saved).toMatchObject({
      editor: { fontSize: 20, lineHeight: 28 },
      view: "unified",
    }),
  );
  unmount();
  const next = mount();
  await waitFor(() =>
    expect(next.result.current.values).toMatchObject({
      editor: { fontSize: 20, lineHeight: 28 },
      view: "unified",
    }),
  );
});

test("a failed save reports failure and restores the last confirmed setting", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) =>
      Response.json(defaultUiPreferences, {
        status: options?.method === "PATCH" ? 503 : 200,
      }),
    ),
  );
  const { result } = mount();
  await waitFor(() => expect(result.current.preferences.isSuccess).toBe(true));
  act(() => result.current.save({ editor: { fontSize: 30 } }));
  await waitFor(() => expect(feedback.error).toHaveBeenCalled());
  await waitFor(() => expect(result.current.values.editor.fontSize).toBe(16));
});

test("an older background load cannot replace a newer saved setting", async () => {
  let reads = 0;
  let finishLoad: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method === "PATCH")
        return Response.json(
          mergeUiPreferences(defaultUiPreferences, JSON.parse(options.body)),
        );
      if (++reads === 2)
        return new Promise<Response>((resolve) => {
          finishLoad = resolve;
        });
      return Response.json(defaultUiPreferences);
    }),
  );
  const { result } = mount();
  await waitFor(() => expect(result.current.preferences.isSuccess).toBe(true));
  act(() => {
    void result.current.preferences.refetch();
  });
  await waitFor(() => expect(finishLoad).toBeDefined());
  act(() => result.current.save({ editor: { fontSize: 24 } }));
  await waitFor(() => expect(result.current.saving).toBe(false));
  await act(async () => finishLoad!(Response.json(defaultUiPreferences)));
  expect(result.current.values.editor.fontSize).toBe(24);
});

const ThemeControl = () => {
  const { preferences, save } = useUiPreferences();
  return (
    <ApplicationThemeSelect
      disabled={!preferences.isSuccess}
      onChange={(applicationTheme) => save({ applicationTheme })}
    />
  );
};
const mountAppearance = () =>
  render(
    <Providers>
      <LocalPreferences>
        <ThemeControl />
      </LocalPreferences>
    </Providers>,
  );
const mockSystem = () =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );

test("application theme restores from the database with empty browser storage and hover never persists", async () => {
  mockSystem();
  localStorage.clear();
  let saved = {
    ...defaultUiPreferences,
    applicationTheme: "sage-light" as const,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method === "PATCH")
        saved = { ...saved, ...JSON.parse(options.body) };
      return Response.json(saved);
    }),
  );
  mountAppearance();
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe("sage-light"),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Application theme" }));
  const nord = await screen.findByRole("option", { name: "Nord" });
  await user.hover(nord);
  expect(document.documentElement.dataset.theme).toBe("nord-dark");
  expect(saved.applicationTheme).toBe("sage-light");
  await user.click(nord);
  await waitFor(() => expect(saved.applicationTheme).toBe("nord-dark"));
  cleanup();
  localStorage.clear();
  mountAppearance();
  await waitFor(() =>
    expect(document.documentElement.dataset.theme).toBe("nord-dark"),
  );
});

test("existing browser appearance migrates only after loading preferences without replacing saved editor values", async () => {
  mockSystem();
  localStorage.setItem("theme", "lavender-light");
  let saved = {
    ...defaultUiPreferences,
    editor: { ...defaultUiPreferences.editor, fontSize: 22 },
  };
  let load: ((response: Response) => void) | undefined;
  const writes: object[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (!options?.method)
        return new Promise<Response>((resolve) => {
          load = resolve;
        });
      const patch = JSON.parse(options.body);
      writes.push(patch);
      saved = mergeUiPreferences(saved, patch);
      return Response.json(saved);
    }),
  );
  mountAppearance();
  await waitFor(() => expect(load).toBeDefined());
  expect(writes).toEqual([]);
  await act(async () => load!(Response.json(saved)));
  await waitFor(() =>
    expect(writes).toEqual([{ applicationTheme: "lavender-light" }]),
  );
  expect(saved.editor.fontSize).toBe(22);
});
