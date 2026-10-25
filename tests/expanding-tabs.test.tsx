// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  ExpandingTabs,
  ExpandingTabsPanel,
} from "../packages/ui/src/components/expanding-tabs";

afterEach(cleanup);

const items = [
  { value: "flows", label: "Flows", icon: <svg />, detail: "2/5" },
  { value: "files", label: "Files", icon: <svg />, detail: "1/3" },
  { value: "blocked", label: "Blocked", icon: <svg />, disabled: true },
];

test("expands only the selected tab and associates accessible panels", async () => {
  render(
    <ExpandingTabs items={items} aria-label="Review organization">
      <ExpandingTabsPanel value="flows">Flow content</ExpandingTabsPanel>
      <ExpandingTabsPanel value="files">File content</ExpandingTabsPanel>
    </ExpandingTabs>,
  );
  const flows = screen.getByRole("tab", { name: "Flows" });
  const files = screen.getByRole("tab", { name: "Files" });
  expect(flows.getAttribute("aria-selected")).toBe("true");
  expect(flows.dataset.expanded).toBe("true");
  expect(files.dataset.expanded).toBe("false");
  fireEvent.click(files);
  await waitFor(() =>
    expect(screen.getByRole("tabpanel").textContent).toBe("File content"),
  );
  expect(files.dataset.expanded).toBe("true");
  expect(flows.dataset.expanded).toBe("false");
  expect(files.getAttribute("aria-controls")).toBe(
    screen.getByRole("tabpanel").id,
  );
});

test("controlled selection reports intent without overriding the caller", () => {
  const onValueChange = vi.fn();
  const view = render(
    <ExpandingTabs items={items} value="flows" onValueChange={onValueChange} />,
  );
  fireEvent.click(screen.getByRole("tab", { name: "Files" }));
  expect(onValueChange).toHaveBeenCalledWith("files");
  expect(screen.getByRole("tab", { name: "Flows" }).dataset.expanded).toBe(
    "true",
  );
  view.rerender(
    <ExpandingTabs items={items} value="files" onValueChange={onValueChange} />,
  );
  expect(screen.getByRole("tab", { name: "Files" }).dataset.expanded).toBe(
    "true",
  );
});

test("keyboard navigation skips disabled tabs and does not leak to review shortcuts", async () => {
  const onKeyDown = vi.fn();
  render(
    <div onKeyDown={onKeyDown}>
      <ExpandingTabs items={items} />
    </div>,
  );
  const flows = screen.getByRole("tab", { name: "Flows" });
  flows.focus();
  fireEvent.keyDown(flows, { key: "ArrowRight" });
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Files" }),
    ),
  );
  expect(onKeyDown).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "Blocked" }));
  expect(
    screen.getByRole("tab", { name: "Blocked" }).getAttribute("aria-selected"),
  ).toBe("false");
});
