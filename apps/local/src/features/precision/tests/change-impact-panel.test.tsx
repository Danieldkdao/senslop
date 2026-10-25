// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChangeImpactPanel } from "../components/change-impact-panel";

afterEach(cleanup);

test("impact expansion retains its trigger and content without an unrelated header action", () => {
  render(
    <ChangeImpactPanel
      symbols={[]}
      capability={{
        language: "Other",
        level: "text",
        tool: null,
        limitations: [],
      }}
      onNavigate={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Language capabilities" }),
  ).toBeNull();
  const trigger = screen.getByRole("button", { name: "Impact" });
  fireEvent.click(trigger);
  expect(screen.getByRole("button", { name: "Impact" })).toBe(trigger);
  expect(screen.getByText(/No specific attention reason/)).toBeTruthy();
  expect(document.querySelector("details, summary")).toBeNull();
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});
