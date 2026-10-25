"use client";

import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Files, GitBranch, SlidersHorizontal, ListFilter } from "lucide-react";
import type {
  ChangeImpactSchema,
  OrganizationSchema,
  OrganizationActionSchema,
  ReviewUnitSchema,
} from "@senslop/contracts";
import {
  ExpandingTabs,
  ExpandingTabsPanel,
} from "@senslop/ui/components/expanding-tabs";
import { FileIcon } from "@/components/file-icon";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import { formatUnitStatus } from "../lib/formatters";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  isRepetitiveUnit,
  orderUnitsByAttention,
} from "../lib/review-presentation";
import { OrganizationEditor } from "./organization-editor";

type RegionBrowserProps = {
  impact?: ChangeImpactSchema[];
  organization: OrganizationSchema;
  selectedUnitId?: string;
  onSelect: (id: string) => void;
  onAction: (operation: OrganizationActionSchema) => Promise<unknown>;
};

export const RegionBrowser = ({
  organization,
  impact = [],
  selectedUnitId,
  onSelect,
  onAction,
}: RegionBrowserProps) => {
  const [editing, setEditing] = useState(false);
  const [attention, setAttention] = useState(false);
  const [collapseRepetitive, setCollapseRepetitive] = useState(true);
  const [expansion, setExpansion] = useState(() => ({
    selectedUnitId,
    repetitive: {} as Record<string, boolean>,
    flows: Object.fromEntries(
      organization.flows.map((flow) => [
        flow.id,
        !!selectedUnitId && flow.unitIds.includes(selectedUnitId),
      ]),
    ),
    files: Object.fromEntries(
      organization.units
        .filter((unit) => unit.id === selectedUnitId)
        .map((unit) => [unit.path, true]),
    ),
  }));
  if (expansion.selectedUnitId !== selectedUnitId) {
    const selected = organization.units.find(
      (unit) => unit.id === selectedUnitId,
    );
    const flow = organization.flows.find((flow) =>
      flow.unitIds.includes(selectedUnitId ?? ""),
    );
    setExpansion({
      selectedUnitId,
      repetitive: {
        ...expansion.repetitive,
        ...(selected &&
          isRepetitiveUnit(selected) && {
            [`flows-${flow?.id}`]: true,
            [`files-${selected.path}`]: true,
          }),
      },
      flows: { ...expansion.flows, ...(flow && { [flow.id]: true }) },
      files: { ...expansion.files, ...(selected && { [selected.path]: true }) },
    });
  }
  const paths = [...new Set(organization.units.map((unit) => unit.path))];
  const reviewed = organization.units.filter((unit) => unit.reviewed).length;
  const reviewedFiles = paths.filter((path) =>
    organization.units
      .filter((unit) => unit.path === path)
      .every((unit) => unit.reviewed),
  ).length;
  const row = (unit: ReviewUnitSchema) => {
    const status = formatUnitStatus(unit);
    return (
      <button
        key={unit.id}
        type="button"
        onClick={() => onSelect(unit.id)}
        aria-current={unit.id === selectedUnitId ? "true" : undefined}
        aria-label={`${unit.path}: ${unit.label}, ${status.label}`}
        className={cn(
          "flex w-full cursor-pointer items-start gap-3 rounded-lg border border-transparent px-3 py-3 text-left text-base leading-6 hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring",
          unit.id === selectedUnitId && "bg-sidebar-accent",
          unit.reviewed && "border-success/30 bg-success/10",
        )}
      >
        <TooltipWrapper content={status.label}>
          <status.Icon
            aria-hidden="true"
            className={cn(
              "h-lh w-4 shrink-0 text-muted-foreground",
              unit.reviewed && "text-success",
            )}
          />
        </TooltipWrapper>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="break-all font-mono">{unit.path}</span>
          <span className="text-muted-foreground">{unit.label}</span>
        </span>
      </button>
    );
  };
  const renderUnits = (units: ReviewUnitSchema[], section: string) => {
    const ordered = attention ? orderUnitsByAttention(units, impact) : units;
    const collapsed = collapseRepetitive
      ? ordered.filter(isRepetitiveUnit)
      : [];
    return (
      <>
        {ordered.filter((unit) => !collapsed.includes(unit)).map(row)}
        {!!collapsed.length && (
          <Collapsible
            open={
              expansion.repetitive[section] ??
              collapsed.some((unit) => unit.id === selectedUnitId)
            }
            onOpenChange={(open) =>
              setExpansion((current) => ({
                ...current,
                repetitive: { ...current.repetitive, [section]: open },
              }))
            }
            className="my-2 rounded-lg border"
          >
            <CollapsibleTrigger className="group flex min-h-11 w-full items-center gap-2 px-3 text-left text-base text-muted-foreground">
              <span className="flex-1">
                {collapsed.length} generated or repetitive regions
              </span>
              <ChevronDown className="size-4 transition-transform group-data-panel-open:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden">
              {collapsed.map(row)}
            </CollapsibleContent>
          </Collapsible>
        )}
      </>
    );
  };
  return (
    <>
      <ExpandingTabs
        aria-label="Review organization"
        variant="transparent"
        items={[
          {
            value: "flows",
            label: "Flows",
            icon: <GitBranch />,
            detail: `${reviewed}/${organization.units.length}`,
            tooltip: `${reviewed} of ${organization.units.length} regions reviewed`,
          },
          {
            value: "files",
            label: "Files",
            icon: <Files />,
            detail: `${reviewedFiles}/${paths.length}`,
            tooltip: `${reviewedFiles} of ${paths.length} files reviewed`,
          },
        ]}
        className="h-full gap-0"
        listClassName="m-2 w-auto"
      >
        <div className="flex shrink-0 items-center justify-between flex-wrap gap-2 px-4 pb-1">
          <span className="text-base text-muted-foreground">
            {organization.manual ? "Your organization" : "Reading order"}
          </span>
          <div className="flex items-center gap-2">
            <Popover>
              <TooltipWrapper content="Reading filters">
                <PopoverTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Reading filters"
                    />
                  }
                >
                  <ListFilter className="size-4" />
                </PopoverTrigger>
              </TooltipWrapper>
              <PopoverContent className="flex w-80 flex-col gap-4 text-base">
                <PopoverTitle>Reading filters</PopoverTitle>
                <Select
                  value={attention ? "attention" : "reading"}
                  onValueChange={(value) => setAttention(value === "attention")}
                >
                  <SelectTrigger
                    aria-label="Region order"
                    className="w-full text-base"
                  >
                    <SelectValue>
                      {attention ? "Attention" : "Reading order"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reading">Reading order</SelectItem>
                    <SelectItem value="attention">Attention</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center justify-between gap-3">
                  Collapse generated and repetitive regions
                  <Switch
                    checked={collapseRepetitive}
                    onCheckedChange={setCollapseRepetitive}
                  />
                </label>
                <p className="text-muted-foreground">
                  Collapsed regions remain in completion totals. Attention
                  ordering uses the visible impact reasons.
                </p>
              </PopoverContent>
            </Popover>
            <TooltipWrapper content="Organize regions">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Organize regions"
                onClick={() => setEditing(true)}
              >
                <SlidersHorizontal className="size-4" />
              </Button>
            </TooltipWrapper>
          </div>
        </div>
        <ExpandingTabsPanel value="flows" className="overflow-auto p-2">
          <nav aria-label="Review flows" className="flex flex-col gap-2">
            {organization.flows.map((flow) => {
              const units = flow.unitIds.flatMap(
                (id) => organization.units.find((unit) => unit.id === id) ?? [],
              );
              return (
                <Collapsible
                  key={flow.id}
                  open={
                    expansion.flows[flow.id] ??
                    flow.unitIds.includes(selectedUnitId ?? "")
                  }
                  onOpenChange={(open) =>
                    setExpansion((current) => ({
                      ...current,
                      flows: { ...current.flows, [flow.id]: open },
                    }))
                  }
                >
                  <CollapsibleTrigger className="group flex w-full min-w-0 cursor-pointer items-start gap-2 rounded-lg px-3 py-3 text-left text-base leading-6 font-medium">
                    <span className="min-w-0 flex-1 wrap-break-word">
                      {flow.title}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {units.filter((unit) => unit.reviewed).length}/
                      {units.length}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="h-lh w-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
                    {flow.rationale && (
                      <p className="px-3 pb-2 text-base text-muted-foreground">
                        {flow.rationale}
                      </p>
                    )}
                    {renderUnits(units, `flows-${flow.id}`)}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </nav>
        </ExpandingTabsPanel>
        <ExpandingTabsPanel value="files" className="overflow-auto p-2">
          <nav aria-label="Files and regions" className="flex flex-col gap-2">
            {paths.map((path) => {
              const units = organization.units.filter(
                (unit) => unit.path === path,
              );
              return (
                <Collapsible
                  key={path}
                  open={
                    expansion.files[path] ??
                    organization.units.some(
                      (unit) =>
                        unit.id === selectedUnitId && unit.path === path,
                    )
                  }
                  onOpenChange={(open) =>
                    setExpansion((current) => ({
                      ...current,
                      files: { ...current.files, [path]: open },
                    }))
                  }
                >
                  <CollapsibleTrigger className="group flex w-full min-w-0 cursor-pointer items-start gap-2 px-3 py-3 text-left text-base leading-6">
                    <span className="flex h-lh shrink-0 items-center">
                      <FileIcon fileName={path} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="break-all font-mono">{path}</span>
                      <span className="text-muted-foreground">
                        {units.filter((unit) => unit.reviewed).length}/
                        {units.length} regions
                      </span>
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="h-lh w-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0 motion-reduce:transition-none">
                    {renderUnits(units, `files-${path}`)}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </nav>
        </ExpandingTabsPanel>
      </ExpandingTabs>
      {editing && (
        <OrganizationEditor
          organization={organization}
          onAction={onAction}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
};
