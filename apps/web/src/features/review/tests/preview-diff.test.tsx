// @vitest-environment jsdom

import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FileDiffProps, FileProps } from "@pierre/diffs/react";
import type { PreviewFileSchema } from "@senslop/contracts";
import type { ReviewAnnotation, ReviewNote } from "../types";
import { PreviewDiff } from "../components/preview-diff";

const mocks = vi.hoisted(() => ({ diff: vi.fn(), file: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { name: "Daniel", image: null } },
      isPending: false,
    }),
  },
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
      props.options.onLineNumberClick({
        lineNumber: unchanged ? 2 : 1,
        annotationSide: "additions",
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

test("line-number clicks anchor the new side and invalid line events are ignored", () => {
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
    mocks.diff.mock.lastCall?.[0].options.onLineNumberClick({
      lineNumber: 1,
      annotationSide: "additions",
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
