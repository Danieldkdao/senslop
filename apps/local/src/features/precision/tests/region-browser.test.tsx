// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RegionBrowser } from "../components/region-browser";
import type { OrganizationSchema } from "@senslop/contracts";

afterEach(cleanup);
const organization: OrganizationSchema = {
  version: 0,
  manual: false,
  units: [
    {
      id: "folder",
      path: "toolbar.ts",
      fingerprint: "a",
      label: "Folder tracking",
      ranges: [{ side: "after", start: 1, end: 2, code: "folder" }],
      kind: "text",
      reviewed: true,
      moved: false,
      needsReview: false,
    },
    {
      id: "hotkey",
      path: "toolbar.ts",
      fingerprint: "b",
      label: "Hotkeys",
      ranges: [{ side: "after", start: 20, end: 21, code: "hotkey" }],
      kind: "text",
      reviewed: false,
      moved: false,
      needsReview: false,
    },
  ],
  flows: [
    { id: "one", title: "Track folders", rationale: "", unitIds: ["folder"] },
    {
      id: "two",
      title: "Keyboard navigation",
      rationale: "",
      unitIds: ["hotkey"],
    },
  ],
};

test("one file appears in two flows with independent region completion", () => {
  const onSelect = vi.fn();
  render(
    <RegionBrowser
      organization={organization}
      selectedUnitId="folder"
      onSelect={onSelect}
      onAction={vi.fn(async () => null)}
    />,
  );
  expect(screen.getByRole("tab", { name: "Flows" }).dataset.expanded).toBe(
    "true",
  );
  expect(screen.queryByRole("button", { name: /Hotkeys/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Keyboard navigation/ }));
  fireEvent.click(screen.getByRole("button", { name: /Hotkeys/ }));
  expect(onSelect).toHaveBeenCalledWith("hotkey");
  fireEvent.click(screen.getByRole("tab", { name: "Files" }));
  expect(screen.getByRole("tab", { name: "Files" }).dataset.expanded).toBe(
    "true",
  );
  expect(screen.getByText("1/2 regions")).toBeTruthy();
});

test("only the selected flow starts open and manual expansion survives navigation", () => {
  const props = {
    organization,
    onSelect: vi.fn(),
    onAction: vi.fn(async () => null),
  };
  const view = render(<RegionBrowser {...props} selectedUnitId="folder" />);
  expect(
    screen
      .getByRole("button", { name: /Track folders/ })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(
    screen
      .getByRole("button", { name: /Keyboard navigation/ })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: /Keyboard navigation/ }));
  expect(
    screen
      .getByRole("button", { name: /Track folders/ })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  view.rerender(<RegionBrowser {...props} selectedUnitId="hotkey" />);
  expect(
    screen
      .getByRole("button", { name: /Track folders/ })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: /Keyboard navigation/ }));
  expect(
    screen
      .getByRole("button", { name: /Keyboard navigation/ })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  view.rerender(<RegionBrowser {...props} selectedUnitId="folder" />);
  view.rerender(<RegionBrowser {...props} selectedUnitId="hotkey" />);
  expect(
    screen
      .getByRole("button", { name: /Keyboard navigation/ })
      .getAttribute("aria-expanded"),
  ).toBe("true");
});

test("Files reveals the selected path and permits multiple files to stay expanded", () => {
  const anotherFile = {
    ...organization.units[1]!,
    id: "other",
    path: "other.ts",
  };
  const expandedOrganization = {
    ...organization,
    units: [...organization.units, anotherFile],
    flows: [
      ...organization.flows,
      { id: "other-flow", title: "Other", rationale: "", unitIds: ["other"] },
    ],
  };
  const props = {
    organization: expandedOrganization,
    onSelect: vi.fn(),
    onAction: vi.fn(async () => null),
  };
  const view = render(<RegionBrowser {...props} selectedUnitId="folder" />);
  fireEvent.click(screen.getByRole("tab", { name: "Files" }));
  const current = () =>
    screen.getByRole("button", { name: /toolbar.ts.*regions/ });
  const other = () => screen.getByRole("button", { name: /other.ts.*regions/ });
  expect(current().getAttribute("aria-expanded")).toBe("true");
  expect(other().getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(other());
  view.rerender(<RegionBrowser {...props} selectedUnitId="other" />);
  expect(current().getAttribute("aria-expanded")).toBe("true");
  expect(other().getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(other());
  expect(other().getAttribute("aria-expanded")).toBe("false");
});
