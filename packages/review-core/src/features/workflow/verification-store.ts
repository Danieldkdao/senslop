import { recordWorkOutcome } from "../notifications/notification-events";
import { randomUUID } from "node:crypto";
import {
  verificationRunSchema,
  checkRunSchema,
  type VerificationRunSchema,
  type ReviewIdentitySchema,
  type VerificationAssessmentSchema,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import { WorkflowStore } from "./workflow-store";

export class VerificationStore {
  constructor(
    readonly store: LocalStore,
    readonly repository: string,
  ) {}
  list = (reviewId: string) => {
    if (!this.store.getReview(this.repository, reviewId)) return [];
    return this.store.database
      .prepare(
        "SELECT body FROM finding_verifications WHERE review_id=? ORDER BY rowid DESC",
      )
      .all(reviewId)
      .map((row) => verificationRunSchema.parse(JSON.parse(String(row.body))));
  };
  get = (id: string) => {
    const row = this.store.database
      .prepare(
        "SELECT v.body FROM finding_verifications v JOIN reviews r ON r.id=v.review_id WHERE v.id=? AND r.repository=?",
      )
      .get(id, this.repository);
    return row
      ? verificationRunSchema.parse(JSON.parse(String(row.body)))
      : null;
  };
  save = (run: VerificationRunSchema) => {
    const savedRun = verificationRunSchema.parse({
      ...run,
      updatedAt: new Date().toISOString(),
    });
    if (!this.store.getReview(this.repository, run.review.id)) return savedRun;
    this.store.database
      .prepare(
        "INSERT INTO finding_verifications VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(run.id, run.review.id, JSON.stringify(savedRun));
    recordWorkOutcome(this.store, this.repository, "verification", savedRun);
    return savedRun;
  };
  create = (review: ReviewIdentitySchema, findingIds: string[]) =>
    this.store.transaction(() => {
      const workflow = new WorkflowStore(this.store, this.repository);
      workflow.requireReview(review.id, review);
      if (
        !findingIds.length ||
        findingIds.some(
          (id) =>
            !workflow.findings(review.id).some((finding) => finding.id === id),
        )
      )
        throw new Error("Choose findings from this review.");
      const active = this.list(review.id).find(
        (run) =>
          ["queued", "running"].includes(run.status) &&
          run.review.hash === review.hash &&
          run.review.round === review.round &&
          [...run.findingIds].sort().join() === [...findingIds].sort().join(),
      );
      if (active) return active;
      const now = new Date().toISOString();
      return this.save(
        verificationRunSchema.parse({
          id: randomUUID(),
          review,
          findingIds,
          status: "queued",
          error: null,
          assessments: [],
          createdAt: now,
          updatedAt: now,
        }),
      );
    });
  cancel = (id: string) => {
    const run = this.get(id);
    if (!run) throw new Error("Verification not found.");
    return ["queued", "running"].includes(run.status)
      ? this.save({ ...run, status: "canceled" })
      : run;
  };
  publish = (id: string, assessments: VerificationAssessmentSchema[]) =>
    this.store.transaction(() => {
      const run = this.get(id);
      if (!run) throw new Error("Verification not found.");
      if (["canceled", "failed", "completed"].includes(run.status)) return run;
      const workflow = new WorkflowStore(this.store, this.repository);
      workflow.requireReview(run.review.id, run.review);
      if (
        run.findingIds.some(
          (findingId) =>
            assessments.filter((item) => item.findingId === findingId)
              .length !== 1,
        ) ||
        assessments.some((item) => !run.findingIds.includes(item.findingId))
      )
        throw new Error(
          "Verification did not assess exactly the requested findings.",
        );
      const checks = this.store.database
        .prepare("SELECT body FROM check_runs WHERE review_id=?")
        .all(run.review.id)
        .map((row) => checkRunSchema.parse(JSON.parse(String(row.body))))
        .filter(
          (check) =>
            check.sourceSide === "changed" &&
            check.review.hash === run.review.hash &&
            check.review.round === run.review.round &&
            !check.sourceModified &&
            check.status === "passed",
        );
      for (const assessment of assessments)
        workflow.assess(
          run.review.id,
          assessment.findingId,
          assessment.outcome,
          assessment.explanation,
          checks
            .filter((check) => check.findingIds.includes(assessment.findingId))
            .map((check) => check.id),
          run.review,
        );
      return this.save({
        ...run,
        status: "completed",
        ownerPid: null,
        assessments,
        error: null,
      });
    });
}
