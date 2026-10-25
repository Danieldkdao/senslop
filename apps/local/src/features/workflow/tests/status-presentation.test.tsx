// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  checkStatuses,
  workflowJobStatuses,
  type CheckRunSchema,
  type VerificationRunSchema,
} from "@senslop/contracts";
import { formatCheckStatus, formatWorkflowJobStatus } from "../lib/formatters";
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
  (state) => {
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
  },
);
