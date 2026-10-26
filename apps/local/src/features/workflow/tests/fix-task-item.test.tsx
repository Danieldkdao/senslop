// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { fixTaskSchema } from "@senslop/contracts";
import { FixTaskItem } from "../components/fix-task-item";

vi.mock("../hooks/use-fix-task-prompt", () => ({
  useFixTaskPrompt: () => ({}),
}));
vi.mock("../components/change-inspector", () => ({
  ChangeInspector: ({
    open,
    children,
  }: {
    open: boolean;
    children: ReactNode;
  }) => (open ? <div role="dialog">{children}</div> : null),
}));
afterEach(cleanup);

test("applying returned files stays visibly busy and prevents duplicate submissions", async () => {
  let finish!: () => void;
  const onAction = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const task = fixTaskSchema.parse({
    id: "00000000-0000-4000-8000-000000000001",
    review: {
      id: "00000000-0000-4000-8000-000000000002",
      hash: "a".repeat(64),
      round: 1,
    },
    title: "Fix startup",
    findingIds: ["00000000-0000-4000-8000-000000000003"],
    noteIds: [],
    constraints: "",
    checks: [],
    status: "returned",
    agent: "Codex",
    workspaceKind: "managed",
    directory: "/managed",
    manifestId: null,
    changes: [
      {
        path: "app.ts",
        before: "before",
        after: "after",
        outsideRequestedFiles: false,
      },
    ],
    activity: [],
    createdAt: "2026-10-26T00:00:00Z",
    updatedAt: "2026-10-26T00:00:00Z",
  });
  const user = userEvent.setup();
  render(<FixTaskItem task={task} onAction={onAction} />);
  await user.click(screen.getByRole("button", { name: "Fix startup" }));
  await user.click(screen.getByRole("button", { name: "Review changes" }));
  const apply = screen.getByRole("button", { name: "Apply selected files" });
  await user.click(apply);
  expect(apply.hasAttribute("disabled")).toBe(true);
  expect(apply.getAttribute("aria-busy")).toBe("true");
  fireEvent.click(apply);
  expect(onAction).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
