"use client";

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ArrowRight, Braces, ChevronDown, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
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
            className="size-5 shrink-0 text-muted-foreground"
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
      className="flex shrink-0 flex-col text-base"
    >
      <Collapsible className={cn("min-w-0", !!symbols.length && "border-b")}>
        <CollapsibleTrigger className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-base font-medium text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <GitBranch
            aria-hidden="true"
            className="size-5 shrink-0 text-primary"
          />
          <span>
            Impact{impact?.reasons.length ? ` (${impact.reasons.length})` : ""}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="ml-auto size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[panel-open]/collapsible-trigger:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex max-h-[35dvh] scroll-fade-y flex-col gap-3 overflow-auto px-4 pb-3">
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
                  <CollapsibleTrigger className="relative w-full min-w-0 cursor-pointer pr-7 text-left text-base">
                    {display.label} ({items.length})
                    <ChevronDown
                      aria-hidden="true"
                      className="absolute right-1 top-1/2 size-5 -translate-y-1/2 text-muted-foreground transition-transform group-data-[panel-open]/collapsible-trigger:rotate-180 motion-reduce:transition-none"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
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
                    className="size-5"
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
          <CollapsibleTrigger className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-base font-medium text-foreground outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <Braces
              aria-hidden="true"
              className="size-5 shrink-0 text-primary"
            />
            Symbols in this file
            <ChevronDown
              aria-hidden="true"
              className="ml-auto size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[panel-open]/collapsible-trigger:rotate-180 motion-reduce:transition-none"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex max-h-64 scroll-fade-y flex-col gap-3 overflow-auto px-4 pb-3">
              {symbols.map((symbol) => (
                <Collapsible key={`${symbol.name}:${symbol.start}`}>
                  <CollapsibleTrigger className="relative w-full min-w-0 cursor-pointer pr-7 text-left font-mono text-base">
                    {symbol.name}
                    <ChevronDown
                      aria-hidden="true"
                      className="absolute right-1 top-1/2 size-5 -translate-y-1/2 text-muted-foreground transition-transform group-data-[panel-open]/collapsible-trigger:rotate-180 motion-reduce:transition-none"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
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
                        <ArrowRight className="size-5" />
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
