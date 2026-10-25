import { parseDiffFromFile, processFile } from "@pierre/diffs";
import type { WhitespaceMode } from "../constants";
import type { PreviewFileSchema } from "@senslop/contracts";

export const parsePreviewFile = (
  file: PreviewFileSchema,
  whitespace: WhitespaceMode = "all",
) => {
  if (file.binary || file.before === file.after) return null;
  let parsed;
  const normalize = (contents: string) =>
    whitespace === "ignore-trailing"
      ? contents
          .split("\n")
          .map((line) => line.replace(/[ \t\r]+$/, ""))
          .join("\n")
      : contents;
  if (whitespace !== "all") {
    try {
      return parseDiffFromFile(
        file.before === null
          ? null
          : {
              name: file.oldPath ?? file.path,
              contents: normalize(file.before),
            },
        file.after === null
          ? null
          : { name: file.path, contents: normalize(file.after) },
        { context: 3, ignoreWhitespace: whitespace === "ignore-all" },
        true,
      );
    } catch {
      return null;
    }
  }
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
