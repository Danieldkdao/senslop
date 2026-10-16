"use client";

import { ChevronDown, Sparkles } from "lucide-react";
import type { PreviewFileSchema } from "@senslop/contracts";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import type { GroupingSchema } from "../schemas";

export const FileSummary = ({
  file,
  grouping,
  onSelect,
}: {
  file: PreviewFileSchema;
  grouping?: GroupingSchema | null;
  onSelect: (path: string) => void;
}) => {
  const group = grouping?.groups.find((group) =>
    group.files.some((member) => member.path === file.path),
  );
  const summary = group?.files.find((member) => member.path === file.path);
  if (!summary) return null;
  return (
    <Collapsible defaultOpen className="shrink-0 border-b bg-muted/30">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-5 py-3 text-left text-base font-medium hover:bg-muted/50">
        <Sparkles aria-hidden="true" className="size-4 text-primary" />
        Summary
        <ChevronDown
          aria-hidden="true"
          className="ml-auto size-4 transition-transform group-data-open:rotate-180 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
        <div className="max-h-[35dvh] overflow-auto flex flex-col gap-3 px-5 pb-4">
          <p>{summary.summary}</p>
          {group && (
            <p className="text-muted-foreground">
              {group.title}: {group.rationale}
            </p>
          )}
          {summary.related.length > 0 && (
            <div
              className="flex flex-wrap gap-x-4 gap-y-2"
              aria-label="Related changed files"
            >
              {summary.related.map((path) => (
                <Button
                  key={path}
                  variant="link"
                  className="h-auto whitespace-normal break-all p-0 text-base"
                  onClick={() => onSelect(path)}
                >
                  {path}
                </Button>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
