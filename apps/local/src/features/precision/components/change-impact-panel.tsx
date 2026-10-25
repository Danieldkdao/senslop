"use client";

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { ArrowRight, GitBranch } from "lucide-react";
import type {
  ChangeImpactSchema,
  LanguageCapabilitySchema,
  SourceRelationshipSchema,
} from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  formatLanguageLevel,
  formatRelationshipKind,
  formatRelationshipProvenance,
} from "../lib/formatters";
import type { SourceLocationSchema, SourceSymbolSchema } from "../schemas";

export const ChangeImpactPanel = ({
  impact,
  capability,
  symbols,
  side = "after",
  onNavigate,
}: {
  impact?: ChangeImpactSchema;
  capability?: LanguageCapabilitySchema;
  symbols: SourceSymbolSchema[];
  side?: "before" | "after";
  onNavigate: (location: SourceLocationSchema) => void;
}) => {
  const capabilityDisplay = capability
    ? formatLanguageLevel(capability.level)
    : null;
  const relationship = (item: SourceRelationshipSchema, index: number) => {
    const display = formatRelationshipProvenance(item.provenance);
    return (
      <div
        key={`${item.path}:${item.start}:${index}`}
        className="flex items-start gap-2"
      >
        <TooltipWrapper content={`${display.label}: ${item.explanation}`}>
          <display.Icon
            className="h-lh w-4 shrink-0 text-muted-foreground"
            aria-label={display.label}
          />
        </TooltipWrapper>
        <Button
          variant="link"
          className="h-auto min-w-0 flex-1 justify-start whitespace-normal p-0 text-left font-mono text-base"
          disabled={item.provenance === "unresolved"}
          onClick={() =>
            onNavigate({
              path: item.path,
              side: item.side ?? side,
              start: item.start,
              end: item.end,
            })
          }
        >
          {item.path}:{item.start}
          <span className="sr-only">{item.explanation}</span>
        </Button>
      </div>
    );
  };
  return (
    <section
      aria-label="Change impact and source navigation"
      className="flex shrink-0 flex-col gap-2 border-b px-4 py-2 text-base"
    >
      <Collapsible className="flex min-w-0 flex-col">
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              className="group flex h-11 w-full shrink-0 items-center justify-start gap-2 px-0 text-left text-base font-medium hover:bg-transparent! dark:hover:bg-transparent!"
            />
          }
        >
          <span className="inline-flex items-center gap-2">
            <GitBranch className="size-4" />
            Impact
            {impact?.reasons.length ? ` (${impact.reasons.length})` : ""}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
          <div className="flex max-h-[35dvh] flex-col gap-3 overflow-auto scroll-fade-y py-3">
            {impact?.reasons.length ? (
              impact.reasons.map((reason) => <p key={reason}>{reason}</p>)
            ) : (
              <p className="text-muted-foreground">
                No specific attention reason was established in captured
                context.
              </p>
            )}
            {(
              [
                "caller",
                "reference",
                "dependency",
                "dependent",
                "test",
              ] as const
            ).map((kind) => {
              const items =
                impact?.relationships.filter((item) => item.kind === kind) ??
                [];
              if (!items.length) return null;
              const display = formatRelationshipKind(kind);
              return (
                <Collapsible key={kind}>
                  <CollapsibleTrigger className="group relative w-full min-w-0 pr-7 text-left cursor-pointer">
                    {display.label} ({items.length})
                    <ChevronDown
                      aria-hidden="true"
                      className="absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
                    <div className="flex flex-col gap-2 py-2">
                      {items.map(relationship)}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
            {capability && capabilityDisplay && (
              <TooltipWrapper content={capabilityDisplay.label}>
                <span
                  tabIndex={0}
                  className="flex items-center gap-2 text-muted-foreground"
                >
                  <capabilityDisplay.Icon
                    aria-hidden="true"
                    className="size-4"
                  />
                  {capability.language}
                  <span>{capabilityDisplay.label}</span>
                </span>
              </TooltipWrapper>
            )}
            {impact?.limitations.map((limitation) => (
              <p key={limitation} className="text-muted-foreground">
                {limitation}
              </p>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
      {!!symbols.length && (
        <Collapsible>
          <CollapsibleTrigger className="group relative w-full min-w-0 pr-7 text-left cursor-pointer text-muted-foreground">
            Symbols in this file
            <ChevronDown
              aria-hidden="true"
              className="absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
            <div className="flex max-h-64 flex-col gap-3 overflow-auto py-2">
              {symbols.map((symbol) => (
                <Collapsible key={`${symbol.name}:${symbol.start}`}>
                  <CollapsibleTrigger className="group relative w-full min-w-0 pr-7 text-left cursor-pointer font-mono">
                    {symbol.name}
                    <ChevronDown
                      aria-hidden="true"
                      className="absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
                    <div className="flex flex-col gap-2 py-2">
                      <Button
                        variant="link"
                        className="h-auto justify-start p-0 text-base"
                        onClick={() =>
                          onNavigate({
                            path: symbol.path,
                            side,
                            start: symbol.start,
                            end: symbol.end,
                          })
                        }
                      >
                        <ArrowRight className="size-4" />
                        Definition
                      </Button>
                      {symbol.references
                        .slice(0, 100)
                        .map((reference, index) => (
                          <Button
                            key={index}
                            variant="link"
                            className="h-auto justify-start whitespace-normal p-0 text-left font-mono text-base"
                            onClick={() =>
                              onNavigate({
                                path: reference.path,
                                side,
                                start: reference.line,
                                end: reference.line,
                              })
                            }
                          >
                            {reference.path}:{reference.line}
                          </Button>
                        ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  );
};
