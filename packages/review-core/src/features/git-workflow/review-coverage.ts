import { organizationSchema, type SavedReviewSchema } from "@senslop/contracts";
import type { LocalStore } from "../../db/local-store";
import { createReviewUnits } from "../precision/review-units";

export const findReviewedChange = (
  store: LocalStore,
  reviews: SavedReviewSchema[],
  path: string,
  beforeHash: string | null,
  afterHash: string | null,
  after: string | null,
  before?: string | null,
) =>
  reviews.find((review) => {
    const file = review.files.find((entry) => entry.path === path);
    if (!file) return false;
    if (
      file.beforeHash === beforeHash &&
      file.afterHash === afterHash &&
      review.completedPaths.includes(path)
    )
      return true;
    if (file.binary || after?.includes("\0")) return false;
    const row = store.database
      .prepare(
        "SELECT body FROM review_precision WHERE review_id=? AND round=?",
      )
      .get(review.id, review.round);
    if (!row) return false;
    const saved = organizationSchema.parse(JSON.parse(String(row.body)));
    const original = createReviewUnits([file]);
    const outgoing = createReviewUnits([
      {
        ...file,
        before: before === undefined ? file.before : before,
        beforeHash,
        after,
        afterHash,
      },
    ]);
    return outgoing.every((unit) => {
      const candidates = original.filter(
        (entry) => entry.fingerprint === unit.fingerprint,
      );
      if (candidates.length !== 1 || unit.kind !== "text") return false;
      return candidates[0]!.ranges.every((range) => {
        for (let line = range.start; line <= range.end; line++)
          if (
            !saved.units.some(
              (entry) =>
                entry.path === path &&
                entry.reviewed &&
                !entry.needsReview &&
                entry.ranges.some(
                  (span) =>
                    span.side === range.side &&
                    span.start <= line &&
                    span.end >= line,
                ),
            )
          )
            return false;
        return true;
      });
    });
  });
