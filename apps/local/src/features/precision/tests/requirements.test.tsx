// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RequirementsView } from "../components/requirements-view";
import type { ReviewBriefSchema } from "@senslop/contracts";

afterEach(cleanup);
const brief: ReviewBriefSchema = {
  version: 2,
  review: { id: "review", hash: "a".repeat(64), round: 1 },
  request: "Add keyboard support",
  documents: [],
  links: [],
  createdAt: new Date().toISOString(),
  criteria: [
    {
      id: "keys",
      text: "Keyboard navigation works",
      sourceQuote: "keyboard support",
      checkIds: [],
    },
  ],
};

test("missing behavior is distinct from verified behavior and evidence opens its frozen location", () => {
  const onEvidence = vi.fn();
  render(
    <RequirementsView
      brief={brief}
      coverage={{
        criteria: [
          {
            criterionId: "keys",
            status: "missing",
            explanation: "Arrow handler absent",
            evidence: [
              {
                path: "tabs.tsx",
                side: "after",
                start: 4,
                end: 4,
                code: "button",
              },
            ],
            questions: [],
            checkIds: [],
          },
        ],
        unexpectedChanges: [],
        limitations: [],
      }}
      stale={false}
      onEvidence={onEvidence}
      onEdit={vi.fn()}
    />,
  );
  expect(screen.getAllByText("Missing").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: /tabs.tsx/ }));
  expect(onEvidence).toHaveBeenCalledWith(
    expect.objectContaining({ path: "tabs.tsx", start: 4, side: "after" }),
  );
});

test("editing a brief makes the previous conclusions visibly outdated", () => {
  render(
    <RequirementsView
      brief={brief}
      stale
      coverage={{ criteria: [], unexpectedChanges: [], limitations: [] }}
      onEvidence={vi.fn()}
      onEdit={vi.fn()}
    />,
  );
  expect(screen.getByRole("status")).toBeTruthy();
  expect(screen.queryByText("Verified")).toBeNull();
});
