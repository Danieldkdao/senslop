"use client";

import { useCallback, useMemo, useState, useRef } from "react";
import { useTheme } from "next-themes";
import { FileDiff, File, type FileDiffOptions } from "@pierre/diffs/react";
import type { DiffLineAnnotation, SelectedLineRange } from "@pierre/diffs";
import type { PreviewFileSchema } from "@senslop/contracts";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectionExplanation } from "../../agents/components/selection-explanation";
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
import { getDiffOptions } from "../lib/diff-options";
import { useDiffHighlighter } from "../hooks/use-diff-highlighter";
import { DiffRenderState } from "./diff-render-state";

type PreviewDiffProps = {
  file: PreviewFileSchema;
  view: DiffView;
  settings: DiffSettingsState;
  notes: ReviewNote[];
  onAddComment: (body: string, line: ReviewLine) => void | Promise<void>;
  snapshotId?: string;
  evidence?: { side: "before" | "after"; start: number; end: number } | null;
  onDeleteNote: (id: string) => void | Promise<void>;
};

type CommentTarget = Pick<ReviewLine, "side" | "lineNumber" | "endLineNumber">;

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
  snapshotId,
  evidence,
}: PreviewDiffProps) => {
  const { resolvedTheme } = useTheme();
  const [commentTarget, setCommentTarget] = useState<CommentTarget | null>(
    null,
  );
  const commentPending = useRef(false);
  const selectionGesture = useRef(false);
  const [selectedRange, setSelectedRange] = useState<SelectedLineRange | null>(
    null,
  );
  const [hoveredNoteId, setHoveredNoteId] = useState<string | null>(null);
  const hoveredNote = notes.find((note) => note.id === hoveredNoteId)?.line;
  const host = useRef<HTMLElement | null>(null);
  const selectionAnchor = useMemo(
    () => ({
      get contextElement() {
        return host.current ?? undefined;
      },
      getBoundingClientRect: () => {
        const shadow = host.current?.shadowRoot;
        const lineNumber = selectedRange
          ? Math.min(selectedRange.start, selectedRange.end)
          : 1;
        const selected = `[data-line="${lineNumber}"]`;
        const side = selectedRange?.side ?? "additions";
        const line =
          shadow?.querySelector<HTMLElement>(
            `[data-code][data-${side}] ${selected}`,
          ) ??
          shadow?.querySelector<HTMLElement>(
            `[data-code] ${selected}[data-line-type="${side === "deletions" ? "change-deletion" : "change-addition"}"]`,
          ) ??
          shadow?.querySelector<HTMLElement>(`[data-code] ${selected}`);
        // Pierre replaces highlighted rows; resolve their geometry at each positioning pass.
        return (line ?? host.current)?.getBoundingClientRect() ?? new DOMRect();
      },
    }),
    [selectedRange],
  );
  const lines = useMemo(
    () => ({
      additions: sourceLines(file.after),
      deletions: sourceLines(file.before),
    }),
    [file.after, file.before],
  );
  const patch = useMemo(() => parsePreviewFile(file), [file]);
  const highlighter = useDiffHighlighter(
    file.binary ? null : file.path,
    file.oldPath ?? undefined,
    patch?.lang,
  );
  const openComment = useCallback(
    (target: CommentTarget) => {
      if (commentTarget) return;
      setSelectedRange(null);
      if (
        Number.isInteger(target.lineNumber) &&
        target.lineNumber > 0 &&
        lines[target.side][target.lineNumber - 1] !== undefined &&
        (target.endLineNumber ?? target.lineNumber) >= target.lineNumber &&
        lines[target.side][(target.endLineNumber ?? target.lineNumber) - 1] !==
          undefined
      ) {
        commentPending.current = true;
        setCommentTarget(target);
      }
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
                lineNumber: note.line.endLineNumber ?? note.line.lineNumber,
                metadata: { kind: "comment", note },
              },
            ]
          : [],
    );
    if (commentTarget)
      comments.push({
        side: commentTarget.side,
        lineNumber: commentTarget.endLineNumber ?? commentTarget.lineNumber,
        metadata: { kind: "composer" },
      });
    return comments;
  }, [notes, commentTarget]);
  const activeNoteRange = commentTarget ?? hoveredNote;
  const selectedLines = useMemo<SelectedLineRange | null>(
    () =>
      activeNoteRange
        ? {
            start: activeNoteRange.lineNumber,
            end: activeNoteRange.endLineNumber ?? activeNoteRange.lineNumber,
            side: activeNoteRange.side,
          }
        : (selectedRange ??
          (evidence
            ? {
                start: evidence.start,
                end: evidence.end,
                side:
                  evidence.side === "before"
                    ? ("deletions" as const)
                    : ("additions" as const),
              }
            : null)),
    [activeNoteRange, selectedRange, evidence],
  );
  const closeComment = () => {
    commentPending.current = false;
    setCommentTarget(null);
  };
  const onLineSelected = useCallback(
    (range: SelectedLineRange | null) => {
      // Pierre echoes controlled highlights; only gestures can recommit the same range.
      const echo =
        range?.start === selectedLines?.start &&
        range?.end === selectedLines?.end &&
        range?.side === selectedLines?.side &&
        range?.endSide === selectedLines?.endSide;
      if (!commentPending.current && (!echo || selectionGesture.current))
        setSelectedRange(range);
      selectionGesture.current = false;
    },
    [selectedLines],
  );
  const onLineSelectionEnd = useCallback(() => {
    selectionGesture.current = true;
  }, []);
  const revealedEvidence = useRef<PreviewDiffProps["evidence"]>(null);
  const revealEvidence = useCallback(
    (node: HTMLElement, _instance: unknown, phase: string) => {
      host.current = phase === "unmount" ? null : node;
      if (!evidence || phase === "unmount") return;
      requestAnimationFrame(() => {
        const line = node.shadowRoot?.querySelector<HTMLElement>(
          "[data-line][data-selected-line]",
        );
        const scroller = node.closest<HTMLElement>("[data-review-scroll]");
        if (
          line &&
          scroller &&
          node.isConnected &&
          revealedEvidence.current !== evidence
        ) {
          revealedEvidence.current = evidence;
          const bounds = scroller.getBoundingClientRect();
          const target = line.getBoundingClientRect();
          scroller.scrollTo({
            top: Math.max(
              0,
              scroller.scrollTop +
                target.top -
                bounds.top -
                (bounds.height - target.height) / 2,
            ),
          });
        }
      });
    },
    [evidence],
  );
  const options = useMemo<FileDiffOptions<ReviewAnnotation, undefined>>(
    () => ({
      ...getDiffOptions(settings, view, resolvedTheme),
      onPostRender: revealEvidence,
      enableLineSelection: commentTarget === null,
      controlledSelection: true,
      onLineSelected,
      onLineSelectionEnd,
      // Pierre's native utility tracks gutter width and line height, including hidden numbers.
      enableGutterUtility:
        commentTarget === null &&
        Boolean(lines.additions.length || lines.deletions.length),
      onGutterUtilityClick: ({ start, side }) =>
        openComment({ lineNumber: start, side: side ?? "additions" }),
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
    [
      file,
      view,
      resolvedTheme,
      settings,
      lines,
      openComment,
      commentTarget,
      revealEvidence,
      onLineSelected,
      onLineSelectionEnd,
    ],
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
  if (!highlighter.ready)
    return (
      <DiffRenderState error={highlighter.error} onRetry={highlighter.retry} />
    );
  const renderAnnotation = ({ metadata }: { metadata: ReviewAnnotation }) => {
    if (metadata.kind === "composer" && commentTarget)
      return (
        <div>
          <InlineComment
            key={`${commentTarget.side}:${commentTarget.lineNumber}`}
            onCancel={closeComment}
            onSubmit={async (body) => {
              await onAddComment(body, {
                ...commentTarget,
                code: lines[commentTarget.side]
                  .slice(
                    commentTarget.lineNumber - 1,
                    commentTarget.endLineNumber ?? commentTarget.lineNumber,
                  )
                  .join("\n"),
              });
              closeComment();
            }}
          />
        </div>
      );
    if (metadata.kind !== "comment") return null;
    const { note } = metadata;
    return (
      <article
        onMouseEnter={() => setHoveredNoteId(note.id)}
        onMouseLeave={() => setHoveredNoteId(null)}
        onFocus={() => setHoveredNoteId(note.id)}
        onBlur={() => setHoveredNoteId(null)}
        className="m-2 rounded-lg border bg-card px-4 py-4 font-sans text-base text-card-foreground flex flex-col gap-1.5 min-w-0 relative group"
      >
        <p className="pr-10 font-medium font-mono">
          {note.line && formatReviewLine(note.line)}
        </p>
        <p className="whitespace-pre-wrap wrap-break-word">{note.body}</p>
        <Button
          variant="destructive"
          size="icon"
          aria-label="Delete comment"
          onClick={() =>
            void Promise.resolve(onDeleteNote(note.id)).catch(() => {})
          }
          className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </Button>
      </article>
    );
  };
  const explanation = selectedRange && snapshotId && (
    <SelectionExplanation
      key={`${selectedRange.side}:${selectedRange.start}:${selectedRange.endSide}:${selectedRange.end}`}
      snapshotId={snapshotId}
      file={file}
      range={selectedRange}
      anchor={selectionAnchor}
      onDismiss={() => setSelectedRange(null)}
      onAddNote={() => {
        if (
          selectedRange.endSide &&
          selectedRange.endSide !== selectedRange.side
        )
          return;
        const start = Math.min(selectedRange.start, selectedRange.end);
        const end = Math.max(selectedRange.start, selectedRange.end);
        openComment({
          side: selectedRange.side ?? "additions",
          lineNumber: start,
          ...(end !== start ? { endLineNumber: end } : {}),
        });
      }}
    />
  );
  if (file.before === file.after)
    return (
      <div>
        <p className="border-b bg-muted px-5 py-3 text-muted-foreground">
          {formatFileStatus(file.status)}, file contents are unchanged.
        </p>
        <File<ReviewAnnotation>
          file={{ name: file.path, contents: file.after ?? "" }}
          options={{
            onPostRender: revealEvidence,
            theme: options.theme,
            themeType: options.themeType,
            disableFileHeader: true,
            overflow: options.overflow,
            disableLineNumbers: options.disableLineNumbers,
            enableGutterUtility: options.enableGutterUtility,
            onGutterUtilityClick: ({ start }) =>
              openComment({ side: "additions", lineNumber: start }),
            enableLineSelection: commentTarget === null,
            controlledSelection: true,
            onLineSelected,
            onLineSelectionEnd,
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
        {explanation}
      </div>
    );
  return (
    patch && (
      <>
        <FileDiff<ReviewAnnotation>
          fileDiff={patch}
          options={options}
          lineAnnotations={annotations}
          renderAnnotation={renderAnnotation}
          selectedLines={selectedLines}
          className="preview-diff"
        />
        {explanation}
      </>
    )
  );
};
