// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReviewQuality } from "../components/review-quality";
import type { EvaluationRunSchema } from "../schemas";

vi.mock("../hooks/use-review-quality", () => ({
  useReviewQuality: () => ({
    state: { data: [report] },
    run: { isPending: false, mutate: vi.fn() },
    cancel: vi.fn(),
  }),
}));
const report: EvaluationRunSchema = {
  id: "767468cc-63d2-4a54-9484-f35f16a2d5c7",
  corpusVersion: "1",
  mode: "deterministic",
  model: null,
  createdAt: "2026-10-25T12:00:00Z",
  durationMs: 10,
  totals: {
    truePositives: 1,
    falsePositives: 0,
    duplicates: 0,
    missed: 0,
    evidenceAccuracy: 1,
    inputTokens: null,
    outputTokens: null,
    estimatedCost: null,
  },
  limitations: [
    "Contract checks and fixture examples only.",
    "Quality promotion thresholds are not established.",
  ],
  cases: [
    {
      caseId: "missing-null-guard",
      scenario: "Missing guard",
      provenance: "Synthetic example",
      expectedIssues: 1,
      truePositives: 1,
      falsePositives: 0,
      duplicates: 0,
      missed: 0,
      precision: 1,
      recall: 1,
      evidenceAccuracy: 1,
      durationMs: 10,
      inputTokens: null,
      outputTokens: null,
      estimatedCost: null,
      contractPassed: true,
      groupingCoverage: 1,
      findings: [],
      expected: ["Guard the input"],
      limitations: [],
    },
  ],
};
afterEach(cleanup);

test("fixture results start collapsed and each case remains independently expandable", async () => {
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <ReviewQuality />
    </TooltipProvider>,
  );
  expect(screen.queryByText("missing-null-guard")).toBeNull();
  await user.click(screen.getByRole("button", { name: /Fixture results/ }));
  expect(screen.getByText("missing-null-guard")).toBeTruthy();
  expect(screen.queryByText("Synthetic example")).toBeNull();
  await user.click(screen.getByRole("button", { name: /missing-null-guard/ }));
  expect(screen.getByText("Synthetic example")).toBeTruthy();
  expect(screen.getByText("Guard the input")).toBeTruthy();
});
