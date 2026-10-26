// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import {
  checkStatuses,
  workflowJobStatuses,
  findingDecisions,
  verificationOutcomes,
  fixTaskStatuses,
  type CheckRunSchema,
  type VerificationRunSchema,
} from "@senslop/contracts";
import {
  formatCheckStatus,
  formatWorkflowJobStatus,
  formatFindingDecision,
  formatVerificationOutcome,
  formatFixTaskStatus,
} from "../lib/formatters";
import { CheckResults } from "../components/check-results";
import { VerificationResults } from "../components/verification-results";
import { FixTaskItem } from "../components/fix-task-item";
import { fixTaskSchema } from "@senslop/contracts";
import userEvent from "@testing-library/user-event";
import { defaultUiPreferences } from "../../settings/constants";

vi.mock("../hooks/use-fix-task-prompt", () => ({
  useFixTaskPrompt: () => ({}),
}));
vi.mock("../../settings/hooks/use-ui-preferences", () => ({
  useUiPreferences: () => ({ values: defaultUiPreferences }),
}));

afterEach(cleanup);

test("removing history asks for confirmation and sends the selected item only", async () => {
  const onAction = vi.fn().mockResolvedValue({ removed: 1 });
  const check = {
    id: "check",
    command: "node --version",
    status: "passed",
    review: { id: "review", hash: "hash", round: 1 },
    output: "v24",
    artifacts: [],
    environment: {},
  } as unknown as CheckRunSchema;
  const user = userEvent.setup();
  render(<CheckResults checks={[check]} onAction={onAction} />);
  await user.click(screen.getByRole("button", { name: "Remove from history" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(onAction).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Remove from history" }));
  await user.click(screen.getByRole("button", { name: "Confirm" }));
  expect(onAction).toHaveBeenCalledExactlyOnceWith({
    action: "remove-history",
    kind: "checks",
    id: "check",
  });
});

test("verification findings disclose their own assessment and evidence", async () => {
  const run = {
    id: "verification",
    status: "completed",
    review: { id: "review", hash: "hash", round: 1 },
    createdAt: "2026-10-25T00:00:00Z",
    findingIds: ["finding"],
    assessments: [
      {
        findingId: "finding",
        outcome: "present",
        explanation: "The unsafe access remains.",
      },
    ],
  } as unknown as VerificationRunSchema;
  const findings = [
    {
      id: "finding",
      observations: [{ evidence: { title: "Guard null input" } }],
    },
  ] as unknown as import("@senslop/contracts").TrackedFindingSchema[];
  const user = userEvent.setup();
  render(
    <VerificationResults runs={[run]} findings={findings} onAction={vi.fn()} />,
  );
  await user.click(
    screen.getByRole("button", { name: "Round 1, 1/1 assessed" }),
  );
  const finding = screen.getByRole("button", { name: "Guard null input" });
  expect(finding.getAttribute("aria-expanded")).toBe("false");
  await user.click(finding);
  expect(screen.getByText("Still present")).toBeTruthy();
  const evidence = screen.getByRole("button", { name: "Reasoning & evidence" });
  expect(evidence.getAttribute("aria-expanded")).toBe("false");
  await user.click(evidence);
  expect(screen.getByText("The unsafe access remains.")).toBeTruthy();
});

test("task activity formats recorded status values and displays icons", async () => {
  const task = fixTaskSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    review: {
      id: "22222222-2222-4222-8222-222222222222",
      hash: "a".repeat(64),
      round: 1,
    },
    title: "Fixture task",
    findingIds: ["33333333-3333-4333-8333-333333333333"],
    noteIds: [],
    constraints: "",
    checks: [],
    status: "canceled",
    agent: null,
    workspaceKind: "managed",
    directory: null,
    manifestId: null,
    changes: [],
    activity: [{ label: "returned", createdAt: "2026-10-25T00:00:00Z" }],
    createdAt: "2026-10-25T00:00:00Z",
    updatedAt: "2026-10-25T00:00:00Z",
  });
  render(<FixTaskItem task={task} onAction={vi.fn()} />);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Fixture task" }));
  expect(
    (await screen.findByText("Changes returned"))
      .closest("li")
      ?.querySelector("svg"),
  ).toBeTruthy();
});

test("check and verification formatters explicitly identify spinning states", () => {
  for (const status of findingDecisions)
    expect(formatFindingDecision(status)).toHaveProperty("loading", false);
  for (const status of verificationOutcomes)
    expect(formatVerificationOutcome(status)).toHaveProperty("loading", false);
  for (const status of fixTaskStatuses)
    expect(formatFixTaskStatus(status)).toHaveProperty(
      "loading",
      status === "in-progress",
    );
  for (const status of checkStatuses)
    expect(formatCheckStatus(status)).toHaveProperty(
      "loading",
      status === "running",
    );
  for (const status of workflowJobStatuses)
    expect(formatWorkflowJobStatus(status)).toHaveProperty(
      "loading",
      status === "running",
    );
});

test.each(["running", "completed"] as const)(
  "check and verification icons animate only while running: %s",
  async (state) => {
    const check = {
      id: "check",
      command: "node --version",
      status: state === "completed" ? "passed" : state,
      output: "",
      environment: {},
      review: { id: "review", hash: "hash", round: 1 },
      artifactPaths: [],
      artifacts: [],
    } as unknown as CheckRunSchema;
    const verification = {
      id: "verification",
      status: state,
      review: check.review,
      findingIds: ["finding"],
      assessments: [],
    } as unknown as VerificationRunSchema;
    render(
      <>
        <CheckResults checks={[check]} onAction={vi.fn()} />
        <VerificationResults runs={[verification]} onAction={vi.fn()} />
      </>,
    );
    for (const status of screen.getAllByRole("status"))
      expect(
        status.querySelector("svg")?.classList.contains("animate-spin"),
      ).toBe(state === "running");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Round 1, 0/1 assessed" }));
    const finding = screen.getByRole("button", { name: "Finding assessment" });
    expect(
      finding.querySelector("svg")?.classList.contains("animate-spin"),
    ).toBe(state === "running");
  },
);

test.each(["", "first line\nsecond line"])(
  "check output controls reflect available output: %j",
  async (output) => {
    const check = {
      id: "check",
      command: "pnpm test",
      status: "passed",
      sourceSide: "changed",
      exitCode: 0,
      durationMs: 100,
      error: "Fixture execution error",
      output,
      environment: {},
      review: { id: "review", hash: "hash", round: 1 },
      artifacts: [],
    } as unknown as CheckRunSchema;
    const user = userEvent.setup();
    render(<CheckResults checks={[check]} onAction={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "pnpm test" }));
    const outputTrigger = screen.getByRole("button", { name: "Output" });
    expect(outputTrigger.getAttribute("aria-expanded")).toBe("true");
    for (const name of ["Error details", "Environment & inputs"])
      expect(
        screen.getByRole("button", { name }).getAttribute("aria-expanded"),
      ).toBe("false");
    await user.click(outputTrigger);
    expect(outputTrigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(outputTrigger);
    expect(outputTrigger.getAttribute("aria-expanded")).toBe("true");
    const download = screen.getByRole("button", { name: "Download output" });
    expect((download as HTMLButtonElement).disabled).toBe(!output);
    const stats = screen.getByText("Exit 0").parentElement!;
    expect(within(stats).getByRole("button", { name: "Download output" })).toBe(
      download,
    );
    expect(
      within(stats).getByRole("button", { name: "Copy check output" }),
    ).toBeTruthy();
    if (!output) {
      expect(
        screen.queryByRole("textbox", { name: "Search check output" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Follow output" }),
      ).toBeNull();
      expect(screen.getByLabelText("Check output").textContent).toBe(
        "No output captured.",
      );
      return;
    }
    await user.type(
      screen.getByRole("textbox", { name: "Search check output" }),
      "second",
    );
    expect(screen.getByLabelText("Check output").textContent).toBe(
      "second line",
    );
  },
);
