// @vitest-environment jsdom

import { Fragment, StrictMode, useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { EditorDiffPreview } from "../../settings/components/editor-diff-preview";
import { PreviewDiff } from "../components/preview-diff";
import { defaultDiffSettings } from "../constants";
import type { PreviewFileSchema } from "@senslop/contracts";
import {
  FileDiff as PierreFileDiff,
  disposeHighlighter,
  preloadHighlighter,
} from "@pierre/diffs";

const state = vi.hoisted(() => ({
  anchors: [] as {
    getBoundingClientRect: () => DOMRect;
    contextElement?: Element;
  }[],
  preload: vi.fn(),
  theme: "dark" as string | undefined,
}));
vi.mock("@pierre/diffs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pierre/diffs")>();
  return { ...actual, preloadHighlighter: state.preload };
});
vi.mock("../../agents/components/selection-explanation", () => ({
  SelectionExplanation: ({
    anchor,
  }: {
    anchor: { getBoundingClientRect: () => DOMRect; contextElement?: Element };
  }) => {
    useLayoutEffect(() => {
      state.anchors.push(anchor);
    }, [anchor]);
    return null;
  },
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: state.theme }),
}));

beforeEach(async () => {
  const actual =
    await vi.importActual<typeof import("@pierre/diffs")>("@pierre/diffs");
  state.preload.mockReset().mockImplementation(actual.preloadHighlighter);
  state.theme = "dark";
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(async () => {
  cleanup();
  await disposeHighlighter();
  vi.unstubAllGlobals();
});

test("failed highlighter initialization offers retry and then renders the sample", async () => {
  state.preload.mockRejectedValueOnce(
    new Error("A syntax asset failed to load"),
  );
  const view = render(
    <EditorDiffPreview settings={defaultDiffSettings} view="split" />,
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(view.container.querySelector("diffs-container")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry loading diff" }));
  await waitFor(() =>
    expect(codeText(view.container)).toContain("welcomeMember"),
  );
});

const codeText = (container: HTMLElement) =>
  [
    ...(container
      .querySelector("diffs-container")
      ?.shadowRoot?.querySelectorAll("code") ?? []),
  ]
    .map((code) => code.textContent)
    .join("");

test("theme and typography changes render in the sample without changing application appearance", async () => {
  state.theme = "light";
  const view = render(
    <EditorDiffPreview settings={defaultDiffSettings} view="split" />,
  );
  await waitFor(() =>
    expect(codeText(view.container)).toContain("welcomeMember"),
  );
  view.rerender(
    <EditorDiffPreview
      settings={{
        ...defaultDiffSettings,
        theme: "dracula",
        font: "geist-mono",
        fontSize: 20,
        lineHeight: 28,
      }}
      view="split"
    />,
  );
  await waitFor(() => {
    const host = view.container.querySelector<HTMLElement>("diffs-container")!;
    expect(host.style.getPropertyValue("--diffs-font-size")).toBe("20px");
    expect(host.style.getPropertyValue("--diffs-line-height")).toBe("28px");
    expect(host.style.getPropertyValue("--diffs-font-family")).toContain(
      "--font-geist-mono",
    );
    expect(host.classList.contains("preview-diff-default")).toBe(false);
    expect(
      host.shadowRoot!.querySelector("[data-theme-css]")?.textContent,
    ).toContain("#282A36");
  });
  expect(state.theme).toBe("light");
});

const file: PreviewFileSchema = {
  path: "example.ts",
  oldPath: null,
  status: "M",
  binary: false,
  before: "export const value = 1;\n",
  after: "export const value = 2;\n",
  beforeHash: "a".repeat(64),
  afterHash: "b".repeat(64),
  added: 1,
  deleted: 1,
  diff: "diff --git a/example.ts b/example.ts\n--- a/example.ts\n+++ b/example.ts\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n",
};

test.each([
  ["settings", true, false],
  ["workspace", true, false],
  ["unchanged", true, false],
  ["settings", false, false],
  ["workspace", false, false],
  ["unchanged", false, false],
  ["settings", true, true],
  ["workspace", true, true],
] as const)(
  "%s diff renders highlighted code on its first mount, Strict Mode: %s, preloaded: %s",
  async (kind, strict, preloaded) => {
    if (preloaded)
      await preloadHighlighter({
        themes: ["pierre-dark", "pierre-light"],
        langs: ["typescript"],
      });
    const Root = strict ? StrictMode : Fragment;
    const view = render(
      <Root>
        {kind === "settings" ? (
          <EditorDiffPreview settings={defaultDiffSettings} view="split" />
        ) : (
          <PreviewDiff
            file={kind === "unchanged" ? { ...file, before: file.after } : file}
            settings={defaultDiffSettings}
            view="split"
            notes={[]}
            onAddComment={vi.fn()}
            onDeleteNote={vi.fn()}
          />
        )}
      </Root>,
    );
    await waitFor(
      () => {
        const hosts = [...view.container.querySelectorAll("diffs-container")];
        expect(hosts).toHaveLength(1);
        for (const host of hosts) {
          expect(
            [...host.shadowRoot!.querySelectorAll("code")]
              .map((code) => code.textContent)
              .join(""),
          ).toContain("export");
          const tokens = [
            ...(host.shadowRoot?.querySelectorAll<HTMLElement>(
              "code span[style*=diffs-token]",
            ) ?? []),
          ];
          const colors = new Set(
            tokens.map((token) =>
              token.style.getPropertyValue("--diffs-token-dark"),
            ),
          );
          expect(colors.size).toBeGreaterThan(1);
        }
      },
      { timeout: 4000 },
    );
  },
);

test("changing files while a grammar loads cannot mark the next file ready prematurely", async () => {
  const actual =
    await vi.importActual<typeof import("@pierre/diffs")>("@pierre/diffs");
  let finish!: () => void;
  state.preload.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const props = {
    settings: defaultDiffSettings,
    view: "split" as const,
    notes: [],
    onAddComment: vi.fn(),
    onDeleteNote: vi.fn(),
  };
  const view = render(
    <StrictMode>
      <PreviewDiff {...props} file={file} />
    </StrictMode>,
  );
  const css = {
    ...file,
    path: "theme.css",
    oldPath: null,
    before: ":root { color: red; }\n",
    after: ":root { color: green; }\n",
    diff: "",
  };
  view.rerender(
    <StrictMode>
      <PreviewDiff {...props} file={css} />
    </StrictMode>,
  );
  await waitFor(() => expect(codeText(view.container)).toContain("green"));
  await actual.preloadHighlighter({
    themes: ["pierre-dark", "pierre-light"],
    langs: ["typescript"],
  });
  finish();
  await waitFor(() => {
    expect(codeText(view.container)).toContain("green");
    expect(screen.queryByRole("status", { name: "Loading diff" })).toBeNull();
  });
  view.rerender(
    <StrictMode>
      <PreviewDiff {...props} file={file} />
    </StrictMode>,
  );
  await waitFor(() => expect(codeText(view.container)).toContain("value"));
});

test("renamed files preload both grammars and remain highlighted after theme resolution", async () => {
  state.theme = undefined;
  const renamed = {
    ...file,
    path: "example.tsx",
    oldPath: "example.js",
    after: "export const View = () => <div />;\n",
    diff: "",
  };
  const props = {
    file: renamed,
    settings: defaultDiffSettings,
    view: "split" as const,
    notes: [],
    onAddComment: vi.fn(),
    onDeleteNote: vi.fn(),
  };
  const view = render(
    <StrictMode>
      <PreviewDiff {...props} />
    </StrictMode>,
  );
  await waitFor(() => expect(codeText(view.container)).toContain("View"));
  expect(state.preload).toHaveBeenCalledWith(
    expect.objectContaining({
      langs: expect.arrayContaining(["tsx", "javascript"]),
    }),
  );
  state.theme = "dark";
  view.rerender(
    <StrictMode>
      <PreviewDiff {...props} />
    </StrictMode>,
  );
  await waitFor(() => {
    const tokens =
      view.container
        .querySelector("diffs-container")
        ?.shadowRoot?.querySelectorAll<HTMLElement>(
          "code span[style*=diffs-token]",
        ) ?? [];
    expect(
      new Set(
        [...tokens].map((token) =>
          token.style.getPropertyValue("--diffs-token-dark"),
        ),
      ).size,
    ).toBeGreaterThan(1);
  });
});

test("real Pierre annotations share the ending-line slot and range hover highlights all covered lines", async () => {
  const ranged = {
    ...file,
    after: "export const one = 1;\nexport const two = 2;\n",
    diff: "--- a/example.ts\n+++ b/example.ts\n@@ -1 +1,2 @@\n-export const value = 1;\n+export const one = 1;\n+export const two = 2;\n",
  };
  const view = render(
    <PreviewDiff
      file={ranged}
      view="split"
      settings={defaultDiffSettings}
      notes={[
        {
          id: "range",
          previewId: "snapshot",
          path: file.path,
          body: "Range note",
          line: {
            side: "additions",
            lineNumber: 1,
            endLineNumber: 2,
            code: "export const one = 1;\nexport const two = 2;",
          },
        },
        {
          id: "overlap",
          previewId: "snapshot",
          path: file.path,
          body: "Same ending line",
          line: {
            side: "additions",
            lineNumber: 2,
            code: "export const two = 2;",
          },
        },
      ]}
      onAddComment={vi.fn()}
      onDeleteNote={vi.fn()}
    />,
  );
  await waitFor(() =>
    expect(codeText(view.container)).toContain("export const two"),
  );
  const first = screen.getByText("Range note").closest("article")!;
  const second = screen.getByText("Same ending line").closest("article")!;
  const firstSlot = first.closest("[slot]") as HTMLElement;
  const secondSlot = second.closest("[slot]") as HTMLElement;
  expect(firstSlot.assignedSlot).not.toBeNull();
  expect(firstSlot.assignedSlot).toBe(secondSlot.assignedSlot);
  fireEvent.mouseEnter(first);
  await waitFor(() =>
    expect(
      view.container
        .querySelector("diffs-container")
        ?.shadowRoot?.querySelectorAll(
          "[data-code][data-additions] [data-line][data-selected-line]",
        ).length,
    ).toBe(2),
  );
  fireEvent.mouseLeave(first);
  await waitFor(() =>
    expect(
      view.container
        .querySelector("diffs-container")
        ?.shadowRoot?.querySelectorAll(
          "[data-code][data-additions] [data-line][data-selected-line]",
        ).length,
    ).toBe(0),
  );
});

test("selection explanation resolves a connected selected-code anchor on its first render", async () => {
  state.anchors = [];
  const view = render(
    <PreviewDiff
      file={file}
      settings={defaultDiffSettings}
      view="split"
      notes={[]}
      snapshotId="snapshot"
      onAddComment={vi.fn()}
      onDeleteNote={vi.fn()}
    />,
  );
  await waitFor(() => expect(codeText(view.container)).toContain("value"));
  const host = view.container.querySelector("diffs-container")!;
  const gutter =
    host.shadowRoot!.querySelector<HTMLElement>(
      "[data-gutter][data-additions] [data-column-number]",
    ) ?? host.shadowRoot!.querySelector<HTMLElement>("[data-column-number]")!;
  vi.stubGlobal("PointerEvent", MouseEvent);
  fireEvent.pointerDown(gutter, { button: 0, buttons: 1 });
  fireEvent.pointerUp(document, { button: 0 });
  await waitFor(() => expect(state.anchors.length).toBeGreaterThan(0));
  const anchor = state.anchors[0]!;
  expect(anchor.contextElement?.isConnected).toBe(true);
  const selected = [
    ...host.shadowRoot!.querySelectorAll<HTMLElement>(
      "[data-code] [data-line][data-selected-line]",
    ),
  ];
  expect(selected.length).toBeGreaterThan(0);
  const rect = new DOMRect(200, 300, 400, 24);
  for (const line of selected) line.getBoundingClientRect = () => rect;
  expect(anchor.getBoundingClientRect()).toBe(rect);
  const moved = new DOMRect(200, 350, 400, 24);
  for (const line of selected) {
    const replacement = line.cloneNode(true) as HTMLElement;
    replacement.getBoundingClientRect = () => moved;
    line.replaceWith(replacement);
  }
  expect(anchor.getBoundingClientRect()).toBe(moved);
});

test("repeated navigation releases each real Pierre diff instance", async () => {
  const cleaned = vi.spyOn(PierreFileDiff.prototype, "cleanUp");
  const props = {
    file,
    view: "split" as const,
    settings: defaultDiffSettings,
    notes: [],
    onAddComment: vi.fn(),
    onDeleteNote: vi.fn(),
  };
  const view = render(<PreviewDiff key="first" {...props} />);
  await waitFor(() => expect(codeText(view.container)).toContain("value"));
  for (let index = 0; index < 30; index++) {
    view.rerender(
      <PreviewDiff
        key={index}
        {...props}
        file={{ ...file, path: `file-${index}.ts` }}
      />,
    );
    await waitFor(() => expect(codeText(view.container)).toContain("value"));
    expect(view.container.querySelectorAll("diffs-container")).toHaveLength(1);
  }
  view.unmount();
  expect(cleaned).toHaveBeenCalledTimes(31);
  cleaned.mockRestore();
});
