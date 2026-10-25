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

afterEach(cleanup);

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
