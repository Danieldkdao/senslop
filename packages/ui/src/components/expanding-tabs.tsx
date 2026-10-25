"use client";

import { useState, type ReactNode } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { cva, VariantProps } from "class-variance-authority";

export type ExpandingTabItem = {
  value: string;
  label: string;
  icon: ReactNode;
  detail?: ReactNode;
  disabled?: boolean;
  tooltip?: string;
};

export type ExpandingTabsProps = Omit<
  Tabs.Root.Props,
  "value" | "defaultValue" | "onValueChange" | "orientation" | "className"
> & {
  items: readonly ExpandingTabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  listClassName?: string;
  "aria-label"?: string;
};

const tabsListVariants = cva(
  "group/tabs-list flex w-full min-w-0 shrink-0 items-center gap-1 rounded-xl bg-muted p-1",
  {
    variants: {
      variant: {
        default: "bg-muted",
        transparent:
          "bg-transparent border-none shadow-none [&_[role=tab]]:border-none [&_[role=tab]]:shadow-none px-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export const ExpandingTabs = ({
  items,
  variant = "default",
  value,
  defaultValue,
  onValueChange,
  children,
  className,
  listClassName,
  "aria-label": label = "Views",
  ...props
}: ExpandingTabsProps & VariantProps<typeof tabsListVariants>) => {
  const [internalValue, setInternalValue] = useState(
    defaultValue ?? items.find((item) => !item.disabled)?.value,
  );
  const selected = value ?? internalValue;
  return (
    <Tabs.Root
      {...props}
      value={selected}
      onValueChange={(next) => {
        if (typeof next !== "string") return;
        if (value === undefined) setInternalValue(next);
        onValueChange?.(next);
      }}
      className={cn("flex min-h-0 min-w-0 flex-col gap-2", className)}
    >
      <Tabs.List
        aria-label={label}
        onKeyDown={(event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            event.stopPropagation();
        }}
        className={cn(tabsListVariants({ variant }), listClassName)}
      >
        {items.map((item) => {
          const expanded = item.value === selected;
          return (
            <Tooltip key={item.value}>
              <TooltipTrigger
                render={
                  <Tabs.Tab
                    value={item.value}
                    disabled={item.disabled}
                    aria-label={item.label}
                    data-expanded={expanded}
                    style={{ flex: expanded ? "1 1 0%" : "0 0 2.75rem" }}
                    className={cn(
                      "flex h-11 min-w-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg px-3 text-base font-medium text-muted-foreground transition-[flex,gap,background-color,color] duration-300 ease-in-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50 motion-reduce:transition-none",
                      expanded
                        ? "gap-2 bg-background text-foreground shadow-sm"
                        : "gap-0",
                    )}
                  />
                }
              >
                <span
                  aria-hidden="true"
                  className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-5"
                >
                  {item.icon}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap transition-[opacity,max-width] duration-300 motion-reduce:transition-none",
                    expanded
                      ? "max-w-full opacity-100"
                      : "max-w-0 flex-none opacity-0",
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  {item.detail !== undefined && (
                    <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                      {item.detail}
                    </span>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-base">
                {item.tooltip ?? item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </Tabs.List>
      {children}
    </Tabs.Root>
  );
};

export type ExpandingTabsPanelProps = Omit<Tabs.Panel.Props, "className"> & {
  className?: string;
};

export const ExpandingTabsPanel = ({
  className,
  ...props
}: ExpandingTabsPanelProps) => (
  <Tabs.Panel
    {...props}
    className={cn("min-h-0 min-w-0 flex-1 outline-none", className)}
  />
);
