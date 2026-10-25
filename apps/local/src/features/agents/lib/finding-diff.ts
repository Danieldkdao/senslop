import type { ChangeContent, ContextContent, Hunk } from "@pierre/diffs";
import type { PreviewFileSchema } from "@senslop/contracts";
import { parsePreviewFile } from "../../review/lib/parse-preview-file";
import type { WhitespaceMode } from "../../review/constants";
import type { FindingSchema } from "../schemas";

export const findingDiff = (
  file: PreviewFileSchema,
  finding: Pick<FindingSchema, "side" | "start" | "end">,
  regions?: readonly Pick<FindingSchema, "side" | "start" | "end">[],
  whitespace?: WhitespaceMode,
  contextLines = 0,
) => {
  const diff = parsePreviewFile(file, whitespace);
  if (!diff) return null;
  const hunks: Hunk[] = [];
  const deletionLines: string[] = [];
  const additionLines: string[] = [];
  let unifiedLineCount = 0;
  let splitLineCount = 0;
  const emit = (
    content: ContextContent | ChangeContent,
    deletionSourceIndex: number,
    additionSourceIndex: number,
    deletions: number,
    additions: number,
  ) => {
    const deletionLineIndex = deletionLines.length;
    const additionLineIndex = additionLines.length;
    const clipped: ContextContent | ChangeContent =
      content.type === "context"
        ? {
            type: "context",
            lines: deletions,
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
      content.type === "context" ? deletions : deletions + additions;
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
  const append = (content: ContextContent | ChangeContent) => {
    let contextFrom = 0;
    let contextTo = 0;
    if (regions && content.type === "context") {
      if (contextLines <= 0) return;
      const windows = regions.flatMap((range) => {
        const index =
          range.side === "before"
            ? content.deletionLineIndex
            : content.additionLineIndex;
        const from = Math.max(0, range.start - contextLines - 1 - index);
        const to = Math.min(content.lines, range.end + contextLines - index);
        return from < to ? [{ from, to }] : [];
      });
      if (!windows.length) return;
      contextFrom = Math.min(...windows.map((window) => window.from));
      contextTo = Math.max(...windows.map((window) => window.to));
    }
    if (regions && content.type === "change") {
      const windows = (side: "before" | "after") => {
        const index =
          side === "before"
            ? content.deletionLineIndex
            : content.additionLineIndex;
        const count = side === "before" ? content.deletions : content.additions;
        const clipped = regions
          .filter((range) => range.side === side)
          .map((range) => ({
            from: Math.max(0, range.start - 1 - index),
            to: Math.min(count, range.end - index),
          }))
          .filter((range) => range.from < range.to)
          .sort((left, right) => left.from - right.from);
        const merged: typeof clipped = [];
        for (const range of clipped) {
          const previous = merged.at(-1);
          if (previous && range.from <= previous.to)
            previous.to = Math.max(previous.to, range.to);
          else merged.push({ ...range });
        }
        return merged;
      };
      const before = windows("before");
      const after = windows("after");
      for (
        let index = 0;
        index < Math.max(before.length, after.length);
        index++
      ) {
        const deletion = before[index] ?? {
          from: content.deletions,
          to: content.deletions,
        };
        const addition = after[index] ?? {
          from: content.additions,
          to: content.additions,
        };
        emit(
          content,
          content.deletionLineIndex + deletion.from,
          content.additionLineIndex + addition.from,
          deletion.to - deletion.from,
          addition.to - addition.from,
        );
      }
      return;
    }
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
    const from = regions
      ? contextFrom
      : Math.max(0, finding.start - 1 - selectedIndex);
    const to = regions
      ? contextTo
      : Math.min(selectedCount, finding.end - selectedIndex);
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
    emit(
      content,
      deletionSourceIndex,
      additionSourceIndex,
      deletions,
      additions,
    );
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
