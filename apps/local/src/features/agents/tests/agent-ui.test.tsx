// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { GroupedFiles } from "../components/grouped-files";
import { ReviewResults } from "../components/review-results";
import type { LivePreview } from "../../review/types";
import type { JobSchema } from "../schemas";
vi.mock("../components/agent-markdown", () => ({
  AgentMarkdown: ({ children }: { children: string }) => <p>{children}</p>,
}));
vi.mock("@/components/file-icon", () => ({ FileIcon: () => <span /> }));
vi.mock("@/components/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
afterEach(cleanup);
const grouping = {
  groups: [
    {
      title: "Shared behavior",
      rationale: "Dependencies first",
      files: [
        { path: "a.ts", summary: "A", related: [] },
        { path: "b.ts", summary: "B", related: [] },
      ],
    },
  ],
};
const preview = {
  files: [
    { path: "a.ts", status: "M", added: 1, deleted: 1 },
    { path: "b.ts", status: "M", added: 1, deleted: 1 },
  ],
  completedPaths: ["a.ts"],
} as LivePreview;
test("group completion counts hidden members and undo removes the completed treatment", async () => {
  const props = {
    grouping,
    preview,
    search: "a.ts",
    selectedPath: "a.ts",
    onSelect: vi.fn(),
  };
  const { rerender } = render(<GroupedFiles {...props} />);
  expect(
    screen.getByRole("button", { name: /Shared behavior/ }).textContent,
  ).toContain("1/2");
  expect(screen.queryByText("Group reviewed")).toBeNull();
  rerender(
    <GroupedFiles
      {...props}
      preview={{ ...preview, completedPaths: ["a.ts", "b.ts"] }}
    />,
  );
  expect(screen.getByText("Group reviewed")).toBeTruthy();
  rerender(<GroupedFiles {...props} />);
  expect(screen.queryByText("Group reviewed")).toBeNull();
});
test("saved review findings navigate to their exact evidence and expose copyable fixes", async () => {
  const onEvidence = vi.fn();
  const result = {
    findings: [
      {
        severity: "high",
        title: "Missing guard",
        problem: "Null input throws",
        rationale: "Caller passes null",
        path: "a.ts",
        side: "after",
        start: 2,
        end: 2,
        code: "value.name",
        fixPrompt: "Add a guard",
      },
    ],
    limitations: ["Missing external declarations"],
  };
  render(
    <ReviewResults
      job={
        { id: "job", snapshotId: "snapshot", result } as unknown as JobSchema
      }
      onEvidence={onEvidence}
    />,
  );
  expect(screen.getByText("High")).toBeTruthy();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Missing guard" }));
  await user.click(screen.getByRole("button", { name: /a.ts/ }));
  expect(onEvidence).toHaveBeenCalledWith(
    expect.objectContaining({ path: "a.ts", start: 2 }),
  );
  expect(screen.getByRole("button", { name: "Fix with AI" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Fix all with AI" })).toBeTruthy();
});

test("completed groups start collapsed even when their selected file is inside the group", async () => {
  render(
    <GroupedFiles
      grouping={grouping}
      preview={{ ...preview, completedPaths: ["a.ts", "b.ts"] }}
      selectedPath="b.ts"
      search=""
      onSelect={vi.fn()}
    />,
  );
  const trigger = screen.getByRole("button", { name: /Shared behavior/ });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  await userEvent.setup().click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByRole("button", { name: /b.ts: Completed/ })).toBeTruthy();
});

test("finishing the last file auto collapses a group, including after a manual reopen and undo", async () => {
  const props = {
    grouping,
    preview,
    selectedPath: "b.ts",
    search: "",
    onSelect: vi.fn(),
  };
  const mounted = render(<GroupedFiles {...props} />);
  const trigger = () => screen.getByRole("button", { name: /Shared behavior/ });
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  const done = { ...preview, completedPaths: ["a.ts", "b.ts"] };
  mounted.rerender(<GroupedFiles {...props} preview={done} />);
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  const user = userEvent.setup();
  await user.click(trigger());
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  mounted.rerender(<GroupedFiles {...props} preview={{ ...done }} />);
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  mounted.rerender(<GroupedFiles {...props} />);
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  mounted.rerender(<GroupedFiles {...props} preview={done} />);
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  mounted.rerender(<GroupedFiles {...props} preview={done} search="b.ts" />);
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  mounted.rerender(<GroupedFiles {...props} preview={done} search="" />);
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
});

test("file navigation reveals a manually collapsed group without reopening it on unrelated updates", async () => {
  const props = {
    grouping,
    preview,
    selectedPath: "a.ts",
    search: "",
    onSelect: vi.fn(),
  };
  const mounted = render(<GroupedFiles {...props} />);
  const trigger = () => screen.getByRole("button", { name: /Shared behavior/ });
  await userEvent.setup().click(trigger());
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  mounted.rerender(<GroupedFiles {...props} preview={{ ...preview }} />);
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  mounted.rerender(<GroupedFiles {...props} selectedPath="b.ts" />);
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
});

test("only the selected unfinished group opens initially and other groups can stay manually open", async () => {
  const groups = {
    groups: [
      ...grouping.groups,
      {
        title: "Later",
        rationale: "Later work",
        files: [{ path: "c.ts", summary: "C", related: [] }],
      },
    ],
  };
  const props = {
    grouping: groups,
    preview: {
      ...preview,
      files: [...preview.files, { ...preview.files[0]!, path: "c.ts" }],
    },
    selectedPath: "a.ts",
    search: "",
    onSelect: vi.fn(),
  };
  const view = render(<GroupedFiles {...props} />);
  const current = () => screen.getByRole("button", { name: /Shared behavior/ });
  const later = () => screen.getByRole("button", { name: /Later/ });
  expect(current().getAttribute("aria-expanded")).toBe("true");
  expect(later().getAttribute("aria-expanded")).toBe("false");
  await userEvent.setup().click(later());
  view.rerender(<GroupedFiles {...props} selectedPath="c.ts" />);
  expect(current().getAttribute("aria-expanded")).toBe("true");
  expect(later().getAttribute("aria-expanded")).toBe("true");
});
