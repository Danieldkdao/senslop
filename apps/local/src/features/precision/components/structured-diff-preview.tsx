"use client";

import { useMemo, type ReactNode } from "react";
import { Braces, Code, ArrowRight, ChevronDown } from "lucide-react";
import type { PreviewFileSchema } from "@senslop/contracts";
import {
  ExpandingTabs,
  ExpandingTabsPanel,
} from "@senslop/ui/components/expanding-tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { compareStructuredData } from "../lib/structured-diff";
import { formatStructuredChange } from "../lib/formatters";

export const StructuredDiffPreview = ({
  file,
  children,
}: {
  file: PreviewFileSchema;
  children: ReactNode;
}) => {
  const comparison = useMemo(
    () =>
      file.path.endsWith(".json") && !file.binary
        ? compareStructuredData(file.before, file.after)
        : null,
    [file],
  );
  if (!comparison) return children;
  return (
    <ExpandingTabs
      aria-label="Structured data view"
      variant="transparent"
      defaultValue="diff"
      items={[
        { value: "diff", label: "Text diff", icon: <Code /> },
        {
          value: "structure",
          label: "JSON structure",
          icon: <Braces />,
          detail: comparison.changes.length,
        },
      ]}
      listClassName="m-3 w-auto"
      className="gap-0"
    >
      <ExpandingTabsPanel value="diff">{children}</ExpandingTabsPanel>
      <ExpandingTabsPanel
        value="structure"
        className="flex flex-col gap-3 px-4 pb-4 text-base"
      >
        {comparison.error ? (
          <p role="status" className="text-muted-foreground">
            {comparison.error}
          </p>
        ) : (
          <>
            {!comparison.changes.length && (
              <p className="text-muted-foreground">
                No structural changes. Formatting differences remain in the text
                diff.
              </p>
            )}
            {comparison.changes.map((change) => {
              const display = formatStructuredChange(change.kind);
              return (
                <Collapsible
                  key={change.path}
                  defaultOpen
                  className="rounded-lg border p-3"
                >
                  <CollapsibleTrigger
                    render={
                      <Button
                        variant="ghost"
                        className="group flex h-auto w-full items-center gap-2 p-0 text-left text-base"
                      />
                    }
                  >
                    <display.Icon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 break-all font-mono">
                      {change.path}
                    </span>
                    <span className="text-muted-foreground">
                      {display.label}
                    </span>
                    <ChevronDown className="size-4 shrink-0 transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-hidden">
                    <div className="flex flex-col gap-3 pt-3 md:flex-row">
                      {change.before !== null && (
                        <pre className="min-w-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-base">
                          {change.before}
                        </pre>
                      )}
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      {change.after !== null && (
                        <pre className="min-w-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-base">
                          {change.after}
                        </pre>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
            {comparison.limited && (
              <p className="text-muted-foreground">
                Structural preview reached its limit. The full text diff remains
                available.
              </p>
            )}
          </>
        )}
      </ExpandingTabsPanel>
    </ExpandingTabs>
  );
};
