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

const profile = {
  name: "Daniel Dao",
  email: "daniel@example.invalid",
  image: null,
};

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);

const state = vi.hoisted(() => ({
  mobile: false,
  preview: null as LivePreview | null,
  signOut: vi.fn(),
  session: {
    data: {
      user: {
        name: "Daniel Dao",
        email: "daniel@example.invalid",
        image: null,
      },
    } as { user: { name: string; email: string; image: null } } | null,
    isPending: false,
  },
  push: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("../components/live-preview-provider", () => ({
  useLivePreview: () => ({
    preview: state.preview,
    connection: { status: "live", devices: [] },
  }),
}));
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
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { signOut: state.signOut, useSession: () => state.session },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, refresh: state.refresh }),
}));
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
  state.signOut.mockResolvedValue({ error: null });
  state.session = { data: { user: profile }, isPending: false };
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
  await user.click(screen.getByRole("button", { name: "Diff settings" }));
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
  expect(
    screen.getByRole("button", { name: "Open account menu" }),
  ).toBeTruthy();
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
    name: "Notes and account",
  });
  expect(
    within(notes).getByText("Select a file to start taking notes."),
  ).toBeTruthy();
  expect(
    within(notes).getByRole("button", { name: "Open account menu" }),
  ).toBeTruthy();
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
  await screen.findByRole("dialog", { name: "Notes and account" });
  state.mobile = false;
  view.rerender(<ReviewWorkspace>Setup steps</ReviewWorkspace>);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getAllByRole("separator")).toHaveLength(2);
  screen
    .getAllByRole("separator")
    .forEach((handle) => expect(handle.querySelector("div")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Open notes" })).toBeNull();
});

test("sign-out returns to login after the server confirms it", async () => {
  const user = userEvent.setup();
  render(<ReviewWorkspace>Setup steps</ReviewWorkspace>);
  // JSDOM has no resize hitboxes; use keyboard activation here.
  const account = screen.getByRole("button", { name: "Open account menu" });
  account.focus();
  await user.keyboard("{ArrowDown}");
  (await screen.findByRole("menuitem", { name: "Sign out" })).focus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(state.push).toHaveBeenCalledWith("/login"));
  expect(state.refresh).toHaveBeenCalledOnce();
});

test.each(["returned error", "network failure"])(
  "sign-out %s keeps the workspace open and permits retry",
  async (failure) => {
    if (failure === "returned error")
      state.signOut.mockResolvedValueOnce({
        error: { message: "Unavailable" },
      });
    else state.signOut.mockRejectedValueOnce(new Error("Offline"));
    const user = userEvent.setup();
    render(<ReviewWorkspace>Setup steps</ReviewWorkspace>);
    // JSDOM has no resize hitboxes; use keyboard activation here.
    const account = screen.getByRole("button", { name: "Open account menu" });
    account.focus();
    await user.keyboard("{ArrowDown}");
    (await screen.findByRole("menuitem", { name: "Sign out" })).focus();
    await user.keyboard("{Enter}");
    expect(state.toastError).toHaveBeenCalledWith(
      "Sign-out failed. Please retry.",
    );
    expect(state.push).not.toHaveBeenCalled();
    account.focus();
    await user.keyboard("{ArrowDown}");
    (await screen.findByRole("menuitem", { name: "Sign out" })).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/login"));
  },
);

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
  await user.click(screen.getByRole("button", { name: "Unified" }));
  expect(
    screen
      .getByRole("button", { name: "Unified" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.getByText("Diff for second.tsx")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Previous file" }));
  expect(screen.getByText("Diff for first.ts")).toBeTruthy();
});

test("pending account information leaves files, notes and the canvas usable", () => {
  state.session = { data: null, isPending: true };
  render(<ReviewWorkspace>Connection steps remain visible</ReviewWorkspace>);
  expect(screen.getByText("Connection steps remain visible")).toBeTruthy();
  expect(screen.getByText("No files here yet")).toBeTruthy();
  expect(screen.getByText("Select a file to start taking notes.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Loading account" })).toBeTruthy();
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
  await user.click(screen.getByRole("button", { name: "Unified" }));
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
    within(
      await screen.findByRole("dialog", { name: "Notes and account" }),
    ).getByText("Standalone feedback"),
  ).toBeTruthy();
  await user.keyboard("{Escape}");
  state.mobile = false;
  state.preview = { ...state.preview, id: "review-two" };
  view.rerender(<ReviewWorkspace>Setup</ReviewWorkspace>);
  expect(screen.queryByText("Standalone feedback")).toBeNull();
  screen.getByLabelText("Note").focus();
  await user.keyboard("Unsaved note");
  screen.getByRole("button", { name: "Add note" }).focus();
  await user.keyboard("{Enter}");
  expect(await screen.findByText("Unsaved note")).toBeTruthy();
  view.unmount();
  render(<ReviewWorkspace>Setup</ReviewWorkspace>);
  expect(screen.queryByText("Unsaved note")).toBeNull();
});
