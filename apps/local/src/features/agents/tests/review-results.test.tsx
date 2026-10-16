// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { JobSchema } from "../schemas";
import { ReviewResults } from "../components/review-results";

vi.mock("../components/agent-markdown", () => ({
  AgentMarkdown: ({ children }: { children: string }) => <p>{children}</p>,
}));
afterEach(cleanup);
const finding = {
  severity: "high" as const,
  title: "Missing guard",
  problem: "An empty input causes a crash.",
  rationale: "The caller passes an empty input.",
  path: "a.ts",
  side: "after" as const,
  start: 2,
  end: 2,
  code: "input.value",
  fixPrompt: "Guard the input.",
};
const job = {
  snapshotId: "snapshot",
  result: {
    findings: [finding, { ...finding, title: "Other issue", path: "b.ts" }],
    limitations: ["Compiler diagnostics were unavailable."],
    fixAllPrompt: "Verify fixes.",
  },
} as JobSchema;

test("findings expand independently and keep evidence actions out of the title trigger", async () => {
  const evidence = vi.fn();
  render(<ReviewResults job={job} onEvidence={evidence} />);
  const user = userEvent.setup();
  const first = screen.getByRole("button", { name: "Missing guard" });
  const second = screen.getByRole("button", { name: "Other issue" });
  expect(first.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText(finding.problem)).toBeNull();
  await user.click(first);
  expect(first.getAttribute("aria-expanded")).toBe("true");
  expect(second.getAttribute("aria-expanded")).toBe("false");
  expect(screen.getByText(finding.problem)).toBeTruthy();
  expect(screen.getByText(finding.rationale)).toBeTruthy();
  expect(screen.getByText(finding.code)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /a.ts/ }));
  expect(evidence).toHaveBeenCalledWith(finding);
  await user.keyboard("{Tab}");
  await user.click(first);
  expect(screen.queryByText(finding.problem)).toBeNull();
});

test("analysis limitations start collapsed and can be toggled without opening findings", async () => {
  render(<ReviewResults job={job} onEvidence={vi.fn()} />);
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: /Analysis limitations/i });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(
    screen.queryByText(
      job.result && "limitations" in job.result
        ? job.result.limitations[0]!
        : "",
    ),
  ).toBeNull();
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(
    screen.getByText("Compiler diagnostics were unavailable."),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Missing guard" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  await user.click(trigger);
  expect(
    screen.queryByText("Compiler diagnostics were unavailable."),
  ).toBeNull();
  expect(screen.queryByText(/reviewed-file checklist/)).toBeNull();
});
