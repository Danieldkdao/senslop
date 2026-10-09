// @vitest-environment jsdom

import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { PreviewDiff } from "../components/preview-diff";
import { defaultDiffSettings } from "../constants";
import type { PreviewFileSchema } from "@senslop/contracts";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("real syntax tokens survive returning to a file and changing diff options", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const file: PreviewFileSchema = {
    path: "theme.css",
    oldPath: null,
    status: "M",
    binary: false,
    before: ":root {\n  --one: red;\n  --two: red;\n  --primary: red;\n}\n",
    after: ":root {\n  --one: red;\n  --two: red;\n  --primary: green;\n}\n",
    beforeHash: "a".repeat(64),
    afterHash: "b".repeat(64),
    added: 1,
    deleted: 1,
    diff: "diff --git a/theme.css b/theme.css\n--- a/theme.css\n+++ b/theme.css\n@@ -3,3 +3,3 @@\n   --two: red;\n-  --primary: red;\n+  --primary: green;\n }\n",
  };
  const props = {
    file,
    settings: defaultDiffSettings,
    notes: [],
    onAddComment: vi.fn(),
    onDeleteNote: vi.fn(),
  };
  const view = render(<PreviewDiff key={file.path} {...props} view="split" />);
  const expectTokens = async () => {
    await waitFor(() => {
      const root = view.container.querySelector("diffs-container")?.shadowRoot;
      const colors = new Set(
        Array.from(
          root?.querySelectorAll<HTMLElement>(
            "code span[style*=diffs-token]",
          ) ?? [],
        ).map((span) => span.style.getPropertyValue("--diffs-token-dark")),
      );
      expect(
        colors.size,
        "CSS declarations should have distinct syntax token colors",
      ).toBeGreaterThan(1);
    });
  };
  await expectTokens();
  for (let index = 0; index < 5; index++) {
    view.rerender(
      <PreviewDiff
        key={file.path}
        {...props}
        view={index % 2 ? "split" : "unified"}
        settings={{ ...defaultDiffSettings, lineNumbers: index % 2 === 0 }}
      />,
    );
    await expectTokens();
    view.rerender(
      <PreviewDiff
        key="other.ts"
        {...props}
        view="split"
        file={{
          ...file,
          path: "other.ts",
          before: "export const value = 1;\n",
          after: "export const value = 2;\n",
          diff: "",
        }}
      />,
    );
    view.rerender(<PreviewDiff key={file.path} {...props} view="split" />);
    await expectTokens();
  }
});
