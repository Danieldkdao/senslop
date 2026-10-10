// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LivePreview, ReviewLine, ReviewNote } from "../types";
import { ReviewWorkspace } from "../components/review-workspace";

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);

const state = vi.hoisted(() => ({
  mobile: false,
  preview: null as LivePreview | null,
  toastError: vi.fn(),
}));
vi.mock("../../workspace/components/workspace-toolbar", () => ({
  WorkspaceToolbar: () => null,
}));
vi.mock("../components/live-preview-provider", async () => {
  const React = await import("react");
  return {
    useLivePreview: () => {
      const [, renderAgain] = React.useReducer((n: number) => n + 1, 0);
      return {
        preview: state.preview,
        error: null,
        refresh: async () => {},
        changeReview: async (change: {
          action: string;
          note?: ReviewNote;
          id?: string;
          path?: string;
          complete?: boolean;
        }) => {
          if (!state.preview) return;
          const notes = state.preview.notes ?? [];
          if (change.action === "add-note")
            state.preview = {
              ...state.preview,
              notes: [...notes, change.note!],
            };
          if (change.action === "delete-note")
            state.preview = {
              ...state.preview,
              notes: notes.filter((note) => note.id !== change.id),
            };
          if (change.action === "complete") {
            const completed = new Set(state.preview.completedPaths ?? []);
            if (change.complete) completed.add(change.path!);
            else completed.delete(change.path!);
            state.preview = {
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
  toast: { error: state.toastError },
}));

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  vi.resetAllMocks();
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
  fireEvent.keyDown(screen.getByLabelText("Note"), { key: "ArrowRight" });
  fireEvent.keyDown(screen.getByLabelText("Search changed files"), {
    key: "ArrowRight",
  });
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

test("command K searches files and Enter selects a result without global arrow navigation", async () => {
  setNavigationPreview();
  const user = userEvent.setup();
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  fireEvent.keyDown(document, { key: "k", metaKey: true });
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

test("Ctrl K supports empty searches, streamed files and Escape", async () => {
  setNavigationPreview();
  const user = userEvent.setup();
  const view = render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  fireEvent.keyDown(document, { key: "k", ctrlKey: true });
  const dialog = await screen.findByRole("dialog", { name: "Find a file" });
  const input = within(dialog).getByRole("combobox", { name: "Search files" });
  await user.type(input, "missing");
  expect(within(dialog).getByText("No files found.")).toBeTruthy();
  await user.clear(input);
  state.preview = {
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
    within(
      screen.getByRole("complementary", { name: "Review notes" }),
    ).getByText("Select a file to start taking notes."),
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
  expect(screen.getAllByRole("separator")).toHaveLength(2);
  screen
    .getAllByRole("separator")
    .forEach((handle) => expect(handle.querySelector("div")).toBeTruthy());
  screen
    .getAllByRole("separator")
    .forEach((handle) =>
      expect(handle.getAttribute("aria-orientation")).toBe("vertical"),
    );
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
  await user.click(screen.getByRole("button", { name: "Open notes" }));
  const notes = await screen.findByRole("dialog", {
    name: "Notes",
  });
  expect(
    within(notes).getByText("Select a file to start taking notes."),
  ).toBeTruthy();
  expect(within(notes).queryByRole("button", { name: "Settings" })).toBeNull();
  await user.click(within(notes).getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Open notes" }),
  );
});

test("changing to desktop unmounts an open mobile drawer", async () => {
  state.mobile = true;
  const user = userEvent.setup();
  const view = render(<ReviewWorkspace>Setup steps</ReviewWorkspace>);
  await user.click(screen.getByRole("button", { name: "Open notes" }));
  await screen.findByRole("dialog", { name: "Notes" });
  state.mobile = false;
  view.rerender(<ReviewWorkspace>Setup steps</ReviewWorkspace>);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getAllByRole("separator")).toHaveLength(2);
  screen
    .getAllByRole("separator")
    .forEach((handle) => expect(handle.querySelector("div")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Open notes" })).toBeNull();
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
  expect(screen.getByText("Receiving 1 of 2 files")).toBeTruthy();
  state.preview = {
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

test("comments and standalone notes share local state across files and views, with no cross-review leakage", async () => {
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
    id: "review-one",
    source: {
      kind: "working-tree",
      base: "a".repeat(40),
      head: null,
      firstParent: false,
    },
    expectedFiles: 2,
    files: [file, { ...file, path: "second.ts" }],
    excluded: [],
    status: "ready",
    error: null,
  };
  const view = render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  await user.click(screen.getByRole("button", { name: "Mock line comment" }));
  const notes = screen.getByRole("complementary", { name: "Review notes" });
  expect(within(notes).getByText("Inline feedback")).toBeTruthy();
  expect(within(notes).getByText("New line 1")).toBeTruthy();
  expect(within(notes).getByText("one")).toBeTruthy();
  // Resizable panels have no hitboxes in JSDOM; focus sidebar controls directly.
  within(notes).getByLabelText("Note").focus();
  await user.keyboard("Standalone feedback");
  expect(
    (within(notes).getByLabelText("Note") as HTMLTextAreaElement).value,
  ).toBe("Standalone feedback");
  within(notes).getByRole("button", { name: "Add note" }).focus();
  await user.keyboard("{Enter}");
  expect(await within(notes).findByText("Standalone feedback")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Next file" }));
  expect(screen.queryByRole("main")?.textContent).not.toContain(
    "Inline feedback",
  );
  expect(within(notes).getByText("Inline feedback")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Previous file" }));
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("button", { name: "Unified" }));
  await user.keyboard("{Escape}");
  expect(
    within(screen.getByRole("main")).getByText("Inline feedback"),
  ).toBeTruthy();
  within(notes).getAllByRole("button", { name: "Delete note" })[0]!.focus();
  await user.keyboard("{Enter}");
  expect(screen.queryByText("Inline feedback")).toBeNull();
  state.mobile = true;
  view.rerender(<ReviewWorkspace>Setup</ReviewWorkspace>);
  await user.click(screen.getByRole("button", { name: "Open notes" }));
  expect(
    within(await screen.findByRole("dialog", { name: "Notes" })).getByText(
      "Standalone feedback",
    ),
  ).toBeTruthy();
  await user.keyboard("{Escape}");
  state.mobile = false;
  state.preview = { ...state.preview, id: "review-two", notes: [] };
  view.rerender(<ReviewWorkspace>Setup</ReviewWorkspace>);
  expect(screen.queryByText("Standalone feedback")).toBeNull();
  screen.getByLabelText("Note").focus();
  await user.keyboard("Unsaved note");
  screen.getByRole("button", { name: "Add note" }).focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByText("Unsaved note")).toBeTruthy();
  view.unmount();
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  expect(screen.getByText("Unsaved note")).toBeTruthy();
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
  expect(canvas.classList.contains("ring-primary/40")).toBe(true);
  expect(
    screen
      .getByRole("button", { name: /src\/first.ts: Completed/ })
      .classList.contains("bg-primary/10"),
  ).toBe(true);
  fireEvent.keyDown(document, { key: "d", repeat: true });
  fireEvent.keyDown(document, { key: "d", ctrlKey: true });
  fireEvent.keyDown(document, { key: "d", isComposing: true });
  fireEvent.keyDown(screen.getByLabelText("Note"), { key: "d" });
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
});
