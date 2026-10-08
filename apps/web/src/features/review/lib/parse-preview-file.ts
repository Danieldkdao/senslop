import { parseDiffFromFile, processFile } from "@pierre/diffs";
import type { PreviewFileSchema } from "@senslop/contracts";

export const parsePreviewFile = (file: PreviewFileSchema) => {
  if (file.binary || file.before === file.after) return null;
  let parsed;
  try {
    // Full source preserves grammar context while retaining Git's original hunks.
    parsed = processFile(file.diff, {
      oldFile: { name: file.oldPath ?? file.path, contents: file.before ?? "" },
      newFile: { name: file.path, contents: file.after ?? "" },
      throwOnError: true,
    });
    if (!parsed?.name) parsed = undefined;
  } catch {
    // Frozen contents let us recover when patch metadata is incomplete.
  }
  try {
    parsed ??= parseDiffFromFile(
      file.before === null
        ? null
        : { name: file.oldPath ?? file.path, contents: file.before },
      file.after === null ? null : { name: file.path, contents: file.after },
      { context: 3 },
      true,
    );
    // Use the original paths rather than Git's quoted and escaped header names.
    return { ...parsed, name: file.path, prevName: file.oldPath ?? undefined };
  } catch {
    return null;
  }
};
