import { setTimeout as sleep } from "node:timers/promises";
import {
  findingDecisions,
  verificationOutcomes,
  type ReviewIdentitySchema,
  type FixTaskSchema,
  type CheckRunSchema,
  type TrackedFindingSchema,
} from "@senslop/contracts";
import { readReview } from "../reviews/requests.js";
import type { WorkspaceClient } from "../workspace/workspace-client.js";
import type { ParsedCliCommand } from "../commands/types.js";
import { CliError } from "../commands/errors.js";
import {
  stringOption,
  integerOption,
  confirmDestructive,
} from "../commands/input.js";

const ids = (value: string | undefined) =>
  value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
const expected = (command: ParsedCliCommand, review: ReviewIdentitySchema) => {
  const hash = stringOption(command.values, "expected-hash");
  if (
    hash &&
    (hash !== review.hash ||
      integerOption(command.values, "expected-round", 1, 1) !== review.round)
  )
    throw new CliError(
      "Review contents changed. Reload and reassess.",
      "review_conflict",
      6,
    );
  return { id: review.id, hash: review.hash, round: review.round };
};
export const executeWorkflowCommand = async (
  client: WorkspaceClient,
  command: ParsedCliCommand,
): Promise<unknown> => {
  const { name, args, values } = command;
  const id = args[0]!;
  const write = (review: ReviewIdentitySchema, operation: object) =>
    client.request("/api/workflow", {
      review: expected(command, review),
      operation,
    });
  if (
    name.startsWith("tasks ") &&
    name !== "tasks list" &&
    name !== "tasks create"
  ) {
    const { task, prompt } = await client.request<{
      task: FixTaskSchema;
      prompt: string;
    }>(
      `/api/workflow?taskId=${encodeURIComponent(id)}${name === "tasks export" ? "&prompt=1" : ""}`,
    );
    if (name === "tasks show") return task;
    if (name === "tasks export") return values.json ? { task, prompt } : prompt;
    if (name === "tasks apply") {
      await confirmDestructive(
        values,
        "Apply the selected task files to the original worktree?",
      );
      return write(task.review, {
        action: "apply-task",
        taskId: id,
        paths: ids(stringOption(values, "paths")),
      });
    }
    if (name === "tasks claim")
      return write(task.review, {
        action: "claim-task",
        taskId: id,
        agent: stringOption(values, "agent-name") ?? "External agent",
      });
    if (name === "tasks return")
      return write(task.review, { action: "return-task", taskId: id });
    if (name === "tasks cancel")
      return write(task.review, { action: "cancel-task", taskId: id });
    if (name === "tasks fail")
      return write(task.review, {
        action: "fail-task",
        taskId: id,
        message: stringOption(values, "reason") ?? "Agent reported failure",
      });
    if (name === "tasks reviewed")
      return write(task.review, { action: "review-task", taskId: id });
  }
  if (["checks show", "checks watch", "checks cancel"].includes(name)) {
    const read = (signal?: AbortSignal) =>
      client.request<CheckRunSchema>(
        `/api/workflow?checkId=${encodeURIComponent(id)}`,
        undefined,
        "GET",
        signal,
      );
    const run = await read();
    if (name === "checks cancel")
      return write(run.review, { action: "cancel-check", checkId: id });
    if (name === "checks show") return run;
    const timeout = integerOption(values, "timeout", 600, 1, 3600);
    const signal = AbortSignal.timeout(timeout * 1000);
    while (!signal.aborted) {
      const current = await read(signal);
      if (!["queued", "running"].includes(current.status)) return current;
      await sleep(500, undefined, { signal }).catch(() => {});
    }
    throw new CliError(
      "Timed out waiting for the check. It continues in the owner app; reconnect with checks watch.",
      "timeout",
      5,
      { checkId: id },
    );
  }
  const review = await readReview(client, id);
  const identity = expected(command, review);
  if (name === "rounds show")
    return client.request(
      `/api/workflow?reviewId=${review.id}&round=${integerOption(values, "round", review.round, 1)}`,
    );
  const state = await client.request<{
    findings: TrackedFindingSchema[];
    rounds: unknown[];
    tasks: FixTaskSchema[];
    checks: CheckRunSchema[];
    usage: unknown[];
    verifications: unknown[];
  }>(`/api/workflow?reviewId=${review.id}`);
  switch (name) {
    case "findings verify":
      return write(identity, {
        action: "verify-findings",
        findingIds: ids(stringOption(values, "findings")),
      });
    case "findings assess": {
      const outcome = stringOption(values, "outcome") ?? "unverified";
      if (
        !verificationOutcomes.includes(
          outcome as (typeof verificationOutcomes)[number],
        )
      )
        throw new CliError(
          "Choose a supported --outcome.",
          "invalid_arguments",
          2,
        );
      return write(identity, {
        action: "assess",
        findingId: args[1],
        outcome,
        explanation: stringOption(values, "reason") ?? "Manually assessed",
        checkIds: [],
      });
    }
    case "verifications list":
      return state.verifications;
    case "verifications cancel":
      return write(identity, {
        action: "cancel-verification",
        verificationId: args[1],
      });
    case "findings list":
      return state.findings.filter(
        (finding) => !values.status || finding.decision === values.status,
      );
    case "findings decide": {
      const decision = stringOption(values, "status");
      if (
        !findingDecisions.includes(
          decision as (typeof findingDecisions)[number],
        )
      )
        throw new CliError(
          "Choose --status open, accepted, dismissed, or resolved.",
          "invalid_arguments",
          2,
        );
      return write(identity, {
        action: "decision",
        findingId: args[1],
        decision,
        ...(values.reason ? { reason: values.reason } : {}),
      });
    }
    case "findings link":
      return write(identity, {
        action: "link",
        findingId: args[1],
        targetId: stringOption(values, "target") ?? null,
      });
    case "tasks list":
      return state.tasks;
    case "tasks create":
      return write(identity, {
        action: "create-task",
        title: stringOption(values, "title") ?? "Fix selected findings",
        findingIds: ids(stringOption(values, "findings")),
        noteIds: ids(stringOption(values, "notes")),
        constraints: stringOption(values, "constraints") ?? "",
        checks: ids(stringOption(values, "suggested-checks")),
        workspaceKind: stringOption(values, "workspace") ?? "managed",
      });
    case "checks list":
      return state.checks;
    case "checks run":
      return write(identity, {
        action: "start-check",
        compareWithBase: !!values["compare-base"],
        command: stringOption(values, "command") ?? "",
        cwd: stringOption(values, "cwd") ?? ".",
        findingIds: ids(stringOption(values, "findings")),
        timeoutSeconds: integerOption(values, "timeout", 600, 1, 3600),
        ...(values["reuse-check"]
          ? { reuseCheckId: values["reuse-check"] }
          : {}),
      });
    case "rounds list":
      return state.rounds;
    case "usage show":
      return state.usage;
    default:
      throw new CliError(
        "Unsupported workflow command.",
        "invalid_arguments",
        2,
      );
  }
};
