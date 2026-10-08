"use client";

import { useCallback, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { FileDiff, File, type FileDiffOptions } from "@pierre/diffs/react";
import type { DiffLineAnnotation } from "@pierre/diffs";
import type { PreviewFileSchema } from "@senslop/contracts";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineComment } from "./inline-comment";
import type {
  DiffSettingsState,
  DiffView,
  ReviewAnnotation,
  ReviewLine,
  ReviewNote,
} from "../types";
import { formatFileStatus, formatReviewLine } from "../lib/formatters";
import { parsePreviewFile } from "../lib/parse-preview-file";

type PreviewDiffProps = {
  file: PreviewFileSchema;
  view: DiffView;
  settings: DiffSettingsState;
  notes: ReviewNote[];
  onAddComment: (body: string, line: ReviewLine) => void;
  onDeleteNote: (id: string) => void;
};

type CommentTarget = Pick<ReviewLine, "side" | "lineNumber">;

const sourceLines = (contents: string | null) => {
  if (!contents) return [];
  const lines = contents.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
};

export const PreviewDiff = ({
  file,
  view,
  settings,
  notes,
  onAddComment,
  onDeleteNote,
}: PreviewDiffProps) => {
  const { resolvedTheme } = useTheme();
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(
    null,
  );
  const lines = useMemo(
    () => ({
      additions: sourceLines(file.after),
      deletions: sourceLines(file.before),
    }),
    [file.after, file.before],
  );
  const patch = useMemo(() => parsePreviewFile(file), [file]);
  const openComment = useCallback(
    (target: CommentTarget) => {
      if (commentTarget) return;
      if (
        Number.isInteger(target.lineNumber) &&
        target.lineNumber > 0 &&
        lines[target.side][target.lineNumber - 1] !== undefined
      )
        setCommentTarget(target);
    },
    [lines, commentTarget],
  );
  const annotations = useMemo<DiffLineAnnotation<ReviewAnnotation>[]>(() => {
    const comments: DiffLineAnnotation<ReviewAnnotation>[] = notes.flatMap(
      (note) =>
        note.line
          ? [
              {
                side: note.line.side,
                lineNumber: note.line.lineNumber,
                metadata: { kind: "comment", note },
              },
            ]
          : [],
    );
    if (commentTarget)
      comments.push({ ...commentTarget, metadata: { kind: "composer" } });
    return comments;
  }, [notes, commentTarget]);
  const selectedLines = commentTarget
    ? {
        start: commentTarget.lineNumber,
        end: commentTarget.lineNumber,
        side: commentTarget.side,
      }
    : null;
  const options = useMemo<FileDiffOptions<ReviewAnnotation, undefined>>(
    () => ({
      // Pierre supplies syntax token colors; change markers use Senslop's semantic colors.
      theme: { dark: "pierre-dark", light: "pierre-light" },
      themeType: resolvedTheme === "dark" ? "dark" : "light",
      diffStyle: view,
      disableFileHeader: true,
      hunkSeparators: "line-info",
      expansionLineCount: 20,
      diffIndicators: settings.indicators,
      lineDiffType: settings.inlineChanges,
      disableBackground: !settings.backgrounds,
      overflow: settings.wrapping ? "wrap" : "scroll",
      disableLineNumbers: !settings.lineNumbers,
      // Pierre's native utility tracks gutter width and line height, including hidden numbers.
      enableGutterUtility:
        commentTarget === null &&
        Boolean(lines.additions.length || lines.deletions.length),
      onGutterUtilityClick: ({ start, side }) =>
        openComment({ lineNumber: start, side: side ?? "additions" }),
      onLineNumberClick: ({ lineNumber, annotationSide }) =>
        openComment({ lineNumber, side: annotationSide }),
      loadDiffFiles:
        file.before !== null && file.after !== null
          ? async () => ({
              oldFile: {
                name: file.oldPath ?? file.path,
                contents: file.before!,
              },
              newFile: { name: file.path, contents: file.after! },
            })
          : undefined,
    }),
    [file, view, resolvedTheme, settings, lines, openComment, commentTarget],
  );
  if (file.binary)
    return (
      <div className="m-6 rounded-xl border bg-card p-8">
        <h2 className="font-sans text-xl font-medium">Binary file changed</h2>
        <p className="mt-3 text-muted-foreground">
          {file.path} is included as metadata. Binary contents are not uploaded.
        </p>
      </div>
    );
  if (file.before !== file.after && !patch)
    return (
      <p role="alert" className="m-6 rounded-lg border p-5 text-destructive">
        This patch could not be displayed. Send the preview again from the CLI.
      </p>
    );
  const renderAnnotation = ({ metadata }: { metadata: ReviewAnnotation }) => {
    if (metadata.kind === "composer" && commentTarget)
      return (
        <InlineComment
          key={`${commentTarget.side}:${commentTarget.lineNumber}`}
          onCancel={() => setCommentTarget(null)}
          onSubmit={(body) => {
            onAddComment(body, {
              ...commentTarget,
              code: lines[commentTarget.side][commentTarget.lineNumber - 1]!,
            });
            setCommentTarget(null);
          }}
        />
      );
    if (metadata.kind !== "comment") return null;
    const { note } = metadata;
    return (
      <article className="m-2 space-y-2 rounded-lg border bg-card p-4 font-sans text-base text-card-foreground flex min-w-0 justify-between">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <p className="font-medium">
            {note.line && formatReviewLine(note.line)}
          </p>
          <p className="whitespace-pre-wrap wrap-break-word">{note.body}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete comment"
          onClick={() => onDeleteNote(note.id)}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </Button>
      </article>
    );
  };
  if (file.before === file.after)
    return (
      <div>
        <p className="border-b bg-muted px-5 py-3 text-muted-foreground">
          {formatFileStatus(file.status)} · file contents are unchanged.
        </p>
        <File<ReviewAnnotation>
          file={{ name: file.path, contents: file.after ?? "" }}
          options={{
            theme: options.theme,
            themeType: options.themeType,
            disableFileHeader: true,
            overflow: options.overflow,
            disableLineNumbers: options.disableLineNumbers,
            enableGutterUtility: options.enableGutterUtility,
            onGutterUtilityClick: ({ start }) =>
              openComment({ side: "additions", lineNumber: start }),
            onLineNumberClick: ({ lineNumber }) =>
              openComment({ side: "additions", lineNumber }),
          }}
          lineAnnotations={annotations.map(({ lineNumber, metadata }) => {
            // Narrow each variant for Pierre's conditional annotation metadata type.
            if (metadata.kind === "comment") return { lineNumber, metadata };
            return { lineNumber, metadata };
          })}
          renderAnnotation={renderAnnotation}
          selectedLines={selectedLines}
          className="preview-diff"
        />
      </div>
    );
  return (
    patch && (
      <FileDiff<ReviewAnnotation>
        fileDiff={patch}
        options={options}
        lineAnnotations={annotations}
        renderAnnotation={renderAnnotation}
        selectedLines={selectedLines}
        className="preview-diff"
      />
    )
  );
};
