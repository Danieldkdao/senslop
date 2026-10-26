// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ReviewReportDialog } from "../components/review-report-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
const state = vi.hoisted(() => ({
  generate: vi.fn(),
  reads: [] as (string | null)[],
}));
vi.mock("../hooks/use-review-reports", () => ({
  useReviewReports: (
    reviewId: string,
    _open: boolean,
    reportId: string | null,
  ) => {
    state.reads.push(reportId);
    return {
      history: { data: { rounds: [1, 2, 3], reports: [] } },
      report: {
        data: reportId
          ? {
              id: reportId,
              review: { id: reviewId, round: 1, hash: "hash" },
              createdAt: new Date().toISOString(),
              reviewed: 0,
              total: 0,
              sections: [],
            }
          : null,
      },
      generate: { isPending: false, mutateAsync: state.generate },
    };
  },
  useReportEvidence: () => ({}),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.reads.length = 0;
});
test("switching reviews clears the selected report and re-sync updates the default round", async () => {
  state.generate.mockResolvedValue({ id: "old-report" });
  const renderDialog = (id: string, round: number) => (
    <TooltipProvider>
      <ReviewReportDialog review={{ id, round, hash: "a".repeat(64) }} />
    </TooltipProvider>
  );
  const view = render(renderDialog("first", 1));
  act(() => window.dispatchEvent(new Event("senslop-report")));
  fireEvent.click(
    await screen.findByRole("button", { name: "Generate report" }),
  );
  await waitFor(() => expect(state.reads.at(-1)).toBe("old-report"));
  view.rerender(renderDialog("second", 2));
  expect(state.reads.at(-1)).toBe(null);
  fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
  await waitFor(() =>
    expect(state.generate.mock.calls.at(-1)?.[0]).toMatchObject({ round: 2 }),
  );
  view.rerender(renderDialog("second", 3));
  fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
  await waitFor(() =>
    expect(state.generate.mock.calls.at(-1)?.[0]).toMatchObject({ round: 3 }),
  );
});
