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
    <Collapsible defaultOpen className="shrink-0 border-b">
      <CollapsibleTrigger className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-base font-medium text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <Sparkles aria-hidden="true" className="size-5 shrink-0 text-primary" />
        Summary
        <ChevronDown
          aria-hidden="true"
          className="ml-auto size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[panel-open]/collapsible-trigger:rotate-180 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex max-h-[35dvh] scroll-fade-y flex-col gap-3 overflow-auto px-4 pb-3">
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
