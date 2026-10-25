import type { PreviewFileSchema, SavedReviewSchema } from "@senslop/contracts";

export const compareRounds = (
  left: SavedReviewSchema,
  right: SavedReviewSchema,
): PreviewFileSchema[] => {
  const consumed = new Set<string>();
  const comparisons = right.files.map((file) => {
    const previous = left.files.find(
      (item) => item.path === file.path || item.path === file.oldPath,
    );
    if (previous) consumed.add(previous.path);
    return {
      ...file,
      before: previous ? previous.after : file.before,
      beforeHash: previous ? previous.afterHash : file.beforeHash,
      diff: "",
    };
  });
  for (const previous of left.files) {
    if (consumed.has(previous.path)) continue;
    comparisons.push({
      ...previous,
      before: previous.after,
      beforeHash: previous.afterHash,
      after: previous.before,
      afterHash: previous.beforeHash,
      diff: "",
    });
  }
  return comparisons.filter(
    (file) => file.before !== file.after || file.binary,
  );
};
