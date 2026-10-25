// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
