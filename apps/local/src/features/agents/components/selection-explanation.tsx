"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { useCompletion } from "@ai-sdk/react";
import type { SelectedLineRange } from "@pierre/diffs";
import type { PreviewFileSchema } from "@senslop/contracts";
import { Sparkles, LoaderCircle, X, NotebookPen } from "lucide-react";
import { assignedModel } from "../lib/model-selection";
import { useAiSettings } from "../hooks/use-ai-settings";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AgentMarkdown } from "./agent-markdown";
import { formatExplanationRange } from "../lib/formatters";
import type { ExplainRequestSchema } from "../schemas";

export const SelectionExplanation = ({
  snapshotId,
  file,
  range,
  anchor,
  onDismiss,
  onAddNote,
}: {
  snapshotId: string;
  file: PreviewFileSchema;
  range: SelectedLineRange;
  anchor: ComponentProps<typeof PopoverContent>["anchor"];
  onDismiss: () => void;
  onAddNote?: () => void;
}) => {
  const { settings } = useAiSettings();
  const configured = !!assignedModel(settings.data, "explain");
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  const side = range.side === "deletions" ? "before" : "after";
  const mixed = !!range.endSide && range.endSide !== range.side;
  const id = `${snapshotId}:${file.path}:${side}:${start}:${end}`;
  const { completion, complete, isLoading, error, stop } =
    useCompletion<ExplainRequestSchema>({ api: "/api/agents/explain", id });
  const [requested, setRequested] = useState(false);
  useEffect(() => () => stop(), [id, stop]);
  const explain = () => {
    setRequested(true);
    void complete("Explain the selected code", {
      body: { snapshotId, path: file.path, side, start, end },
    });
  };
  const dismiss = () => {
    stop();
    onDismiss();
  };
  return (
    <Popover
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <PopoverContent
        anchor={anchor}
        align="start"
        side="top"
        sideOffset={8}
        initialFocus={false}
        aria-label="Selected code explanation"
        className={cn(
          "text-base motion-reduce:animate-none motion-reduce:transition-none",
          requested
            ? "w-[min(30rem,calc(100vw-2rem))] max-h-[55dvh] overflow-auto"
            : "w-auto max-w-[calc(100vw-2rem)] p-2 gap-2",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {requested ? (
            <PopoverTitle className="text-base flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Explanation
            </PopoverTitle>
          ) : (
            <Button
              className="text-base"
              variant="ghost"
              disabled={mixed || !configured}
              onClick={explain}
            >
              <Sparkles className="size-4 text-primary" />
              Explain
            </Button>
          )}
          {onAddNote && (
            <Button
              variant="ghost"
              className="text-base"
              disabled={mixed}
              onClick={() => {
                stop();
                onAddNote();
              }}
            >
              <NotebookPen aria-hidden="true" className="size-4" /> Add note
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close explanation"
            onClick={dismiss}
          >
            <X className="size-4" />
          </Button>
        </div>
        {!configured && (
          <p className="text-muted-foreground">
            Choose an Explain model in AI settings to explain code.
          </p>
        )}
        {mixed && (
          <p className="text-muted-foreground">
            Select lines on one side of the diff to explain them or add a note.
          </p>
        )}
        {requested && (
          <>
            <p className="text-muted-foreground">
              {formatExplanationRange(range)}
            </p>
            {isLoading && !completion && (
              <p
                role="status"
                className="flex items-center gap-2 text-muted-foreground"
              >
                <LoaderCircle className="size-4 motion-safe:animate-spin" />
                Understanding selected code…
              </p>
            )}
            {completion && (
              <div className="motion-safe:animate-in motion-safe:fade-in duration-200">
                <AgentMarkdown streaming={isLoading}>
                  {completion}
                </AgentMarkdown>
              </div>
            )}
            {error && (
              <p role="alert" className="text-destructive">
                {error.message}
              </p>
            )}
            <Button
              className="text-base"
              variant="outline"
              disabled={!isLoading && !configured}
              onClick={isLoading ? stop : explain}
            >
              {isLoading ? "Stop" : "Retry explanation"}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};
