import type { ChangeContent, ContextContent, Hunk } from "@pierre/diffs";
import type { PreviewFileSchema } from "@senslop/contracts";
import { parsePreviewFile } from "../../review/lib/parse-preview-file";
import type { FindingSchema } from "../schemas";

export const findingDiff = (
  file: PreviewFileSchema,
  finding: Pick<FindingSchema, "side" | "start" | "end">,
) => {
  const diff = parsePreviewFile(file);
  if (!diff) return null;
  const hunks: Hunk[] = [];
  const deletionLines: string[] = [];
  const additionLines: string[] = [];
  let unifiedLineCount = 0;
  let splitLineCount = 0;
  const append = (content: ContextContent | ChangeContent) => {
    const selectedIndex =
      finding.side === "before"
        ? content.deletionLineIndex
        : content.additionLineIndex;
    const selectedCount =
      content.type === "context"
        ? content.lines
        : finding.side === "before"
          ? content.deletions
          : content.additions;
    const from = Math.max(0, finding.start - 1 - selectedIndex);
    const to = Math.min(selectedCount, finding.end - selectedIndex);
    if (from >= to) return;
    const deletions =
      content.type === "context"
        ? to - from
        : Math.max(0, Math.min(content.deletions, to) - from);
    const additions =
      content.type === "context"
        ? to - from
        : Math.max(0, Math.min(content.additions, to) - from);
    const deletionSourceIndex =
      content.deletionLineIndex +
      Math.min(
        from,
        content.type === "context" ? content.lines : content.deletions,
      );
    const additionSourceIndex =
      content.additionLineIndex +
      Math.min(
        from,
        content.type === "context" ? content.lines : content.additions,
      );
    const deletionLineIndex = deletionLines.length;
    const additionLineIndex = additionLines.length;
    const clipped: ContextContent | ChangeContent =
      content.type === "context"
        ? {
            type: "context",
            lines: to - from,
            deletionLineIndex,
            additionLineIndex,
          }
        : {
            type: "change",
            deletions,
            additions,
            deletionLineIndex,
            additionLineIndex,
          };
    const unifiedCount =
      content.type === "context" ? to - from : deletions + additions;
    const splitCount = Math.max(deletions, additions);
    const hunk: Hunk = {
      collapsedBefore: 0,
      deletionStart: deletionSourceIndex + (deletions > 0 ? 1 : 0),
      additionStart: additionSourceIndex + (additions > 0 ? 1 : 0),
      deletionCount: deletions,
      additionCount: additions,
      deletionLines: content.type === "change" ? deletions : 0,
      additionLines: content.type === "change" ? additions : 0,
      deletionLineIndex,
      additionLineIndex,
      hunkContent: [clipped],
      unifiedLineStart: unifiedLineCount,
      unifiedLineCount: unifiedCount,
      splitLineStart: splitLineCount,
      splitLineCount: splitCount,
      noEOFCRDeletions:
        deletions > 0 &&
        deletionSourceIndex + deletions === diff.deletionLines.length &&
        !diff.deletionLines.at(-1)!.endsWith("\n"),
      noEOFCRAdditions:
        additions > 0 &&
        additionSourceIndex + additions === diff.additionLines.length &&
        !diff.additionLines.at(-1)!.endsWith("\n"),
    };
    const previous = hunks.at(-1);
    if (
      previous &&
      previous.deletionStart -
        (previous.deletionCount > 0 ? 1 : 0) +
        previous.deletionCount ===
        deletionSourceIndex &&
      previous.additionStart -
        (previous.additionCount > 0 ? 1 : 0) +
        previous.additionCount ===
        additionSourceIndex
    ) {
      previous.hunkContent.push(clipped);
      if (previous.deletionCount === 0 && deletions > 0)
        previous.deletionStart = deletionSourceIndex + 1;
      if (previous.additionCount === 0 && additions > 0)
        previous.additionStart = additionSourceIndex + 1;
      previous.deletionCount += deletions;
      previous.additionCount += additions;
      previous.deletionLines += hunk.deletionLines;
      previous.additionLines += hunk.additionLines;
      previous.unifiedLineCount += unifiedCount;
      previous.splitLineCount += splitCount;
      if (deletions) previous.noEOFCRDeletions = hunk.noEOFCRDeletions;
      if (additions) previous.noEOFCRAdditions = hunk.noEOFCRAdditions;
    } else hunks.push(hunk);
    deletionLines.push(
      ...diff.deletionLines.slice(
        deletionSourceIndex,
        deletionSourceIndex + deletions,
      ),
    );
    additionLines.push(
      ...diff.additionLines.slice(
        additionSourceIndex,
        additionSourceIndex + additions,
      ),
    );
    unifiedLineCount += unifiedCount;
    splitLineCount += splitCount;
  };
  let deletionIndex = 0;
  let additionIndex = 0;
  for (const hunk of diff.hunks) {
    append({
      type: "context",
      lines: hunk.deletionLineIndex - deletionIndex,
      deletionLineIndex: deletionIndex,
      additionLineIndex: additionIndex,
    });
    for (const content of hunk.hunkContent) append(content);
    deletionIndex = hunk.deletionLineIndex + hunk.deletionCount;
    additionIndex = hunk.additionLineIndex + hunk.additionCount;
  }
  append({
    type: "context",
    lines: diff.deletionLines.length - deletionIndex,
    deletionLineIndex: deletionIndex,
    additionLineIndex: additionIndex,
  });
  // Partial metadata keeps omitted source lines out of rendering and expansion.
  return hunks.length
    ? {
        ...diff,
        cacheKey: undefined,
        isPartial: true,
        deletionLines,
        additionLines,
        hunks,
        unifiedLineCount,
        splitLineCount,
      }
    : null;
};
