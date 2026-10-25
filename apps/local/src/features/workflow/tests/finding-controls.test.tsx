// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { trackedFindingSchema } from "@senslop/contracts";
import { FindingControls } from "../components/finding-controls";
afterEach(cleanup);
test("dismissal and resolution save immediately without requiring a reason", async () => {
  const act = vi.fn().mockResolvedValue(null);
  const finding = trackedFindingSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    reviewId: "22222222-2222-4222-8222-222222222222",
    decision: "open",
    observations: [],
    history: [],
  });
  render(<FindingControls finding={finding} onAction={act} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Finding decision" }));
  await user.click(await screen.findByRole("option", { name: "Dismissed" }));
  expect(act).toHaveBeenCalledWith({
    action: "decision",
    findingId: finding.id,
    decision: "dismissed",
  });
  expect(screen.queryByRole("textbox")).toBeNull();
});

test("manual verification accepts an empty optional note", async () => {
  const act = vi.fn().mockResolvedValue({});
  const finding = trackedFindingSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    reviewId: "22222222-2222-4222-8222-222222222222",
    decision: "open",
    observations: [],
    history: [],
  });
  render(<FindingControls finding={finding} onAction={act} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Manual verification" }));
  await user.click(screen.getByRole("button", { name: "Save verification" }));
  expect(act).toHaveBeenCalledWith({
    action: "assess",
    findingId: finding.id,
    outcome: "unverified",
    explanation: "Manually assessed",
    checkIds: [],
  });
});

test("finding activity formats decisions and assessments with their status icons", async () => {
  const finding = trackedFindingSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    reviewId: "22222222-2222-4222-8222-222222222222",
    decision: "resolved",
    observations: [],
    history: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        kind: "decision",
        label: "resolved",
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        kind: "assessment",
        label: "apparently-fixed",
      },
    ].map((event) => ({
      ...event,
      review: {
        id: "22222222-2222-4222-8222-222222222222",
        hash: "a".repeat(64),
        round: 1,
      },
      createdAt: "2026-10-25T00:00:00Z",
    })),
  });
  render(<FindingControls finding={finding} onAction={vi.fn()} />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Activity (2)" }));
  for (const label of ["Resolved", "Apparently fixed"])
    expect(
      (await within(screen.getByRole("list")).findByText(label))
        .closest("li")
        ?.querySelector("svg"),
    ).toBeTruthy();
  expect(screen.queryByText("apparently-fixed")).toBeNull();
});
