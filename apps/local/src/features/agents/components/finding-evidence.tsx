"use client";

import { useMemo } from "react";
import { FileDiff } from "@pierre/diffs/react";
import type { PreviewFileSchema } from "@senslop/contracts";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUiPreferences } from "../../settings/hooks/use-ui-preferences";
import { useDiffHighlighter } from "../../review/hooks/use-diff-highlighter";
import { getDiffOptions, getDiffStyle } from "../../review/lib/diff-options";
import { findingDiff } from "../lib/finding-diff";
import { formatExplanationRange } from "../lib/formatters";
import { DiffRenderState } from "../../review/components/diff-render-state";
import type { FindingSchema } from "../schemas";

export const FindingEvidence = ({
  finding,
  file,
  onEvidence,
}: {
  finding: FindingSchema;
  file?: PreviewFileSchema;
  onEvidence?: (finding: FindingSchema) => void;
}) => {
  const { values } = useUiPreferences();
  const settings = values.editor;
  const { systemTheme } = useTheme();
  const patch = useMemo(
    () => (file ? findingDiff(file, finding) : null),
    [file, finding],
  );
  const highlighter = useDiffHighlighter(
    patch ? finding.path : null,
    file?.oldPath ?? undefined,
    patch?.lang,
    settings.theme,
  );
  const options = useMemo(
    () => ({
      ...getDiffOptions(settings, "unified", systemTheme),
      disableFileHeader: false,
      stickyHeader: true,
      hunkSeparators: "simple" as const,
      collapsedContextThreshold: 0,
    }),
    [settings, systemTheme],
  );
  const header = (
    <Button
      variant="link"
      className="h-auto w-full min-w-0 justify-start whitespace-normal p-0 text-left text-base"
      disabled={!onEvidence || !patch}
      onClick={() => onEvidence?.(finding)}
    >
      <span className="min-w-0 wrap-anywhere">{finding.path}</span>
    </Button>
  );
  return (
    <div className="min-w-0 overflow-hidden rounded-md border">
      {!patch || !highlighter.ready ? (
        <>
          <div className="flex min-w-0 border-b bg-muted px-3 py-2">
            {header}
          </div>
          {!patch ? (
            <div className="flex min-w-0 flex-col gap-2 p-3">
              <p className="text-base text-muted-foreground">
                Diff unavailable for this review round. Saved excerpt:
              </p>
              <p className="text-base text-muted-foreground">
                {formatExplanationRange({
                  side: finding.side === "before" ? "deletions" : "additions",
                  start: finding.start,
                  end: finding.end,
                })}
              </p>
              <pre className="max-h-80 max-w-full overflow-auto text-base">
                <code>{finding.code}</code>
              </pre>
            </div>
          ) : (
            <DiffRenderState
              error={highlighter.error}
              onRetry={highlighter.retry}
            />
          )}
        </>
      ) : (
        <div className="max-h-80 overflow-auto">
          <FileDiff
            fileDiff={patch}
            options={options}
            selectedLines={{
              side: finding.side === "before" ? "deletions" : "additions",
              start: finding.start,
              end: finding.end,
            }}
            renderCustomHeader={() => (
              <div className="min-w-0 px-3 py-2">{header}</div>
            )}
            className={cn(
              "preview-diff",
              settings.theme === "default" && "preview-diff-default",
              settings.theme === "default" &&
                systemTheme === "dark" &&
                "preview-diff-default-dark",
            )}
            style={getDiffStyle(settings)}
          />
        </div>
      )}
    </div>
  );
};
