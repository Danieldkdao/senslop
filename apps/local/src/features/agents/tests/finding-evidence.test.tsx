// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { FileDiffProps } from "@pierre/diffs/react";
import type { PreviewFileSchema } from "@senslop/contracts";
import type { FindingSchema } from "../schemas";
import { defaultUiPreferences } from "../../settings/constants";
import { FindingEvidence } from "../components/finding-evidence";

const state = vi.hoisted(() => ({
  ready: true,
  error: false,
  diff: undefined as FileDiffProps<undefined, undefined> | undefined,
}));
vi.mock("../../settings/hooks/use-ui-preferences", () => ({
  useUiPreferences: () => ({
    values: { ...defaultUiPreferences, view: "split" },
  }),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ systemTheme: "dark" }) }));
vi.mock("../../review/hooks/use-diff-highlighter", () => ({
  useDiffHighlighter: () => ({ ...state, retry: vi.fn() }),
}));
vi.mock("@pierre/diffs/react", () => ({
  FileDiff: (props: FileDiffProps<undefined, undefined>) => {
    state.diff = props;
    return (
      <div data-testid="editor">
        {props.renderCustomHeader?.(props.fileDiff)}
        {props.fileDiff.deletionLines.join("")}
        {props.fileDiff.additionLines.join("")}
      </div>
    );
  },
}));
afterEach(() => {
  cleanup();
  state.ready = true;
  state.error = false;
  state.diff = undefined;
});
const finding: FindingSchema = {
  severity: "high",
  title: "Bug",
  problem: "Breaks",
  path: "a.ts",
  side: "before",
  start: 2,
  end: 2,
  code: "input.value",
  fixPrompt: "Guard input",
};
const file: PreviewFileSchema = {
  path: "a.ts",
  oldPath: null,
  status: "M",
  before: "const input = null;\ninput.value\n",
  after: "const input = null;\ninput?.value\n",
  beforeHash: "a".repeat(64),
  afterHash: "b".repeat(64),
  binary: false,
  added: 1,
  deleted: 1,
  diff: "@@ -1,2 +1,2 @@\n const input = null;\n-input.value\n+input?.value\n",
};
test("evidence renders the actual patch as a stacked diff with a path-only linked header", async () => {
  const user = userEvent.setup();
  const navigate = vi.fn();
  const { rerender } = render(
    <FindingEvidence finding={finding} file={file} onEvidence={navigate} />,
  );
  expect(state.diff?.fileDiff.hunks[0]?.deletionStart).toBe(2);
  expect(
    state.diff?.fileDiff.hunks.reduce(
      (count, hunk) => count + hunk.deletionCount,
      0,
    ),
  ).toBe(1);
  expect(
    state.diff?.fileDiff.hunks.reduce(
      (count, hunk) => count + hunk.additionCount,
      0,
    ),
  ).toBe(1);
  expect(state.diff?.options?.hunkSeparators).toBe("simple");
  expect(state.diff?.options?.collapsedContextThreshold).toBe(0);
  expect(state.diff?.options?.diffStyle).toBe("unified");
  expect(state.diff?.options?.disableFileHeader).toBe(false);
  expect(state.diff?.selectedLines).toEqual({
    side: "deletions",
    start: 2,
    end: 2,
  });
  expect(screen.queryByText(/before,|after,/)).toBeNull();
  await user.click(screen.getByRole("button", { name: "a.ts" }));
  expect(navigate).toHaveBeenCalledWith(finding);
  rerender(<FindingEvidence finding={finding} file={file} />);
  expect(
    screen.getByRole("button", { name: "a.ts" }).hasAttribute("disabled"),
  ).toBe(true);
});
test("missing snapshot contents never invent a comparison from the evidence excerpt", () => {
  render(<FindingEvidence finding={finding} />);
  expect(screen.queryByTestId("editor")).toBeNull();
  expect(screen.getByText(/Diff unavailable/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "a.ts" })).toBeTruthy();
});
test("editor loading and failure preserve the evidence header", () => {
  state.ready = false;
  const { rerender } = render(
    <FindingEvidence finding={finding} file={file} />,
  );
  expect(screen.getByRole("status", { name: "Loading diff" })).toBeTruthy();
  state.error = true;
  rerender(<FindingEvidence finding={finding} file={file} />);
  expect(
    screen.getByRole("button", { name: "Retry loading diff" }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: /a.ts/ })).toBeTruthy();
});
