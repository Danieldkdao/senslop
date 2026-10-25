// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  FindingFilters,
  emptyFindingFilters,
} from "../components/finding-filters";

afterEach(cleanup);

test("repeated group titles from review history produce one filter option", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <FindingFilters
      values={emptyFindingFilters}
      onChange={vi.fn()}
      files={["a.ts", "a.ts"]}
      groups={["Startup", "Startup", "Settings"]}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Filter findings" }));
  await user.click(screen.getByRole("combobox", { name: "Group" }));
  expect(
    await screen.findAllByRole("option", { name: "Startup" }),
  ).toHaveLength(1);
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("combobox", { name: "File" }));
  expect(await screen.findAllByRole("option", { name: "a.ts" })).toHaveLength(
    1,
  );
  expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
});
