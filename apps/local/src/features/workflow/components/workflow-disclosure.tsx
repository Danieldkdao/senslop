"use client";

import type { ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export const WorkflowChevron = () => (
  <span className="flex h-lh shrink-0 items-center">
    <ChevronDown
      aria-hidden="true"
      className="size-5 shrink-0 transition-transform duration-200 group-data-[panel-open]/collapsible-trigger:rotate-180 motion-reduce:transition-none"
    />
  </span>
);

export const WorkflowDisclosure = ({
  title,
  Icon,
  children,
  destructive = false,
  defaultOpen = false,
  iconLabel,
  loading = false,
}: {
  title: string;
  Icon: LucideIcon;
  children: ReactNode;
  destructive?: boolean;
  defaultOpen?: boolean;
  iconLabel?: string;
  loading?: boolean;
}) => (
  <Collapsible
    defaultOpen={defaultOpen}
    className={cn(
      "min-w-0 border-t pt-3 text-base",
      destructive && "text-destructive",
    )}
  >
    <CollapsibleTrigger
      aria-label={title}
      className="flex w-full items-start gap-2 text-left leading-6 font-medium"
    >
      {iconLabel ? (
        <TooltipWrapper content={iconLabel} className="h-lh items-center">
          <span
            aria-label={iconLabel}
            className="flex h-lh shrink-0 items-center"
          >
            <Icon
              aria-hidden="true"
              className={cn("size-5 shrink-0", loading && "animate-spin")}
            />
          </span>
        </TooltipWrapper>
      ) : (
        <span className="flex h-lh shrink-0 items-center">
          <Icon
            aria-hidden="true"
            className={cn("size-5 shrink-0", loading && "animate-spin")}
          />
        </span>
      )}
      <span className="min-w-0 flex-1">{title}</span>
      <WorkflowChevron />
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className="min-w-0 pt-3">{children}</div>
    </CollapsibleContent>
  </Collapsible>
);
