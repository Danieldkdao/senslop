// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render as renderView,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { organizationSchema } from "@senslop/contracts";
import { defaultUiPreferences } from "../../settings/constants";
import { mergeUiPreferences } from "../../settings/lib/ui-preferences";
import { defaultAiSettings } from "../../agents/constants";
import { defaultDiffSettings } from "../constants";
import type { JobSchema } from "../../agents/schemas";
import type { LivePreview, ReviewLine, ReviewNote } from "../types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReviewWorkspace } from "../components/review-workspace";

let queryClient: QueryClient;
const render = (ui: ReactNode) =>
  renderView(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

vi.mock("../../agents/hooks/use-agent-state", () => ({
  useAgentState: () => ({
    state: { data: { jobs: state.jobs, conversations: [] } },
    act: state.act,
  }),
}));
vi.mock("../../agents/hooks/use-ai-settings", async () => {
  const { defaultAiSettings } = await import("../../agents/constants");
  return {
    useAiSettings: () => ({
      capacityStatus: { data: { locked: false } },
      settings: {
        data: {
          ...defaultAiSettings,
          shared: state.groupingConfigured ? { modelId: "test" } : null,
        },
      },
      save: vi.fn(async () => {}),
    }),
  };
});
vi.mock("../../agents/components/agent-panel", () => ({
  AgentPanel: ({ preparing }: { preparing?: boolean }) => (
    <aside aria-label="Agents">
      {preparing
        ? "Waiting for grouping"
        : "Open a snapshot to start a conversation."}
    </aside>
  ),
}));
const scrollToDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollTo",
);
const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);

vi.mock("../../providers/hooks/use-provider-models", () => ({
  useProviderModels: () => ({
    settings: { data: { connections: [], defaultId: null } },
    entries: [],
    refresh: vi.fn(),
  }),
}));

const state = vi.hoisted(() => ({
  groupingConfigured: true,
  autoAdvance: false,
  jobs: [] as JobSchema[],
  act: vi.fn(async () => ({})),
  discard: vi.fn(async () => {}),
  change: vi.fn(),
  mobile: false,
  preview: null as LivePreview | null,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  trackReviewOperation: vi.fn(),
}));
vi.mock("../../settings/hooks/use-review-preferences", () => ({
  useReviewPreferences: () => ({
    preferences: { data: { autoAdvance: state.autoAdvance } },
  }),
}));

test("editor settings survive reopening the workspace instead of resetting to defaults", async () => {
  state.mobile = true;
  let saved = {
    editor: defaultDiffSettings,
    view: "split",
    applicationTheme: null,
    panels: null,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method === "PATCH") {
        const patch = JSON.parse(options.body);
        saved = {
          ...saved,
          ...patch,
          editor: { ...saved.editor, ...patch.editor },
        };
      }
      return Response.json(saved);
    }),
  );
  const user = userEvent.setup();
  const mount = () => render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  mount();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const size = screen.getByRole("spinbutton", { name: "Font size" });
  await waitFor(() => expect((size as HTMLInputElement).disabled).toBe(false));
  fireEvent.change(size, { target: { value: "20" } });
  fireEvent.blur(size);
  await user.click(screen.getByRole("button", { name: "Unified" }));
  await waitFor(() => expect(saved.view).toBe("unified"));
  cleanup();
  queryClient = new QueryClient();
  mount();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("spinbutton", {
          name: "Font size",
        }) as HTMLInputElement
      ).value,
    ).toBe("20"),
  );
  expect(
    screen
      .getByRole("button", { name: "Unified" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});
vi.mock("../../workspace/components/workspace-toolbar", () => ({
  WorkspaceToolbar: ({ groupingAction }: { groupingAction?: ReactNode }) => (
    <div>{groupingAction}</div>
  ),
}));
vi.mock("../components/live-preview-provider", async () => {
  const React = await import("react");
  return {
    useLivePreview: () => {
      const [, renderAgain] = React.useReducer((n: number) => n + 1, 0);
      return {
        preview: state.preview,
        reviewOperation: null,
        trackReviewOperation: state.trackReviewOperation,
        error: null,
        refresh: async () => {},
        discardReview: async () => {
          await state.discard();
          state.preview = null;
          renderAgain();
        },
        changeReview: async (change: {
          action: string;
          note?: ReviewNote;
          id?: string;
          path?: string;
          complete?: boolean;
        }) => {
          const pending = state.change(change);
          if (pending) await pending;
          if (!state.preview) return;
          const notes = state.preview.notes ?? [];
          if (change.action === "add-note")
            state.preview = {
              groupingEnabled: false,
              ...state.preview,
              notes: [...notes, change.note!],
            };
          if (change.action === "delete-note")
            state.preview = {
              groupingEnabled: false,
              ...state.preview,
              notes: notes.filter((note) => note.id !== change.id),
            };
          if (change.action === "complete") {
            const completed = new Set(state.preview.completedPaths ?? []);
            if (change.complete) completed.add(change.path!);
            else completed.delete(change.path!);
            state.preview = {
              groupingEnabled: false,
              ...state.preview,
              completedPaths: [...completed],
            };
          }
          renderAgain();
        },
      };
    },
  };
});
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({
      file,
      notes,
      onAddComment,
    }: {
      file: { path: string };
      notes: ReviewNote[];
      onAddComment: (body: string, line: ReviewLine) => void;
    }) => (
      <div>
        Diff for {file.path}
        <button
          onClick={() =>
            onAddComment("Inline feedback", {
              side: "additions",
              lineNumber: 1,
              code: "one",
            })
          }
        >
          Mock line comment
        </button>
        {notes
          .filter((note) => note.line)
          .map((note) => (
            <p key={note.id}>{note.body}</p>
          ))}
      </div>
    ),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/components/ui/toast", () => ({
  toast: { error: state.toastError, success: state.toastSuccess },
}));

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let savedPreferences = defaultUiPreferences;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options?: RequestInit) => {
      if (options?.method === "PATCH")
        savedPreferences = mergeUiPreferences(
          savedPreferences,
          JSON.parse(String(options.body)),
        );
      return Response.json(savedPreferences);
    }),
  );
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(Element.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
  vi.resetAllMocks();
  localStorage.clear();
  localStorage.setItem("senslop:setup-dismissed", "true");
  state.autoAdvance = false;
  state.jobs = [];
  state.act.mockResolvedValue({});
  state.mobile = false;
  state.preview = null;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const setNavigationPreview = () => {
  state.preview = {
    groupingEnabled: false,
    id: "keyboard-review",
    source: {
      kind: "working-tree",
      base: "a".repeat(40),
      head: null,
      firstParent: false,
    },
    expectedFiles: 2,
    files: ["src/first.ts", "src/second.tsx"].map((path) => ({
      path,
      oldPath: null,
      status: "A",
      binary: false,
      before: null,
      after: "one",
      beforeHash: null,
      afterHash: "a".repeat(64),
      added: 1,
      deleted: 0,
      diff: "",
    })),
    excluded: [],
    status: "ready",
    error: null,
  };
};

test("left and right arrows navigate files without wrapping at the boundaries", () => {
  setNavigationPreview();
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  fireEvent.keyDown(document, { key: "ArrowLeft" });
  expect(screen.getByText("Diff for src/first.ts")).toBeTruthy();
  fireEvent.keyDown(document, { key: "ArrowRight" });
  expect(screen.getByText("Diff for src/second.tsx")).toBeTruthy();
  fireEvent.keyDown(document, { key: "ArrowRight" });
  expect(screen.getByText("Diff for src/second.tsx")).toBeTruthy();
  fireEvent.keyDown(document, { key: "ArrowLeft" });
  expect(screen.getByText("Diff for src/first.ts")).toBeTruthy();
});

test("arrow shortcuts leave text editing, modifiers and diff settings alone", async () => {
  setNavigationPreview();
  const user = userEvent.setup();
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  await user.click(screen.getByRole("button", { name: "Add note" }));
  fireEvent.keyDown(screen.getByLabelText("Note"), { key: "ArrowRight" });
  await user.keyboard("{Escape}");
  fireEvent.keyDown(document, { key: "ArrowRight", shiftKey: true });
  fireEvent.keyDown(document, { key: "ArrowRight", metaKey: true });
  fireEvent.keyDown(document, { key: "ArrowRight", isComposing: true });
  const host = document.createElement("div");
  const input = document.createElement("textarea");
  host.attachShadow({ mode: "open" }).append(input);
  document.body.append(host);
  fireEvent.keyDown(input, { key: "ArrowRight", composed: true });
  host.remove();
  expect(screen.getByText("Diff for src/first.ts")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.keyDown(document, { key: "ArrowRight" });
  expect(screen.getByText("Diff for src/first.ts")).toBeTruthy();
});

test("K searches files and Enter selects a result without global arrow navigation", async () => {
  setNavigationPreview();
  const user = userEvent.setup();
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  fireEvent.keyDown(document, { key: "k" });
  const dialog = await screen.findByRole("dialog", { name: "Find a file" });
  const input = within(dialog).getByRole("combobox", { name: "Search files" });
  await user.type(input, "second");
  expect(
    within(dialog).queryByRole("option", { name: "src/first.ts" }),
  ).toBeNull();
  expect(
    within(dialog).getByRole("option", { name: "src/second.tsx" }),
  ).toBeTruthy();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByText("Diff for src/first.ts")).toBeTruthy();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("Diff for src/second.tsx")).toBeTruthy();
});

test("K supports empty searches, streamed files and Escape", async () => {
  setNavigationPreview();
  const user = userEvent.setup();
  const view = render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  fireEvent.keyDown(document, { key: "k" });
  const dialog = await screen.findByRole("dialog", { name: "Find a file" });
  const input = within(dialog).getByRole("combobox", { name: "Search files" });
  await user.type(input, "missing");
  expect(within(dialog).getByText("No files found.")).toBeTruthy();
  await user.clear(input);
  state.preview = {
    groupingEnabled: false,
    ...state.preview!,
    files: [
      ...state.preview!.files,
      { ...state.preview!.files[0]!, path: "theme.css" },
    ],
  };
  view.rerender(<ReviewWorkspace>Setup</ReviewWorkspace>);
  expect(
    within(dialog).getByRole("option", { name: "theme.css" }),
  ).toBeTruthy();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("Diff for src/first.ts")).toBeTruthy();
});

test("workspace shortcuts stop handling keys after unmount", () => {
  setNavigationPreview();
  const view = render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  view.unmount();
  const event = new KeyboardEvent("keydown", {
    key: "ArrowRight",
    cancelable: true,
    bubbles: true,
  });
  document.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (scrollIntoViewDescriptor)
    Object.defineProperty(
      Element.prototype,
      "scrollIntoView",
      scrollIntoViewDescriptor,
    );
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  if (scrollToDescriptor)
    Object.defineProperty(Element.prototype, "scrollTo", scrollToDescriptor);
  else Reflect.deleteProperty(Element.prototype, "scrollTo");
});

test("dashboard layout surrounds its content with honest empty review panels", () => {
  render(
    <ReviewWorkspace>
      <p>Connection steps go here</p>
    </ReviewWorkspace>,
  );
  expect(
    within(screen.getByRole("main", { name: "Review canvas" })).getByText(
      "Connection steps go here",
    ),
  ).toBeTruthy();
  expect(
    within(
      screen.getByRole("complementary", { name: "Review files" }),
    ).getByText("No files here yet"),
  ).toBeTruthy();
  expect(
    within(screen.getByRole("complementary", { name: "Agents" })).getByText(
      "Open a snapshot to start a conversation.",
    ),
  ).toBeTruthy();
  expect(screen.getByText("No file selected")).toBeTruthy();
  expect(
    screen.queryByRole("navigation", { name: "Main navigation" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Get started" })).toBeNull();
  expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
});

test("desktop exposes two accessible sidebar resize handles", () => {
  render(<ReviewWorkspace>Setup steps</ReviewWorkspace>);
  expect(screen.getAllByRole("separator")).toHaveLength(3);
  screen
    .getAllByRole("separator")
    .forEach((handle) => expect(handle.querySelector("div")).toBeTruthy());
  expect(
    screen
      .getAllByRole("separator")
      .map((handle) => handle.getAttribute("aria-orientation"))
      .sort(),
  ).toEqual(["horizontal", "vertical", "vertical"]);
});

test("mobile hides sidebars and handles until a drawer is requested", async () => {
  state.mobile = true;
  const user = userEvent.setup();
  render(<ReviewWorkspace>Setup steps</ReviewWorkspace>);
  expect(
    screen.queryByRole("complementary", { name: "Review files" }),
  ).toBeNull();
  expect(
    screen.queryByRole("complementary", { name: "Review notes" }),
  ).toBeNull();
  expect(screen.queryByRole("separator")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Open files" }));
  const files = await screen.findByRole("dialog", { name: "Files" });
  expect(within(files).getByText("No files here yet")).toBeTruthy();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Open files" }),
  );
  await user.click(screen.getByRole("button", { name: "Open agents" }));
  const notes = await screen.findByRole("dialog", {
    name: "Agents",
  });
  expect(
    within(notes).getByText("Open a snapshot to start a conversation."),
  ).toBeTruthy();
  expect(within(notes).queryByRole("button", { name: "Settings" })).toBeNull();
  await user.click(within(notes).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Open agents" }),
  );
});

test("changing to desktop unmounts an open mobile drawer", async () => {
  state.mobile = true;
  const user = userEvent.setup();
  const view = render(<ReviewWorkspace>Setup steps</ReviewWorkspace>);
  await user.click(screen.getByRole("button", { name: "Open agents" }));
  await screen.findByRole("dialog", { name: "Agents" });
  state.mobile = false;
  view.rerender(<ReviewWorkspace>Setup steps</ReviewWorkspace>);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getAllByRole("separator")).toHaveLength(3);
  screen
    .getAllByRole("separator")
    .forEach((handle) => expect(handle.querySelector("div")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Open agents" })).toBeNull();
});

test("streamed files populate the sidebar, preserve selection and switch diff views", async () => {
  const user = userEvent.setup();
  const file = {
    path: "first.ts",
    oldPath: null,
    status: "A",
    binary: false,
    before: null,
    after: "one",
    beforeHash: null,
    afterHash: "a".repeat(64),
    added: 1,
    deleted: 0,
    diff: "patch",
  };
  state.preview = {
    groupingEnabled: false,
    id: "preview",
    source: {
      kind: "working-tree",
      base: "a".repeat(40),
      head: null,
      firstParent: false,
    },
    expectedFiles: 2,
    files: [file],
    excluded: [],
    status: "receiving",
    error: null,
  };
  const view = render(<ReviewWorkspace>Setup steps</ReviewWorkspace>);
  expect(screen.getByText("Diff for first.ts")).toBeTruthy();
  expect(
    view.container.querySelector("header img")?.getAttribute("src"),
  ).toContain("/typescript.svg");
  expect(
    screen
      .getByRole("button", { name: /first.ts/ })
      .querySelector("img")
      ?.getAttribute("src"),
  ).toContain("/typescript.svg");
  const sidebar = screen.getByRole("complementary", { name: "Review files" });
  expect(within(sidebar).queryByRole("textbox")).toBeNull();
  expect(within(sidebar).queryByText("Receiving 1 of 2 files")).toBeNull();
  expect(within(sidebar).queryByText("Uncommitted changes")).toBeNull();
  state.preview = {
    groupingEnabled: false,
    ...state.preview,
    files: [file, { ...file, path: "second.tsx" }],
    status: "ready",
  };
  view.rerender(<ReviewWorkspace>Setup steps</ReviewWorkspace>);
  const secondFile = screen.getByRole("button", { name: /second.tsx/ });
  expect(secondFile.querySelector("img")?.getAttribute("src")).toContain(
    "/react_ts.svg",
  );
  await user.click(secondFile);
  expect(screen.getByText("Diff for second.tsx")).toBeTruthy();
  expect(
    view.container.querySelector("header img")?.getAttribute("src"),
  ).toContain("/react_ts.svg");
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("button", { name: "Unified" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(
    screen
      .getByRole("button", { name: "Unified" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  await user.keyboard("{Escape}");
  expect(screen.getByText("Diff for second.tsx")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Previous file" }));
  expect(screen.getByText("Diff for first.ts")).toBeTruthy();
});

test("the local workspace has appearance controls without account authentication", () => {
  render(<ReviewWorkspace>Local workspace</ReviewWorkspace>);
  expect(screen.getByText("Local workspace")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Open account menu" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
});

test("sidebar notes are searchable, editable, independently scrollable and scoped to the snapshot", async () => {
  setNavigationPreview();
  const user = userEvent.setup();
  const view = render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  await user.click(screen.getByRole("button", { name: "Mock line comment" }));
  const notes = screen.getByRole("complementary", { name: "Review notes" });
  expect(within(notes).getByText("Inline feedback")).toBeTruthy();
  expect(within(notes).getByText("New line 1")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Browse notes" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Add note" }));
  await user.type(screen.getByLabelText("Note"), "Standalone feedback");
  await user.keyboard("{Enter}");
  await waitFor(() => expect(screen.queryByLabelText("Note")).toBeNull());
  fireEvent.change(
    within(notes).getByRole("textbox", { name: "Search notes" }),
    { target: { value: "Standalone" } },
  );
  expect(
    (
      within(notes).getByRole("textbox", {
        name: "Search notes",
      }) as HTMLInputElement
    ).value,
  ).toBe("Standalone");
  expect(within(notes).queryByText("Inline feedback")).toBeNull();
  expect(within(notes).getByText("Standalone feedback")).toBeTruthy();
  fireEvent.change(
    within(notes).getByRole("textbox", { name: "Search notes" }),
    { target: { value: "" } },
  );
  await user.click(
    within(notes).getAllByRole("button", { name: "Delete note" })[0]!,
  );
  expect(within(notes).queryByText("Inline feedback")).toBeNull();
  state.preview = { ...state.preview!, id: "review-two", notes: [] };
  view.rerender(<ReviewWorkspace>Setup</ReviewWorkspace>);
  expect(screen.queryByText("Standalone feedback")).toBeNull();
});

test("d toggles persisted completion with header/sidebar indicators, without interfering with typing or dialogs", async () => {
  setNavigationPreview();
  const user = userEvent.setup();
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  const canvas = screen.getByRole("main", { name: "Review canvas" });
  const controls = screen.getByLabelText("Workspace controls");
  expect(controls.classList.contains("max-w-[45%]")).toBe(true);
  expect(controls.classList.contains("overflow-x-auto")).toBe(true);
  fireEvent.keyDown(document, { key: "d" });
  expect(state.preview?.completedPaths).toEqual(["src/first.ts"]);
  expect(
    within(canvas)
      .getByRole("button", { name: "Mark incomplete" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(canvas.classList.contains("ring-primary/40")).toBe(false);
  expect(canvas.classList.contains("bg-success/10")).toBe(true);
  expect(
    canvas.querySelector("header")?.classList.contains("bg-success/10"),
  ).toBe(true);
  expect(
    screen
      .getByRole("button", { name: /src\/first.ts: Completed/ })
      .classList.contains("bg-success/10"),
  ).toBe(true);
  fireEvent.keyDown(document, { key: "d", repeat: true });
  fireEvent.keyDown(document, { key: "d", ctrlKey: true });
  fireEvent.keyDown(document, { key: "d", isComposing: true });
  await user.click(screen.getByRole("button", { name: "Add note" }));
  fireEvent.keyDown(screen.getByLabelText("Note"), { key: "d" });
  await user.keyboard("{Escape}");
  expect(state.preview?.completedPaths).toEqual(["src/first.ts"]);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.keyDown(document, { key: "d" });
  expect(state.preview?.completedPaths).toEqual(["src/first.ts"]);
  await user.keyboard("{Escape}");
  fireEvent.keyDown(document, { key: "d" });
  expect(state.preview?.completedPaths).toEqual([]);
  expect(
    within(canvas)
      .getByRole("button", { name: "Mark complete" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  expect(canvas.classList.contains("ring-primary/40")).toBe(false);
  expect(canvas.classList.contains("bg-success/10")).toBe(false);
});

test("completed region tints the whole canvas while other file regions remain incomplete", async () => {
  setNavigationPreview();
  state.preview = {
    ...state.preview!,
    id: crypto.randomUUID(),
    hash: "a".repeat(64),
    round: 1,
  };
  const organization = organizationSchema.parse({
    version: 1,
    manual: false,
    units: [true, false].map((reviewed, index) => ({
      id: `region-${index}`,
      path: state.preview!.files[0]!.path,
      fingerprint: `region-${index}`,
      label: `Region ${index + 1}`,
      kind: "text",
      reviewed,
      ranges: [
        { side: "after", start: index + 1, end: index + 1, code: "one" },
      ],
    })),
    flows: [
      { id: "flow", title: "Changes", unitIds: ["region-0", "region-1"] },
    ],
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.startsWith("/api/precision?") ? organization : defaultUiPreferences,
      ),
    ),
  );
  const user = userEvent.setup();
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  await screen.findByRole("button", { name: "Next region" });
  const canvas = screen.getByRole("main", { name: "Review canvas" });
  expect(
    within(canvas).getByRole("button", { name: "Mark incomplete" }),
  ).toBeTruthy();
  expect(canvas.classList.contains("bg-success/10")).toBe(true);
  await user.click(screen.getByRole("button", { name: "Next region" }));
  expect(
    within(canvas).getByRole("button", { name: "Mark complete" }),
  ).toBeTruthy();
  expect(canvas.classList.contains("bg-success/10")).toBe(false);
});

test("grouped reviews hide all files and the diff until the latest job publishes, including regrouping", async () => {
  setNavigationPreview();
  state.preview!.groupingEnabled = true;
  const completed = {
    id: "complete",
    snapshotId: state.preview!.id,
    kind: "grouping",
    status: "completed",
    result: {
      groups: [
        {
          title: "Flow",
          rationale: "Prerequisites",
          files: state.preview!.files.map((file) => ({
            path: file.path,
            summary: "Changed behavior",
            related: [],
          })),
        },
      ],
    },
  } as unknown as JobSchema;
  state.jobs = [
    {
      ...completed,
      id: "running",
      status: "running",
      progress: "Organizing changes",
      result: null,
    },
    completed,
  ];
  const { rerender } = render(
    <ReviewWorkspace>
      <p>Empty</p>
    </ReviewWorkspace>,
  );
  expect(screen.getByText("Preparing your review")).toBeTruthy();
  expect(screen.getByRole("main", { name: "Review canvas" })).toBeTruthy();
  expect(
    screen.getByRole("complementary", { name: "Review files" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("complementary", { name: "Agents" }).textContent,
  ).toContain("Waiting for grouping");
  expect(screen.getAllByRole("separator")).toHaveLength(3);
  expect(screen.queryByLabelText("Changed files")).toBeNull();
  expect(screen.queryByText(/Diff for/)).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Find a file" })
      .hasAttribute("disabled"),
  ).toBe(true);
  state.jobs = [completed];
  rerender(
    <ReviewWorkspace>
      <p>Empty</p>
    </ReviewWorkspace>,
  );
  expect(screen.getByText(/Diff for src\/first.ts/)).toBeTruthy();
});

test("grouping failure keeps files hidden and offers retry and settings", async () => {
  setNavigationPreview();
  state.preview!.groupingEnabled = true;
  state.jobs = [
    {
      id: "failed",
      kind: "grouping",
      status: "failed",
      error: "Model returned invalid groups",
    } as JobSchema,
  ];
  render(
    <ReviewWorkspace>
      <p>Empty</p>
    </ReviewWorkspace>,
  );
  expect(screen.getByRole("alert").textContent).toContain(
    "Model returned invalid groups",
  );
  expect(screen.queryByText(/Diff for/)).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Retry grouping" }));
  expect(state.act).toHaveBeenCalledWith({ action: "retry", id: "failed" });
  expect(screen.getByRole("button", { name: "Configure AI" })).toBeTruthy();
});

test("a saved grouped review remains usable after its grouping model is removed", () => {
  setNavigationPreview();
  state.preview!.groupingEnabled = true;
  state.groupingConfigured = false;
  render(
    <ReviewWorkspace>
      <p>Empty</p>
    </ReviewWorkspace>,
  );
  expect(screen.queryByText("Preparing your review")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Group changes" })
      .hasAttribute("disabled"),
  ).toBe(true);
  state.groupingConfigured = true;
});

test("file search follows review groups and searches by group title", async () => {
  setNavigationPreview();
  state.preview!.groupingEnabled = true;
  state.jobs = [
    {
      id: "grouped",
      kind: "grouping",
      status: "completed",
      result: {
        groups: state.preview!.files.map((file, index) => ({
          title: index ? "Interface" : "Foundation",
          rationale: "Dependencies first",
          files: [
            { path: file.path, summary: "Changed behavior", related: [] },
          ],
        })),
      },
    } as unknown as JobSchema,
  ];
  const user = userEvent.setup();
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  const sidebar = screen.getByRole("complementary", { name: "Review files" });
  expect(
    within(sidebar).queryByRole("button", { name: "Regroup changes" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Regroup changes" }));
  expect(state.act).toHaveBeenCalledWith({
    action: "job",
    kind: "grouping",
    snapshotId: state.preview!.id,
  });
  fireEvent.keyDown(document, { key: "k" });
  const dialog = await screen.findByRole("dialog", { name: "Find a file" });
  const groups = dialog.querySelectorAll("[cmdk-group]");
  expect(groups).toHaveLength(2);
  expect(groups[0]!.textContent).toContain("Foundation");
  expect(groups[0]!.textContent).toContain("src/first.ts");
  expect(groups[1]!.textContent).toContain("Interface");
  await user.type(within(dialog).getByRole("combobox"), "interface");
  expect(
    within(dialog).queryByRole("option", { name: "src/first.ts" }),
  ).toBeNull();
  await user.click(
    within(dialog).getByRole("option", { name: "src/second.tsx" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("Diff for src/second.tsx")).toBeTruthy();
});

test("discarding a failed grouping review requires confirmation and returns to the empty workspace", async () => {
  setNavigationPreview();
  state.preview!.groupingEnabled = true;
  state.jobs = [
    {
      id: "failed",
      kind: "grouping",
      status: "failed",
      error: "Invalid groups",
    } as JobSchema,
  ];
  const user = userEvent.setup();
  render(
    <ReviewWorkspace>
      <p>Start another review</p>
    </ReviewWorkspace>,
  );
  await user.click(screen.getByRole("button", { name: "Discard review" }));
  expect(state.discard).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Invalid groups")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Discard review" }));
  await user.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(screen.getByText("Start another review")).toBeTruthy(),
  );
  expect(state.discard).toHaveBeenCalledOnce();
});

test("ready feedback waits for observed grouping and does not replay on reload", () => {
  setNavigationPreview();
  state.preview!.groupingEnabled = true;
  const job = {
    id: "first-run",
    kind: "grouping",
    status: "running",
    result: null,
  } as JobSchema;
  state.jobs = [job];
  const workspace = <ReviewWorkspace>Setup</ReviewWorkspace>;
  let mounted = render(workspace);
  expect(state.toastSuccess).not.toHaveBeenCalled();
  job.status = "failed";
  mounted.rerender(workspace);
  cleanup();
  mounted = render(workspace);
  expect(state.toastSuccess).not.toHaveBeenCalled();
  job.status = "completed";
  job.result = {
    groups: [
      {
        title: "Flow",
        rationale: "Together",
        files: state.preview!.files.map((file) => ({
          path: file.path,
          summary: "Changed",
          related: [],
        })),
      },
    ],
  };
  mounted.rerender(<ReviewWorkspace>Ready</ReviewWorkspace>);
  expect(screen.getByText("Diff for src/first.ts")).toBeTruthy();
  expect(state.toastSuccess).not.toHaveBeenCalled();
  cleanup();
  mounted = render(workspace);
  expect(state.toastSuccess).not.toHaveBeenCalled();
  state.jobs = [
    { ...job, id: "second-run", status: "running", result: null },
    job,
  ];
  mounted.rerender(<ReviewWorkspace>Regroup</ReviewWorkspace>);
  expect(state.toastSuccess).not.toHaveBeenCalled();
  state.jobs[0] = { ...job, id: "second-run" };
  mounted.rerender(workspace);
  expect(state.toastSuccess).toHaveBeenCalledTimes(1);
});

test("opening ungrouped reviews and refreshing stays quiet", () => {
  setNavigationPreview();
  const workspace = <ReviewWorkspace>Setup</ReviewWorkspace>;
  render(workspace);
  expect(state.toastSuccess).not.toHaveBeenCalled();
  cleanup();
  const mounted = render(workspace);
  expect(state.toastSuccess).not.toHaveBeenCalled();
  state.preview = { ...state.preview!, id: "new-review" };
  mounted.rerender(<ReviewWorkspace>New review</ReviewWorkspace>);
  expect(state.toastSuccess).not.toHaveBeenCalled();
});

test("preparation can be stopped before its job appears in polling", async () => {
  setNavigationPreview();
  state.preview!.groupingEnabled = true;
  state.jobs = [];
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Stop review" }));
  expect(state.act).toHaveBeenCalledWith({
    action: "cancel-grouping",
    snapshotId: state.preview!.id,
    expectedHash: state.preview!.hash,
    expectedRound: state.preview!.round,
  });
  expect(state.discard).not.toHaveBeenCalled();
});

test.each(["queued", "running"] as const)(
  "stop review cancels the active %s grouping job and retains the snapshot",
  async (status) => {
    setNavigationPreview();
    state.preview!.groupingEnabled = true;
    state.jobs = [
      { id: "active-grouping", kind: "grouping", status } as JobSchema,
    ];
    let finish!: (value: object) => void;
    state.act.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const mounted = render(<ReviewWorkspace>Setup</ReviewWorkspace>);
    const user = userEvent.setup();
    const stop = screen.getByRole("button", { name: "Stop review" });
    await user.click(stop);
    expect(state.act).toHaveBeenCalledWith({
      action: "cancel",
      id: "active-grouping",
    });
    const pending = screen.getByRole("button", { name: "Stop review" });
    expect(pending.hasAttribute("disabled")).toBe(true);
    expect(pending.getAttribute("aria-busy")).toBe("true");
    await user.click(pending);
    expect(state.act).toHaveBeenCalledTimes(1);
    finish({});
    state.jobs[0] = { ...state.jobs[0]!, status: "canceled" };
    mounted.rerender(<ReviewWorkspace>Stopped</ReviewWorkspace>);
    await waitFor(() =>
      expect(screen.getByText("Review stopped")).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: "Stop review" })).toBeNull();
    expect(state.discard).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry grouping" })).toBeTruthy();
  },
);

test("only header actions have tooltips and mobile drawers still open", async () => {
  setNavigationPreview();
  state.mobile = true;
  render(
    <TooltipProvider delay={0}>
      <ReviewWorkspace>Setup</ReviewWorkspace>
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  for (const [label, hint] of [
    ["Previous file", "Previous file (←)"],
    ["Next file", "Next file (→)"],
    ["Find a file", "Find a file (K)"],
    ["Add note", "Add note (N)"],
  ]) {
    const button = screen.getByRole("button", { name: label });
    const trigger = button.hasAttribute("disabled")
      ? button.parentElement!
      : button;
    await user.hover(trigger);
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="tooltip-content"]')?.textContent,
        label,
      ).toBe(hint),
    );
    await user.unhover(trigger);
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="tooltip-content"]'),
      ).toBeNull(),
    );
  }
  for (const label of ["Open files", "Open agents"]) {
    const button = screen.getByRole("button", { name: label });
    expect(button.hasAttribute("data-base-ui-tooltip-trigger")).toBe(false);
  }
  await user.click(screen.getByRole("button", { name: "Open files" }));
  expect(await screen.findByRole("dialog")).toBeTruthy();
});

test.each([
  { hash: "old-hash", snapshotRound: 2 },
  { hash: "new-hash", snapshotRound: 1 },
])(
  "merge re-sync ignores grouping results for previous content or sync rounds: %j",
  (identity) => {
    setNavigationPreview();
    state.preview = {
      ...state.preview!,
      groupingEnabled: true,
      hash: "new-hash",
      round: 2,
    };
    state.jobs = [
      {
        id: "old-grouping",
        analysisMode: "thorough",
        priority: "normal",
        retryOf: null,
        dispatchKey: null,
        dispatchGeneration: 0,
        retryAt: null,
        fallbackAt: null,
        snapshotId: state.preview.id,
        generation: 1,
        settings: defaultAiSettings,
        progress: "Complete",
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        runId: null,
        dispatched: true,
        ...identity,
        kind: "grouping",
        status: "completed",
        result: {
          groups: [
            {
              title: "Old flow",
              rationale: "Earlier content",
              files: state.preview.files.map((file) => ({
                path: file.path,
                summary: "Old summary",
                related: [],
              })),
            },
          ],
        },
      } as JobSchema,
    ];
    render(<ReviewWorkspace>Setup</ReviewWorkspace>);
    expect(screen.getByText("Preparing your review")).toBeTruthy();
    expect(screen.queryByText("Old summary")).toBeNull();
    expect(state.toastSuccess).not.toHaveBeenCalled();
  },
);

test("retained notes for removed files stay readable without trying to select a missing file", async () => {
  setNavigationPreview();
  state.preview!.notes = [
    {
      id: "retained",
      previewId: state.preview!.id,
      path: "removed.ts",
      body: "Keep this context",
      line: null,
    },
  ];
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: /removed.ts/ }));
  expect(screen.getByText("Keep this context")).toBeTruthy();
  expect(state.change).not.toHaveBeenCalled();
});

test("auto advance is opt-in, follows review order and stops at the final file", async () => {
  setNavigationPreview();
  state.autoAdvance = true;
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  fireEvent.keyDown(document, { key: "d" });
  await waitFor(() =>
    expect(state.change).toHaveBeenCalledWith({
      action: "select",
      path: "src/second.tsx",
    }),
  );
  expect(state.preview!.completedPaths).toContain("src/first.ts");
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Next file" })
        .hasAttribute("disabled"),
    ).toBe(true),
  );
  state.change.mockClear();
  fireEvent.keyDown(document, { key: "d" });
  await waitFor(() =>
    expect(state.preview!.completedPaths).toContain("src/second.tsx"),
  );
  expect(state.change).not.toHaveBeenCalledWith(
    expect.objectContaining({ action: "select" }),
  );
});

test("auto advance does not override manual navigation while completion is saving", async () => {
  setNavigationPreview();
  state.autoAdvance = true;
  let finish!: () => void;
  state.change.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  fireEvent.keyDown(document, { key: "d" });
  fireEvent.keyDown(document, { key: "ArrowRight" });
  await waitFor(() =>
    expect(screen.getByText("Diff for src/second.tsx")).toBeTruthy(),
  );
  finish();
  await waitFor(() =>
    expect(state.preview!.completedPaths).toContain("src/first.ts"),
  );
  expect(
    state.change.mock.calls.filter(([change]) => change.action === "select"),
  ).toHaveLength(1);
});

test("failed completion does not advance and a later completion still works", async () => {
  setNavigationPreview();
  state.autoAdvance = true;
  state.change.mockRejectedValueOnce(new Error("Save failed"));
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  fireEvent.keyDown(document, { key: "d" });
  await act(async () => {});
  expect(
    state.change.mock.calls.some(([change]) => change.action === "select"),
  ).toBe(false);
  expect(state.preview!.completedPaths ?? []).not.toContain("src/first.ts");
  fireEvent.keyDown(document, { key: "d" });
  await waitFor(() =>
    expect(screen.getByText("Diff for src/second.tsx")).toBeTruthy(),
  );
});

test("rapid D and next-file navigation queues completion for each file instead of dropping later shortcuts", async () => {
  setNavigationPreview();
  const releases: (() => void)[] = [];
  state.change.mockImplementation((change) =>
    change.action === "complete"
      ? new Promise<void>((resolve) => releases.push(resolve))
      : undefined,
  );
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  fireEvent.keyDown(document, { key: "d" });
  fireEvent.keyDown(document, { key: "ArrowRight" });
  fireEvent.keyDown(document, { key: "d" });
  expect(
    state.change.mock.calls
      .filter(([change]) => change.action === "complete")
      .map(([change]) => change.path),
  ).toEqual(["src/first.ts", "src/second.tsx"]);
  await act(async () => {
    releases.forEach((resolve) => resolve());
  });
  expect(state.preview!.completedPaths).toEqual([
    "src/first.ts",
    "src/second.tsx",
  ]);
});

test("automatic retries count down against the worker deadline and wait for actual restart", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
  try {
    setNavigationPreview();
    state.preview!.groupingEnabled = true;
    state.jobs = [
      {
        id: "retry",
        kind: "grouping",
        status: "running",
        error: "Provider temporarily unavailable",
        updatedAt: new Date().toISOString(),
        retryAt: new Date(Date.now() + 30000).toISOString(),
      } as JobSchema,
    ];
    const mounted = render(<ReviewWorkspace>Setup</ReviewWorkspace>);
    expect(screen.getByRole("alert").textContent).toContain(
      "Provider temporarily unavailable",
    );
    expect(screen.getByRole("timer").textContent).toBe(
      "Retrying grouping in 30 seconds.",
    );
    expect(screen.queryByRole("button", { name: "Retry grouping" })).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(screen.getByRole("timer").textContent).toBe(
      "Retrying grouping in 25 seconds.",
    );
    mounted.rerender(<ReviewWorkspace>Polling update</ReviewWorkspace>);
    expect(screen.getByRole("timer").textContent).toBe(
      "Retrying grouping in 25 seconds.",
    );
    await act(() => vi.advanceTimersByTimeAsync(25000));
    expect(screen.getByRole("timer").textContent).toBe(
      "Waiting for the local worker to retry grouping…",
    );
    expect(screen.queryByText(/Diff for/)).toBeNull();
    state.jobs[0] = { ...state.jobs[0]!, retryAt: null, error: null };
    mounted.rerender(<ReviewWorkspace>Retry started</ReviewWorkspace>);
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByText("Preparing your review")).toBeTruthy();
    mounted.unmount();
  } finally {
    vi.useRealTimers();
  }
});

test("terminal failure explains the fallback then opens every original file without AI ordering", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
  try {
    setNavigationPreview();
    state.preview!.groupingEnabled = true;
    state.jobs = [
      {
        id: "final-failure",
        kind: "grouping",
        status: "failed",
        error: "Model returned invalid groups",
        updatedAt: new Date().toISOString(),
        fallbackAt: new Date(Date.now() + 15000).toISOString(),
      } as JobSchema,
    ];
    const mounted = render(<ReviewWorkspace>Setup</ReviewWorkspace>);
    expect(screen.getByRole("alert").textContent).toContain(
      "Model returned invalid groups",
    );
    expect(
      screen.getByText(
        /couldn’t group this review.*without AI grouping or ordering/i,
      ),
    ).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toBe(
      "Opening the file review in 15 seconds.",
    );
    await act(() => vi.advanceTimersByTimeAsync(14000));
    expect(screen.queryByText(/Diff for/)).toBeNull();
    expect(screen.getByRole("timer").textContent).toBe(
      "Opening the file review in 1 second.",
    );
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByText("Diff for src/first.ts")).toBeTruthy();
    expect(screen.getByLabelText("Changed files").textContent).toContain(
      "first.ts",
    );
    expect(screen.getByLabelText("Changed files").textContent).toContain(
      "second.tsx",
    );
    expect(state.preview!.files.map((file) => file.path)).toEqual([
      "src/first.ts",
      "src/second.tsx",
    ]);
    expect(state.act).not.toHaveBeenCalled();
    mounted.unmount();
    render(<ReviewWorkspace>Reopened</ReviewWorkspace>);
    expect(screen.getByText("Diff for src/first.ts")).toBeTruthy();
    cleanup();
  } finally {
    vi.useRealTimers();
  }
});

test("a fresh manual grouping attempt supersedes an old fallback deadline", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
  try {
    setNavigationPreview();
    state.preview!.groupingEnabled = true;
    const failed = {
      id: "old",
      kind: "grouping",
      status: "failed",
      error: "Old error",
      updatedAt: new Date().toISOString(),
      fallbackAt: new Date(Date.now() + 15000).toISOString(),
    } as JobSchema;
    state.jobs = [failed];
    const mounted = render(<ReviewWorkspace>Setup</ReviewWorkspace>);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    state.jobs = [
      { ...failed, id: "new", status: "queued", error: null, fallbackAt: null },
      failed,
    ];
    mounted.rerender(<ReviewWorkspace>New attempt</ReviewWorkspace>);
    await act(() => vi.advanceTimersByTimeAsync(15000));
    expect(screen.queryByText(/Diff for/)).toBeNull();
    expect(screen.getByText("Preparing your review")).toBeTruthy();
    expect(screen.queryByRole("timer")).toBeNull();
    mounted.unmount();
  } finally {
    vi.useRealTimers();
  }
});

test.each([false, true])(
  "region impact includes removed-side consumers with replacement %s",
  async (replacement) => {
    setNavigationPreview();
    state.preview = {
      ...state.preview!,
      id: crypto.randomUUID(),
      hash: "a".repeat(64),
      round: 1,
    };
    const path = state.preview.files[0]!.path;
    const organization = organizationSchema.parse({
      version: 1,
      manual: false,
      units: [
        {
          id: "removed",
          path,
          fingerprint: "removed",
          label: "Removed declaration",
          kind: "text",
          ranges: [
            { side: "before", start: 1, end: 1, code: "one" },
            ...(replacement
              ? [{ side: "after", start: 1, end: 1, code: "two" }]
              : []),
          ],
        },
      ],
      flows: [{ id: "flow", title: "Declaration", unitIds: ["removed"] }],
    });
    const request = vi.fn(async (url: string) => {
      if (url.startsWith("/api/precision?")) return Response.json(organization);
      if (url.startsWith("/api/source-explorer?")) {
        const params = new URL(url, "http://localhost").searchParams;
        if (params.has("path"))
          return Response.json({
            path: params.get("path"),
            side: params.get("side"),
            contents: "one",
            capability: {
              language: "typescript",
              level: "text",
              tool: null,
              limitations: [],
            },
          });
        return Response.json({
          files: [path],
          symbols: [],
          capabilities: {},
          languageSettings: {},
          limitations: [],
          impact: [
            {
              unitId: "removed",
              path,
              reasons: [],
              limitations: [],
              relationships:
                params.get("side") === "before"
                  ? [
                      {
                        side: "before",
                        path: "consumer.ts",
                        start: 1,
                        end: 1,
                        name: "removed",
                        kind: "reference",
                        provenance: "compiler-resolved",
                        explanation: "Uses the removed declaration",
                      },
                    ]
                  : [],
            },
          ],
        });
      }
      return Response.json(defaultUiPreferences);
    });
    vi.stubGlobal("fetch", request);
    render(<ReviewWorkspace>Setup</ReviewWorkspace>);
    await waitFor(() =>
      expect(
        request.mock.calls.some(([url]) => url.includes("side=before")),
      ).toBe(true),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^Impact/ }));
    await user.click(await screen.findByRole("button", { name: /References/ }));
    await user.click(screen.getByRole("button", { name: /consumer.ts/ }));
    await waitFor(() =>
      expect(
        request.mock.calls.some(
          ([url]) =>
            url.includes("side=before") && url.includes("path=consumer.ts"),
        ),
      ).toBe(true),
    );
  },
);

test("unavailable precision organization explains the full-file fallback", async () => {
  setNavigationPreview();
  state.preview = {
    ...state.preview!,
    id: crypto.randomUUID(),
    hash: "a".repeat(64),
    round: 1,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.startsWith("/api/precision?")
        ? Response.json(
            {
              message:
                "Review organization exceeds supported limits; use full-file review.",
            },
            { status: 400 },
          )
        : Response.json(defaultUiPreferences),
    ),
  );
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  expect(
    await screen.findByText(/organization exceeds supported limits/),
  ).toBeTruthy();
  expect(screen.getByText("Diff for src/first.ts")).toBeTruthy();
});
