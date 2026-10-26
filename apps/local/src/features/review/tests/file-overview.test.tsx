// @vitest-environment jsdom

import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileOverview } from "../components/file-overview";
import { FileSummary } from "../../agents/components/file-summary";
import { ChangeImpactPanel } from "../../precision/components/change-impact-panel";

afterEach(cleanup);

test("one file overview contains ordered sections and preserves source navigation", async () => {
  const onSelect = vi.fn();
  const onNavigate = vi.fn();
  const user = userEvent.setup();
  render(
    <FileOverview>
      <FileSummary
        file={{
          path: "a.ts",
          oldPath: null,
          status: "M",
          before: "old",
          after: "new",
          beforeHash: null,
          afterHash: null,
          binary: false,
          diff: "",
          added: 1,
          deleted: 1,
        }}
        grouping={{
          groups: [
            {
              title: "Behavior",
              rationale: "Data flows",
              files: [
                {
                  path: "a.ts",
                  summary: "Changed the guard",
                  related: ["b.ts"],
                },
              ],
            },
          ],
        }}
        onSelect={onSelect}
      />
      <ChangeImpactPanel
        symbols={[
          {
            name: "guard",
            path: "a.ts",
            start: 2,
            end: 4,
            kind: "function",
            type: "() => boolean",
            references: [],
          },
        ]}
        onNavigate={onNavigate}
      />
    </FileOverview>,
  );
  const overview = screen.getByRole("region", { name: "File overview" });
  expect(
    within(overview)
      .getAllByRole("button")
      .map((button) => button.textContent)
      .filter((label) =>
        ["Summary", "Impact", "Symbols in this file"].includes(label ?? ""),
      ),
  ).toEqual(["Summary", "Impact", "Symbols in this file"]);
  await user.click(screen.getByRole("button", { name: "b.ts" }));
  expect(onSelect).toHaveBeenCalledWith("b.ts");
  await user.click(
    screen.getByRole("button", { name: "Symbols in this file" }),
  );
  await user.click(screen.getByRole("button", { name: "guard" }));
  await user.click(screen.getByRole("button", { name: "Definition" }));
  expect(onNavigate).toHaveBeenCalledWith({
    path: "a.ts",
    side: "after",
    start: 2,
    end: 4,
  });
  const trigger = screen.getByRole("button", { name: "File overview" });
  await user.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("button", { name: "Summary" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Impact" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Symbols in this file" }),
  ).toBeNull();
  await user.click(trigger);
  expect(screen.getByText("Changed the guard")).toBeTruthy();
});
