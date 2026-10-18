// @vitest-environment jsdom

import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FileDiffProps, FileProps } from "@pierre/diffs/react";
import type { PreviewFileSchema } from "@senslop/contracts";
import type { ReviewAnnotation, ReviewNote } from "../types";
import { PreviewDiff } from "../components/preview-diff";
import { defaultDiffSettings } from "../constants";

const mocks = vi.hoisted(() => ({
  diff: vi.fn(),
  file: vi.fn(),
  explanation: vi.fn(),
}));
vi.mock("../../agents/components/selection-explanation", () => ({
  SelectionExplanation: (props: unknown) => {
    mocks.explanation(props);
    return null;
  },
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("../hooks/use-diff-highlighter", () => ({
  useDiffHighlighter: () => ({ ready: true, error: false, retry: vi.fn() }),
}));
vi.mock("@pierre/diffs/react", () => ({
  FileDiff: (props: FileDiffProps<ReviewAnnotation, undefined>) => {
    mocks.diff(props);
    return (
      <div>
        Rendered diff
        {props.options?.enableGutterUtility && (
          <button
            onClick={() =>
              props.options?.onGutterUtilityClick?.({
                start: 1,
                end: 1,
                side: props.fileDiff.type === "new" ? "additions" : "deletions",
              })
            }
          >
            Native gutter +
          </button>
        )}
        {props.lineAnnotations?.map((annotation, index) => (
          <div key={index}>{props.renderAnnotation?.(annotation)}</div>
        ))}
      </div>
    );
  },
  File: (props: FileProps<ReviewAnnotation, undefined>) => {
    mocks.file(props);
    return (
      <div>
        Rendered file
        {props.options?.enableGutterUtility && (
          <button
            onClick={() =>
              props.options?.onGutterUtilityClick?.({ start: 1, end: 1 })
            }
          >
            Native gutter +
          </button>
        )}
        {props.lineAnnotations?.map((annotation, index) => (
          <div key={index}>{props.renderAnnotation?.(annotation)}</div>
        ))}
      </div>
    );
  },
}));

const file: PreviewFileSchema = {
  path: "index.ts",
  oldPath: null,
  status: "M",
  binary: false,
  before: "old\n",
  after: "new\n",
  beforeHash: "a".repeat(64),
  afterHash: "b".repeat(64),
  added: 1,
  deleted: 1,
  diff: "diff --git a/index.ts b/index.ts\n--- a/index.ts\n+++ b/index.ts\n@@ -1 +1 @@\n-old\n+new\n",
};
const settings = {
  ...defaultDiffSettings,
  indicators: "classic" as const,
  inlineChanges: "char" as const,
  backgrounds: false,
  wrapping: true,
  lineNumbers: false,
};
const handlers = { notes: [], onAddComment: vi.fn(), onDeleteNote: vi.fn() };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test.each(["split", "unified"] as const)(
  "%s uses Pierre's native gutter without an oversized custom button",
  (view) => {
    render(
      <PreviewDiff file={file} view={view} settings={settings} {...handlers} />,
    );
    const props = mocks.diff.mock.lastCall?.[0];
    expect(props.renderGutterUtility).toBeUndefined();
    expect(props.options).toMatchObject({
      diffStyle: view,
      diffIndicators: "classic",
      lineDiffType: "char",
      disableBackground: true,
      overflow: "wrap",
      disableLineNumbers: true,
      enableGutterUtility: true,
    });
    expect(props.options.onGutterUtilityClick).toBeTypeOf("function");
    expect(
      screen.queryByRole("button", { name: "Add line comment" }),
    ).toBeNull();
  },
);

test("the inline composer is anchored to the clicked old line and rejects blank messages", async () => {
  const user = userEvent.setup();
  render(
    <PreviewDiff file={file} view="split" settings={settings} {...handlers} />,
  );
  await user.click(screen.getByRole("button", { name: "Native gutter +" }));
  const draft = mocks.diff.mock.lastCall?.[0].lineAnnotations.find(
    (annotation: { metadata: ReviewAnnotation }) =>
      annotation.metadata.kind === "composer",
  );
  expect(draft).toMatchObject({ lineNumber: 1, side: "deletions" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByLabelText("Line number")).toBeNull();
  expect(screen.queryByLabelText("File side")).toBeNull();
  expect(document.activeElement).toBe(screen.getByLabelText("Comment"));
  await user.click(screen.getByRole("button", { name: "Comment" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(handlers.onAddComment).not.toHaveBeenCalled();
  await user.type(
    screen.getByLabelText("Comment"),
    "  Check the old behavior  ",
  );
  await user.click(screen.getByRole("button", { name: "Comment" }));
  expect(handlers.onAddComment).toHaveBeenCalledWith("Check the old behavior", {
    side: "deletions",
    lineNumber: 1,
    code: "old",
  });
  expect(screen.queryByLabelText("Comment")).toBeNull();
  expect(screen.getByRole("button", { name: "Native gutter +" })).toBeTruthy();
});

test.each(["split", "unified", "unchanged"] as const)(
  "%s hides all gutter actions and locks the draft anchor until cancellation",
  async (mode) => {
    const user = userEvent.setup();
    const unchanged = mode === "unchanged";
    render(
      <PreviewDiff
        file={
          unchanged
            ? { ...file, before: "old\nsecond\n", after: "old\nsecond\n" }
            : file
        }
        view={mode === "unified" ? "unified" : "split"}
        settings={settings}
        {...handlers}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Native gutter +" }));
    await user.type(screen.getByLabelText("Comment"), "Keep this draft");
    const props = (unchanged ? mocks.file : mocks.diff).mock.lastCall?.[0];
    expect(props.options.enableGutterUtility).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Native gutter +" }),
    ).toBeNull();
    act(() => {
      props.options.onGutterUtilityClick({
        start: unchanged ? 2 : 1,
        end: unchanged ? 2 : 1,
        side: "additions",
      });
    });
    expect(
      (screen.getByLabelText("Comment") as HTMLTextAreaElement).value,
    ).toBe("Keep this draft");
    expect(
      (unchanged ? mocks.file : mocks.diff).mock.lastCall?.[0]
        .lineAnnotations[0].lineNumber,
    ).toBe(1);
    if (!unchanged)
      expect(mocks.diff.mock.lastCall?.[0].lineAnnotations[0].side).toBe(
        "deletions",
      );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("button", { name: "Native gutter +" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Native gutter +" }));
    expect(
      (screen.getByLabelText("Comment") as HTMLTextAreaElement).value,
    ).toBe("");
  },
);

test("cancel removes only the draft and view changes retain the message", async () => {
  const user = userEvent.setup();
  const view = render(
    <PreviewDiff file={file} view="split" settings={settings} {...handlers} />,
  );
  await user.click(screen.getByRole("button", { name: "Native gutter +" }));
  await user.type(screen.getByLabelText("Comment"), "Draft feedback");
  view.rerender(
    <PreviewDiff
      file={file}
      view="unified"
      settings={{ ...settings, lineNumbers: true }}
      {...handlers}
    />,
  );
  expect((screen.getByLabelText("Comment") as HTMLTextAreaElement).value).toBe(
    "Draft feedback",
  );
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByLabelText("Comment")).toBeNull();
  expect(mocks.diff.mock.lastCall?.[0].lineAnnotations).toHaveLength(0);
  expect(handlers.onAddComment).not.toHaveBeenCalled();
});

test("gutter clicks anchor the new side and invalid line events are ignored", () => {
  render(
    <PreviewDiff
      file={file}
      view="unified"
      settings={settings}
      {...handlers}
    />,
  );
  act(() =>
    mocks.diff.mock.lastCall?.[0].options.onGutterUtilityClick({
      start: 5,
      end: 5,
      side: "additions",
    }),
  );
  expect(screen.queryByLabelText("Comment")).toBeNull();
  act(() =>
    mocks.diff.mock.lastCall?.[0].options.onGutterUtilityClick({
      start: 1,
      end: 1,
      side: "additions",
    }),
  );
  expect(mocks.diff.mock.lastCall?.[0].lineAnnotations[0]).toMatchObject({
    side: "additions",
    lineNumber: 1,
  });
});

test.each(["added", "deleted"])(
  "%s files preserve the existing source side",
  async (kind) => {
    const user = userEvent.setup();
    const changed =
      kind === "added"
        ? { ...file, before: null, diff: "", status: "A" }
        : { ...file, after: null, diff: "", status: "D" };
    render(
      <PreviewDiff
        file={changed}
        view="split"
        settings={settings}
        {...handlers}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Native gutter +" }));
    await user.type(screen.getByLabelText("Comment"), "Review this line");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(handlers.onAddComment).toHaveBeenCalledWith("Review this line", {
      side: kind === "added" ? "additions" : "deletions",
      lineNumber: 1,
      code: kind === "added" ? "new" : "old",
    });
  },
);

test("standalone notes stay out of annotations; saved comments remain deletable beside a draft", async () => {
  const user = userEvent.setup();
  const note: ReviewNote = {
    id: "one",
    previewId: "review",
    path: file.path,
    body: "First",
    line: { side: "deletions", lineNumber: 1, code: "old" },
  };
  render(
    <PreviewDiff
      file={file}
      view="split"
      settings={settings}
      {...handlers}
      notes={[
        note,
        { ...note, id: "two", body: "Second" },
        { ...note, id: "standalone", body: "General note", line: null },
      ]}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Native gutter +" }));
  expect(screen.getByText("First")).toBeTruthy();
  expect(screen.getByText("Second")).toBeTruthy();
  expect(screen.queryByText("General note")).toBeNull();
  expect(mocks.diff.mock.lastCall?.[0].lineAnnotations).toHaveLength(3);
  await user.click(
    screen.getAllByRole("button", { name: "Delete comment" })[0]!,
  );
  expect(handlers.onDeleteNote).toHaveBeenCalledWith("one");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(mocks.diff.mock.lastCall?.[0].lineAnnotations).toHaveLength(2);
});

test("unchanged files use inline annotations and preserve display settings", async () => {
  const user = userEvent.setup();
  render(
    <PreviewDiff
      file={{ ...file, after: file.before }}
      view="split"
      settings={settings}
      {...handlers}
    />,
  );
  expect(mocks.file.mock.lastCall?.[0].options).toMatchObject({
    overflow: "wrap",
    disableLineNumbers: true,
  });
  expect(mocks.file.mock.lastCall?.[0].renderGutterUtility).toBeUndefined();
  await user.click(screen.getByRole("button", { name: "Native gutter +" }));
  await user.type(screen.getByLabelText("Comment"), "Same contents");
  await user.click(screen.getByRole("button", { name: "Comment" }));
  expect(handlers.onAddComment).toHaveBeenCalledWith("Same contents", {
    side: "additions",
    lineNumber: 1,
    code: "old",
  });
});

test("empty files expose no comment action", () => {
  render(
    <PreviewDiff
      file={{ ...file, before: "", after: "" }}
      view="split"
      settings={settings}
      {...handlers}
    />,
  );
  expect(screen.getByText("Rendered file")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

test("review evidence selects the exact source side and brings it into view", () => {
  render(
    <PreviewDiff
      file={file}
      view="split"
      settings={settings}
      notes={[]}
      onAddComment={vi.fn()}
      onDeleteNote={vi.fn()}
      evidence={{ side: "before", start: 1, end: 1 }}
    />,
  );
  const props = mocks.diff.mock.lastCall?.[0];
  expect(props.selectedLines).toMatchObject({
    start: 1,
    end: 1,
    side: "deletions",
  });
  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  const scroller = document.createElement("div");
  scroller.dataset.reviewScroll = "";
  scroller.scrollTop = 80;
  scroller.scrollTo = vi.fn();
  scroller.getBoundingClientRect = () => new DOMRect(0, 100, 400, 400);
  scroller.append(host);
  document.body.append(scroller);
  const line = document.createElement("span");
  line.getBoundingClientRect = () => new DOMRect(0, 650, 200, 20);
  line.dataset.line = "1";
  line.dataset.selectedLine = "single";
  line.scrollIntoView = vi.fn();
  root.append(line);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  try {
    props.options.onPostRender(host, {} as never, "render");
    expect(line.scrollIntoView).not.toHaveBeenCalled();
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 440 });
    props.options.onPostRender(host, {} as never, "render");
    expect(scroller.scrollTo).toHaveBeenCalledTimes(1);
  } finally {
    scroller.remove();
    vi.unstubAllGlobals();
  }
});

test("native line selection controls the range without opening a comment composer", () => {
  render(
    <PreviewDiff file={file} view="split" settings={settings} {...handlers} />,
  );
  expect(mocks.diff.mock.lastCall?.[0].options.enableLineSelection).toBe(true);
  act(() =>
    mocks.diff.mock.lastCall?.[0].options.onLineSelected({
      start: 1,
      end: 1,
      side: "deletions",
    }),
  );
  expect(mocks.diff.mock.lastCall?.[0].selectedLines).toEqual({
    start: 1,
    end: 1,
    side: "deletions",
  });
  expect(screen.queryByLabelText("Comment")).toBeNull();
  act(() => mocks.diff.mock.lastCall?.[0].options.onLineSelected(null));
  expect(mocks.diff.mock.lastCall?.[0].selectedLines).toBeNull();
});

test("the explanation bubble anchors to the selected source side in a split diff", () => {
  render(
    <PreviewDiff
      snapshotId="snapshot"
      file={file}
      view="split"
      settings={settings}
      {...handlers}
    />,
  );
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML =
    '<code data-code data-deletions><div data-line="1" data-selected-line>old</div></code><code data-code data-additions><div data-line="1" data-selected-line>new</div></code>';
  act(() => {
    mocks.diff.mock.lastCall?.[0].options.onPostRender(host, {}, "mount");
    mocks.diff.mock.lastCall?.[0].options.onLineSelected({
      start: 1,
      end: 1,
      side: "additions",
    });
  });
  const selected = shadow.querySelector<HTMLElement>(
    "[data-additions] [data-line]",
  )!;
  const rect = new DOMRect(100, 200, 300, 20);
  selected.getBoundingClientRect = () => rect;
  expect(
    mocks.explanation.mock.lastCall?.[0].anchor.getBoundingClientRect(),
  ).toBe(rect);
  selected.removeAttribute("data-selected-line");
  expect(
    mocks.explanation.mock.lastCall?.[0].anchor.getBoundingClientRect(),
  ).toBe(rect);
});

test("a selected range creates a note below its last line and hovering a saved note highlights its range", async () => {
  const rangedFile = {
    ...file,
    after: "one\ntwo\nthree\n",
    diff: "--- a/index.ts\n+++ b/index.ts\n@@ -1 +1,3 @@\n-old\n+one\n+two\n+three\n",
  };
  const notes: ReviewNote[] = [
    {
      id: "range",
      previewId: "snapshot",
      path: file.path,
      body: "Covered range",
      line: {
        side: "additions",
        lineNumber: 1,
        endLineNumber: 2,
        code: "one\ntwo",
      },
    },
  ];
  render(
    <PreviewDiff
      file={rangedFile}
      view="split"
      settings={settings}
      {...handlers}
      notes={notes}
      snapshotId="snapshot"
    />,
  );
  const user = userEvent.setup();
  await user.hover(screen.getByText("Covered range"));
  expect(mocks.diff.mock.lastCall?.[0].selectedLines).toMatchObject({
    start: 1,
    end: 2,
    side: "additions",
  });
  await user.unhover(screen.getByText("Covered range"));
  act(() =>
    mocks.diff.mock.lastCall?.[0].options.onLineSelected({
      start: 3,
      end: 1,
      side: "additions",
    }),
  );
  act(() => mocks.explanation.mock.lastCall?.[0].onAddNote());
  const draft = mocks.diff.mock.lastCall?.[0].lineAnnotations.find(
    (annotation: { metadata: ReviewAnnotation }) =>
      annotation.metadata.kind === "composer",
  );
  expect(draft.lineNumber).toBe(3);
  expect(mocks.diff.mock.lastCall?.[0].selectedLines).toMatchObject({
    start: 1,
    end: 3,
  });
  await user.type(screen.getByLabelText("Comment"), "Overlap");
  await user.click(screen.getByRole("button", { name: "Comment" }));
  expect(handlers.onAddComment).toHaveBeenCalledWith("Overlap", {
    side: "additions",
    lineNumber: 1,
    endLineNumber: 3,
    code: "one\ntwo\nthree",
  });
  expect(screen.getByText("New Lines 1-2")).toBeTruthy();
});
