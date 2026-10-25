import { createHash } from "node:crypto";
import {
  reviewBriefInputSchema,
  reviewBriefSchema,
  requirementCoverageSchema,
  type ReviewBriefSchema,
  type ReviewBriefInputSchema,
  type ReviewIdentitySchema,
  type ReviewCriterionSchema,
  type RequirementCoverageSchema,
  type CheckRunSchema,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import { WorkflowStore } from "../workflow/workflow-store";
import {
  allowsSourcePath,
  readProjectPolicy,
} from "../workflow/project-policy";

export const validateRequirementCoverage = (
  input: unknown,
  criteria: ReviewCriterionSchema[],
  context: { sources: Record<string, string>; before?: Record<string, string> },
  checks: Pick<CheckRunSchema, "id" | "status">[],
): RequirementCoverageSchema => {
  const result = requirementCoverageSchema.parse(input);
  const seen = new Set<string>();
  for (const assessment of result.criteria) {
    const criterion = criteria.find(
      (item) => item.id === assessment.criterionId,
    );
    if (!criterion || seen.has(criterion.id))
      throw new Error(
        "Requirement coverage must include each criterion exactly once.",
      );
    seen.add(criterion.id);
    for (const evidence of assessment.evidence) {
      const source =
        evidence.side === "before"
          ? context.before?.[evidence.path]
          : context.sources[evidence.path];
      if (
        source === undefined ||
        evidence.end < evidence.start ||
        source
          .split("\n")
          .slice(evidence.start - 1, evidence.end)
          .join("\n") !== evidence.code
      )
        throw new Error("Requirement evidence does not match frozen source.");
    }
    if (
      (assessment.status === "implemented" ||
        assessment.status === "verified") &&
      !assessment.evidence.length
    )
      throw new Error("Implementation needs source evidence.");
    assessment.checkIds = criterion.checkIds.filter((id) =>
      checks.some((check) => check.id === id),
    );
    if (assessment.status === "implemented" || assessment.status === "verified")
      assessment.status =
        criterion.checkIds.length > 0 &&
        criterion.checkIds.every((id) =>
          checks.some((check) => check.id === id && check.status === "passed"),
        )
          ? "verified"
          : "implemented";
  }
  if (seen.size !== criteria.length)
    throw new Error("Requirement coverage is missing a criterion.");
  for (const change of result.unexpectedChanges)
    if (
      !(change.path in context.sources) &&
      !(change.path in (context.before ?? {}))
    )
      throw new Error("Unexpected change references unavailable source.");
  return result;
};

export class ReviewIntent {
  constructor(
    readonly store: LocalStore,
    readonly repository: string,
  ) {}

  briefs = (reviewId: string): ReviewBriefSchema[] => {
    if (!this.store.getReview(this.repository, reviewId)) return [];
    return this.store.database
      .prepare(
        "SELECT body FROM review_briefs WHERE review_id=? ORDER BY version DESC",
      )
      .all(reviewId)
      .map((row) => reviewBriefSchema.parse(JSON.parse(String(row.body))));
  };

  saveBrief = (
    review: ReviewIdentitySchema,
    expectedVersion: number,
    input: ReviewBriefInputSchema,
  ) =>
    this.store.transaction(() => {
      new WorkflowStore(this.store, this.repository).requireReview(
        review.id,
        review,
      );
      const previous = this.briefs(review.id)[0];
      if ((previous?.version ?? 0) !== expectedVersion)
        throw new Error("Review brief changed. Reload before saving.");
      const parsed = reviewBriefInputSchema.parse(input);
      if (
        new Set(parsed.criteria.map((item) => item.id)).size !==
        parsed.criteria.length
      )
        throw new Error("Each criterion needs a unique identity.");
      const policy = readProjectPolicy(this.store, this.repository);
      if (
        parsed.documents.some(
          (document) => !allowsSourcePath(policy, document.path),
        )
      )
        throw new Error("An attached document is excluded by source policy.");
      const brief = reviewBriefSchema.parse({
        ...parsed,
        documents: parsed.documents.map((document) => ({
          ...document,
          hash: createHash("sha256").update(document.contents).digest("hex"),
        })),
        review,
        version: expectedVersion + 1,
        createdAt: new Date().toISOString(),
      });
      this.store.database
        .prepare("INSERT INTO review_briefs VALUES (?,?,?)")
        .run(review.id, brief.version, JSON.stringify(brief));
      return brief;
    });

  validateCoverage = validateRequirementCoverage;
}
