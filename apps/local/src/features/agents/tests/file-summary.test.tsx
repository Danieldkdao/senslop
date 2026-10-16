// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { FileSummary } from "../components/file-summary";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test("summary expands inline and related source navigation preserves the selected snapshot", async () => {
  const onSelect = vi.fn();
  render(
    <FileSummary
      file={
        { path: "a.ts", before: "old", after: "new", binary: false } as never
      }
      grouping={{
        groups: [
          {
            title: "Behavior",
            rationale: "Data flows",
            files: [
              { path: "a.ts", summary: "Changed the guard", related: ["b.ts"] },
            ],
          },
        ],
      }}
      onSelect={onSelect}
    />,
  );
  expect(screen.getByText("Changed the guard")).toBeTruthy();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Summary" }));
  expect(screen.queryByText("Changed the guard")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Summary" }));
  expect(screen.getByText("Changed the guard")).toBeTruthy();
  await userEvent.setup().click(screen.getByRole("button", { name: "b.ts" }));
  expect(onSelect).toHaveBeenCalledWith("b.ts");
});

test("no summary produces no section", () => {
  const { container } = render(
    <FileSummary file={{ path: "missing.ts" } as never} onSelect={vi.fn()} />,
  );
  expect(container.textContent).toBe("");
});
