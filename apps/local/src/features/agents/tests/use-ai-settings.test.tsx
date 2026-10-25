// @vitest-environment jsdom

import type { ReactNode } from "react";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { AiSettings } from "../components/ai-settings";
import { useAiSettings } from "../hooks/use-ai-settings";
import { defaultAiSettings } from "../constants";

const feedback = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: feedback }));

vi.mock("../../providers/hooks/use-provider-models", () => ({
  useProviderModels: () => ({
    entries: [
      {
        connection: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Local",
          provider: "lm-studio",
          contextWindow: null,
        },
        catalog: { models: [{ available: true }] },
      },
    ],
  }),
}));
vi.mock("../../providers/components/model-picker", () => ({
  ModelPicker: () => <button type="button">Select a model</button>,
}));
vi.mock("../../settings/components/provider-settings-dialog", () => ({
  getProviderSettingsSection: () => ({ content: null }),
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
  return renderHook(
    () => ({ editor: useAiSettings(), reader: useAiSettings() }),
    { wrapper },
  );
};

test("AI changes are optimistic across consumers, serialize writes, and persist on remount", async () => {
  let saved = defaultAiSettings;
  const requests: Record<string, unknown>[] = [];
  let finishFirst: (() => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method === "PATCH") {
        const patch = JSON.parse(options.body);
        requests.push(patch);
        if (requests.length === 1)
          await new Promise<void>((resolve) => {
            finishFirst = resolve;
          });
        saved = {
          ...saved,
          ...patch,
          roles: { ...saved.roles, ...patch.roles },
        };
      }
      return Response.json(saved);
    }),
  );
  const { result, unmount } = mount();
  await waitFor(() =>
    expect(result.current.editor.settings.isSuccess).toBe(true),
  );
  act(() => {
    result.current.editor.save({ groupingMode: "ask" });
    result.current.editor.save({
      roles: {
        review: {
          connectionId: "11111111-1111-4111-8111-111111111111",
          modelId: "test",
          name: "Test",
        },
      },
    });
  });
  await waitFor(() =>
    expect(result.current.reader.settings.data).toMatchObject({
      groupingMode: "ask",
      roles: { review: { modelId: "test" }, context: null },
    }),
  );
  expect(requests).toHaveLength(1);
  expect(result.current.reader.saving).toBe(true);
  await act(async () => finishFirst!());
  await waitFor(() => expect(result.current.reader.saving).toBe(false));
  expect(requests).toHaveLength(2);
  expect(saved.groupingMode).toBe("ask");
  unmount();
  const next = mount();
  await waitFor(() =>
    expect(next.result.current.reader.settings.data).toEqual(saved),
  );
  expect(feedback.success).not.toHaveBeenCalled();
});

test("a failed AI save restores confirmed values while preserving newer pending edits", async () => {
  let finishFirst: (() => void) | undefined;
  let finishSecond: (() => void) | undefined;
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method === "PATCH") {
        writes++;
        if (writes === 1) {
          await new Promise<void>((resolve) => {
            finishFirst = resolve;
          });
          return Response.json(
            { message: "Capacity is locked during analysis." },
            { status: 409 },
          );
        }
        await new Promise<void>((resolve) => {
          finishSecond = resolve;
        });
        return Response.json({
          ...defaultAiSettings,
          prompt: "New instructions",
        });
      }
      return Response.json(defaultAiSettings);
    }),
  );
  const { result } = mount();
  await waitFor(() =>
    expect(result.current.editor.settings.isSuccess).toBe(true),
  );
  act(() => {
    result.current.editor.save({ separate: true });
    result.current.editor.save({ prompt: "New instructions" });
  });
  await waitFor(() =>
    expect(result.current.reader.settings.data?.separate).toBe(true),
  );
  await act(async () => finishFirst!());
  await waitFor(() => expect(finishSecond).toBeDefined());
  expect(result.current.reader.settings.data).toMatchObject({
    separate: false,
    prompt: "New instructions",
  });
  expect(feedback.error).toHaveBeenCalledWith(
    expect.stringContaining("Capacity is locked"),
  );
  await act(async () => finishSecond!());
  await waitFor(() => expect(result.current.reader.saving).toBe(false));
  expect(result.current.reader.settings.data?.prompt).toBe("New instructions");
});

test("an older settings refetch cannot overwrite an optimistic save", async () => {
  let finishLoad: ((response: Response) => void) | undefined;
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method === "PATCH")
        return Response.json({ ...defaultAiSettings, groupingMode: "always" });
      if (++reads === 2)
        return new Promise<Response>((resolve) => {
          finishLoad = resolve;
        });
      return Response.json(defaultAiSettings);
    }),
  );
  const { result } = mount();
  await waitFor(() =>
    expect(result.current.editor.settings.isSuccess).toBe(true),
  );
  act(() => {
    void result.current.reader.settings.refetch();
  });
  await waitFor(() => expect(finishLoad).toBeDefined());
  act(() => {
    result.current.editor.save({ groupingMode: "always" });
  });
  await waitFor(() => expect(result.current.reader.saving).toBe(false));
  await act(async () => finishLoad!(Response.json(defaultAiSettings)));
  expect(result.current.reader.settings.data?.groupingMode).toBe("always");
});

test("a failed autosave restores the visible toggle and keeps controls usable during saves", async () => {
  let finish: (() => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (options?.method === "PATCH") {
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return Response.json(
          { message: "Could not save settings." },
          { status: 503 },
        );
      }
      return Response.json(
        String(url).includes("capacityStatus")
          ? { locked: false }
          : defaultAiSettings,
      );
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AiSettings navigation={{ navigate: vi.fn() } as never} />
    </QueryClientProvider>,
  );
  const toggle = screen.getByRole("switch", {
    name: "Use a separate model for each task",
  });
  await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
  await userEvent.setup().click(toggle);
  await waitFor(() => expect(finish).toBeDefined());
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(toggle.hasAttribute("disabled")).toBe(false);
  await act(async () => finish!());
  await waitFor(() =>
    expect(toggle.getAttribute("aria-checked")).toBe("false"),
  );
  expect(feedback.error).toHaveBeenCalledWith(
    expect.stringContaining("last saved settings were restored"),
  );
});
