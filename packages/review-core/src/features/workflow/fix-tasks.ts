import { recordWorkOutcome } from "../notifications/notification-events";
import { randomUUID } from "node:crypto";
import {
  fixTaskSchema,
  type FixTaskSchema,
  type FixTaskStatus,
  type ReviewIdentitySchema,
  type WorkspaceKind,
  type TaskChangeSchema,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import { WorkflowStore } from "./workflow-store";
import { readExecutionManifest } from "./execution-manifest";
import {
  allowsSourcePath,
  readProjectPolicy,
  sourcePolicyHash,
} from "./project-policy";

export class FixTasks {
  constructor(
    readonly store: LocalStore,
    readonly repository: string,
  ) {}
  list = (reviewId: string) => {
    if (!this.store.getReview(this.repository, reviewId)) return [];
    return this.store.database
      .prepare(
        "SELECT body FROM fix_tasks WHERE review_id=? ORDER BY rowid DESC",
      )
      .all(reviewId)
      .map((row) => fixTaskSchema.parse(JSON.parse(String(row.body))));
  };
  get = (id: string) => {
    const row = this.store.database
      .prepare(
        "SELECT t.body FROM fix_tasks t JOIN reviews r ON r.id=t.review_id WHERE t.id=? AND r.repository=?",
      )
      .get(id, this.repository);
    return row ? fixTaskSchema.parse(JSON.parse(String(row.body))) : null;
  };
  save = (task: FixTaskSchema) => {
    const savedTask = fixTaskSchema.parse({
      ...task,
      updatedAt: new Date().toISOString(),
    });
    this.store.database
      .prepare(
        "INSERT INTO fix_tasks VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(savedTask.id, savedTask.review.id, JSON.stringify(savedTask));
    recordWorkOutcome(this.store, this.repository, "fix", savedTask);
    return savedTask;
  };
  create = (
    review: ReviewIdentitySchema,
    input: {
      title: string;
      findingIds: string[];
      noteIds?: string[];
      constraints?: string;
      checks?: string[];
      workspaceKind: WorkspaceKind;
    },
  ) =>
    this.store.transaction(() => {
      const workflow = new WorkflowStore(this.store, this.repository);
      const snapshot = workflow.requireReview(review.id, review);
      const findings = workflow.findings(review.id);
      if (
        !input.findingIds.length ||
        input.findingIds.some(
          (id) =>
            !findings.some(
              (finding) => finding.id === id && !finding.duplicateOf,
            ),
        )
      )
        throw new Error("Choose findings from this review.");
      if (
        input.noteIds?.some(
          (id) => !snapshot.notes.some((note) => note.id === id),
        )
      )
        throw new Error("Choose notes from this review.");
      const now = new Date().toISOString();
      return this.save(
        fixTaskSchema.parse({
          id: randomUUID(),
          review,
          title: input.title,
          findingIds: [...new Set(input.findingIds)],
          noteIds: input.noteIds ?? [],
          constraints: input.constraints ?? "",
          checks: input.checks ?? [],
          status: "ready",
          agent: null,
          workspaceKind: input.workspaceKind,
          directory: input.workspaceKind === "current" ? this.repository : null,
          manifestId: null,
          changes: [],
          activity: [{ label: "Task created", createdAt: now }],
          createdAt: now,
          updatedAt: now,
        }),
      );
    });
  claim = (id: string, agent: string, expected: ReviewIdentitySchema) =>
    this.store.transaction(() => {
      const task = this.requireTask(id, expected);
      new WorkflowStore(this.store, this.repository).requireReview(
        expected.id,
        expected,
      );
      if (task.status === "in-progress" && task.agent === agent) return task;
      if (task.status !== "ready")
        throw new Error("Task is already claimed or closed.");
      if (!task.directory)
        throw new Error("Wait for the task workspace to finish preparing.");
      const policy = readProjectPolicy(this.store, this.repository);
      if (task.manifestId) {
        const manifest = readExecutionManifest(
          this.store,
          this.repository,
          task.manifestId,
        );
        if (
          manifest.removedAt ||
          manifest.policyHash !== sourcePolicyHash(policy)
        )
          throw new Error(
            "Workspace source policy changed. Create a fresh fix task.",
          );
      }
      const findings = new WorkflowStore(this.store, this.repository).findings(
        task.review.id,
      );
      if (
        findings
          .filter((finding) => task.findingIds.includes(finding.id))
          .some(
            (finding) =>
              !allowsSourcePath(
                policy,
                finding.observations.at(-1)!.evidence.path,
              ),
          )
      )
        throw new Error("Source policy blocks this task.");
      if (
        task.directory &&
        this.store.database
          .prepare(
            "SELECT 1 FROM fix_tasks t JOIN reviews r ON r.id=t.review_id WHERE r.repository=? AND t.id<>? AND json_extract(t.body,'$.directory')=? AND json_extract(t.body,'$.status')='in-progress'",
          )
          .get(this.repository, id, task.directory)
      )
        throw new Error(
          "This worktree is already claimed by another fix task.",
        );
      return this.save({
        ...task,
        agent: agent.trim().slice(0, 200) || "External agent",
        status: "in-progress",
        activity: [
          ...task.activity,
          { label: `Claimed by ${agent}`, createdAt: new Date().toISOString() },
        ],
      });
    });
  requireTask = (id: string, expected?: ReviewIdentitySchema) => {
    const task = this.get(id);
    if (!task) throw new Error("Fix task not found in this repository.");
    if (
      expected &&
      (task.review.id !== expected.id ||
        task.review.hash !== expected.hash ||
        task.review.round !== expected.round)
    )
      throw new Error("Task source changed. Reload and retry.");
    return task;
  };
  transition = (
    id: string,
    status: FixTaskStatus,
    expected: ReviewIdentitySchema,
    label?: string,
    changes?: TaskChangeSchema[],
  ) =>
    this.store.transaction(() => {
      const task = this.requireTask(id, expected);
      const allowed =
        task.status === "ready"
          ? ["failed", "canceled"]
          : task.status === "in-progress"
            ? ["returned", "failed", "canceled"]
            : task.status === "returned"
              ? ["reviewed", "canceled"]
              : [];
      if (!allowed.includes(status))
        throw new Error("This task transition is unavailable.");
      return this.save({
        ...task,
        status,
        changes: changes ?? task.changes,
        activity: [
          ...task.activity,
          { label: label ?? status, createdAt: new Date().toISOString() },
        ],
      });
    });
  prompt = (id: string) => {
    const task = this.requireTask(id);
    const workflow = new WorkflowStore(this.store, this.repository);
    const review = workflow.round(task.review.id, task.review.round);
    if (!review) throw new Error("Original task evidence unavailable.");
    const findings = workflow
      .findings(task.review.id)
      .filter((finding) => task.findingIds.includes(finding.id));
    const policy = readProjectPolicy(this.store, this.repository);
    const evidence = findings.map(
      (finding) =>
        [...finding.observations]
          .reverse()
          .find((observation) => observation.review.hash === task.review.hash)
          ?.evidence ?? finding.observations.at(-1)!.evidence,
    );
    if (
      evidence.some((item) => !allowsSourcePath(policy, item.path)) ||
      review.notes.some(
        (note) =>
          task.noteIds.includes(note.id) &&
          !allowsSourcePath(policy, note.path),
      )
    )
      throw new Error(
        "Current source policy blocks this task's evidence export.",
      );
    return [
      `Task ${task.id}: ${task.title}`,
      `Review ${task.review.id}, round ${task.review.round}, hash ${task.review.hash}`,
      `Original project: ${this.repository}`,
      `Workspace: ${task.directory ?? "Not prepared"}`,
      "Run Senslop CLI commands with --repo pointing to the original project, including while editing a managed worktree.",
      "Confirm this task and source identity through the Senslop CLI before editing. Evaluate each finding's validity and make focused changes. Return changes through the task protocol; do not commit or push.",
      policy.inference === "local-only"
        ? "Project requires local inference. Use only a user-approved local agent/model; external agent access is outside Senslop enforcement."
        : "Use the user's selected agent and source-access policy.",
      task.constraints,
      ...evidence.map(
        (item) =>
          `${item.title}\n${item.path}:${item.start}-${item.end} (${item.side})\n${item.problem}\n${item.code}\n${item.fixPrompt}`,
      ),
      ...review.notes
        .filter((note) => task.noteIds.includes(note.id))
        .map((note) => `Human note: ${note.path}\n${note.body}`),
      task.checks.length
        ? `Suggested checks:\n${task.checks.join("\n")}`
        : "Suggest focused checks. Do not claim they passed without execution evidence.",
    ]
      .filter(Boolean)
      .join("\n\n");
  };
}
