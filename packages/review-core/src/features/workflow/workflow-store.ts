import { randomUUID } from "node:crypto";
import {
  savedReviewSchema,
  trackedFindingSchema,
  checkRunSchema,
  findingEvidenceSchema,
  type FindingDecision,
  type FindingEvidenceSchema,
  type ReviewIdentitySchema,
  type SavedReviewSchema,
  type TrackedFindingSchema,
  type VerificationOutcome,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";

export class WorkflowStore {
  constructor(
    readonly store: LocalStore,
    readonly repository: string,
  ) {}

  requireReview = (
    id: string,
    expected?: Pick<ReviewIdentitySchema, "hash" | "round">,
  ) => {
    const existingReview = this.store.getReview(this.repository, id);
    if (!existingReview)
      throw new Error("Review not found in this repository.");
    if (
      expected &&
      (existingReview.hash !== expected.hash ||
        existingReview.round !== expected.round)
    )
      throw new Error("Review contents changed. Reload and retry.");
    return existingReview;
  };

  rounds = (id: string) => {
    if (!this.store.getReview(this.repository, id)) return [];
    return this.store.database
      .prepare(
        "SELECT body FROM review_rounds WHERE review_id = ? ORDER BY round DESC",
      )
      .all(id)
      .map((row) => savedReviewSchema.parse(JSON.parse(String(row.body))));
  };

  round = (id: string, round: number) =>
    this.rounds(id).find((item) => item.round === round) ?? null;

  findings = (id: string): TrackedFindingSchema[] => {
    if (!this.store.getReview(this.repository, id)) return [];
    return this.store.database
      .prepare(
        "SELECT body FROM review_findings WHERE review_id = ? ORDER BY rowid",
      )
      .all(id)
      .map((row) => trackedFindingSchema.parse(JSON.parse(String(row.body))));
  };

  private save = (finding: TrackedFindingSchema) => {
    const savedFinding = trackedFindingSchema.parse(finding);
    this.store.database
      .prepare(
        "INSERT INTO review_findings VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body WHERE review_findings.review_id = excluded.review_id",
      )
      .run(
        savedFinding.id,
        savedFinding.reviewId,
        JSON.stringify(savedFinding),
      );
    return savedFinding;
  };

  observe = (
    review: ReviewIdentitySchema & { files?: SavedReviewSchema["files"] },
    jobId: string,
    inputs: (Omit<FindingEvidenceSchema, "category"> & {
      category?: FindingEvidenceSchema["category"];
    })[],
  ) =>
    this.store.transaction(() => {
      this.requireReview(review.id);
      const findings = this.findings(review.id);
      const identity = {
        id: review.id,
        hash: review.hash,
        round: review.round,
      };
      const now = new Date().toISOString();
      return inputs.map((input) => {
        const evidence = findingEvidenceSchema.parse(input);
        const already = findings.find((finding) =>
          finding.observations.some(
            (observation) =>
              observation.jobId === jobId &&
              JSON.stringify(observation.evidence) === JSON.stringify(evidence),
          ),
        );
        if (already) return already;
        const candidates = findings.filter(
          (finding) =>
            !finding.duplicateOf &&
            !finding.observations.some(
              (observation) => observation.jobId === jobId,
            ) &&
            finding.observations.some(
              (observation) =>
                observation.evidence.code === evidence.code &&
                observation.evidence.title.trim().toLowerCase() ===
                  evidence.title.trim().toLowerCase() &&
                (observation.evidence.path === evidence.path ||
                  review.files?.some(
                    (file) =>
                      file.oldPath === observation.evidence.path &&
                      file.path === evidence.path,
                  )),
            ),
        );
        const located = candidates.filter((finding) =>
          finding.observations.some(
            (observation) =>
              observation.evidence.path === evidence.path &&
              observation.evidence.side === evidence.side &&
              observation.evidence.start === evidence.start &&
              observation.evidence.end === evidence.end,
          ),
        );
        const matches = located.length ? located : candidates;
        const finding =
          matches.length === 1
            ? matches[0]!
            : trackedFindingSchema.parse({
                id: randomUUID(),
                reviewId: review.id,
                decision: "open",
                observations: [],
                history: [],
                possibleMatches: findings
                  .filter(
                    (item) =>
                      !item.observations.some(
                        (observation) => observation.jobId === jobId,
                      ) &&
                      item.observations.some(
                        (observation) =>
                          observation.evidence.code === evidence.code &&
                          observation.evidence.path === evidence.path,
                      ),
                  )
                  .map((item) => item.id),
              });
        finding.observations.push({
          id: randomUUID(),
          jobId,
          review: identity,
          evidence,
          createdAt: now,
        });
        finding.observations.sort(
          (first, second) =>
            first.review.round - second.review.round ||
            first.createdAt.localeCompare(second.createdAt),
        );
        const currentReview = this.requireReview(review.id);
        if (
          currentReview.hash === review.hash &&
          currentReview.round === review.round
        ) {
          if (finding.decision === "resolved") {
            finding.decision = "open";
            finding.history.push({
              id: randomUUID(),
              kind: "recurrence",
              review: identity,
              label: "Reopened after recurrence",
              createdAt: now,
            });
          }
          finding.assessment = {
            review: identity,
            outcome: "present",
            explanation:
              "Observed in this analysis. Evidence location is validated; the diagnosis remains subject to review.",
            checkIds: [],
            createdAt: now,
          };
        }
        if (!findings.some((item) => item.id === finding.id))
          findings.push(finding);
        return this.save(finding);
      });
    });

  decide = (
    reviewId: string,
    id: string,
    decision: FindingDecision,
    reason: string | undefined,
    expected: Pick<ReviewIdentitySchema, "hash" | "round">,
  ) =>
    this.store.transaction(() => {
      const review = this.requireReview(reviewId, expected);
      const finding = this.findings(reviewId).find((item) => item.id === id);
      if (!finding) throw new Error("Finding not found.");
      finding.decision = decision;
      finding.history.push({
        id: randomUUID(),
        kind: "decision",
        review: { id: reviewId, hash: review.hash, round: review.round },
        label: decision,
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
        createdAt: new Date().toISOString(),
      });
      return this.save(finding);
    });

  assess = (
    reviewId: string,
    id: string,
    outcome: VerificationOutcome,
    explanation: string,
    checkIds: string[],
    expected: Pick<ReviewIdentitySchema, "hash" | "round">,
  ) =>
    this.store.transaction(() => {
      const review = this.requireReview(reviewId, expected);
      const finding = this.findings(reviewId).find((item) => item.id === id);
      if (!finding) throw new Error("Finding not found.");
      const identity = { id: reviewId, hash: review.hash, round: review.round };
      for (const checkId of checkIds) {
        const row = this.store.database
          .prepare("SELECT body FROM check_runs WHERE id=? AND review_id=?")
          .get(checkId, reviewId);
        const check = row
          ? checkRunSchema.parse(JSON.parse(String(row.body)))
          : null;
        if (
          !check ||
          check.review.hash !== review.hash ||
          check.review.round !== review.round ||
          check.sourceSide !== "changed" ||
          check.sourceModified ||
          check.status !== "passed" ||
          !check.findingIds.includes(id)
        )
          throw new Error(
            "Choose passing checks for this finding and exact review revision.",
          );
      }
      finding.assessment = {
        review: identity,
        outcome,
        explanation,
        checkIds,
        createdAt: new Date().toISOString(),
      };
      finding.history.push({
        id: randomUUID(),
        kind: "assessment",
        review: identity,
        label: outcome,
        reason: explanation,
        createdAt: new Date().toISOString(),
      });
      return this.save(finding);
    });

  link = (
    reviewId: string,
    id: string,
    target: string | null,
    expected: Pick<ReviewIdentitySchema, "hash" | "round">,
  ) =>
    this.store.transaction(() => {
      const review = this.requireReview(reviewId, expected);
      const findings = this.findings(reviewId);
      const finding = findings.find((item) => item.id === id);
      if (
        !finding ||
        (target &&
          !findings.some((item) => item.id === target && !item.duplicateOf)) ||
        id === target ||
        (target !== null && findings.some((item) => item.duplicateOf === id))
      )
        throw new Error("Choose a distinct primary finding.");
      finding.duplicateOf = target;
      finding.possibleMatches = [];
      finding.history.push({
        id: randomUUID(),
        kind: "duplicate",
        review: { id: reviewId, hash: review.hash, round: review.round },
        label: target ? "Linked duplicate" : "Kept separate",
        createdAt: new Date().toISOString(),
      });
      return this.save(finding);
    });
}
