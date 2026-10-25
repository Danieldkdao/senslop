import { randomUUID } from "node:crypto";
import {
  usageRecordSchema,
  type ReviewIdentitySchema,
  type UsageRecordSchema,
} from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import { WorkflowStore } from "./workflow-store";
import { readReviewPolicy, WorkflowPolicyError } from "./project-policy";

export class UsageStore {
  constructor(
    readonly store: LocalStore,
    readonly repository: string,
  ) {}
  list = (reviewId: string) => {
    if (!this.store.getReview(this.repository, reviewId)) return [];
    return this.store.database
      .prepare("SELECT body FROM review_usage WHERE review_id=? ORDER BY rowid")
      .all(reviewId)
      .map((row) => usageRecordSchema.parse(JSON.parse(String(row.body))));
  };

  private elapsed = (usage: UsageRecordSchema[]) =>
    usage.reduce(
      (sum, row) =>
        sum +
        (row.completed
          ? row.durationMs
          : Math.max(0, Date.now() - Date.parse(row.createdAt))),
      0,
    );

  reserve = (
    review: ReviewIdentitySchema,
    task: string,
    tokens: number,
    model: { provider: string; model: string },
  ) => {
    const policy = readReviewPolicy(this.store, this.repository, review.id);
    const id = randomUUID();
    const started = performance.now();
    this.store.transaction(() => {
      new WorkflowStore(this.store, this.repository).requireReview(
        review.id,
        review,
      );
      const usage = this.list(review.id);
      const consumed = usage.reduce(
        (sum, row) =>
          sum +
          (row.inputTokens !== null && row.outputTokens !== null
            ? row.inputTokens + row.outputTokens
            : row.reservedTokens),
        0,
      );
      const elapsed = this.elapsed(usage);
      if (policy.tokenBudget !== null && consumed + tokens > policy.tokenBudget)
        throw new WorkflowPolicyError(
          "Budget reached. Completed work is preserved; increase the review token budget to continue.",
        );
      if (
        policy.timeLimitSeconds !== null &&
        elapsed >= policy.timeLimitSeconds * 1000
      )
        throw new WorkflowPolicyError(
          "Budget reached. Review execution time allowance is exhausted.",
        );
      const record = usageRecordSchema.parse({
        id,
        reviewId: review.id,
        round: review.round,
        requestId: id,
        task,
        provider: model.provider,
        model: model.model,
        inputTokens: null,
        outputTokens: null,
        durationMs: 0,
        estimatedCost: null,
        reservedTokens: tokens,
        createdAt: new Date().toISOString(),
      });
      this.store.database
        .prepare("INSERT INTO review_usage VALUES (?,?,?)")
        .run(id, review.id, JSON.stringify(record));
    });
    let completed = false;
    const controller =
      policy.timeLimitSeconds === null ? null : new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const checkTime = () => {
      if (completed || !controller || controller.signal.aborted) return;
      try {
        const usage = this.list(review.id);
        const left = policy.timeLimitSeconds! * 1000 - this.elapsed(usage);
        if (left <= 0) {
          controller.abort(
            new WorkflowPolicyError(
              "Budget reached. Review execution time allowance is exhausted.",
            ),
          );
          return;
        }
        const active = Math.max(
          1,
          usage.filter((row) => !row.completed).length,
        );
        // Recheck shared accounting so newly admitted requests shorten every active deadline.
        timer = setTimeout(
          checkTime,
          Math.max(1, Math.min(25, Math.floor(left / active))),
        );
        timer.unref();
      } catch (error) {
        controller.abort(error);
      }
    };
    checkTime();
    return {
      signal: controller?.signal ?? null,
      finish: (usage: { inputTokens?: number; outputTokens?: number }) => {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        const row = this.list(review.id).find((item) => item.id === id);
        if (!row) return;
        this.store.database
          .prepare("UPDATE review_usage SET body=? WHERE id=?")
          .run(
            JSON.stringify({
              ...row,
              inputTokens: usage.inputTokens ?? null,
              outputTokens: usage.outputTokens ?? null,
              durationMs: Math.round(performance.now() - started),
              completed: true,
            }),
            id,
          );
      },
    };
  };
}
