"use client";
import { ListFilter } from "lucide-react";
import {
  findingDecisions,
  findingCategories,
  workflowSeverities,
} from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from "@/components/ui/popover";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { formatSeverity } from "../../agents/lib/formatters";
import {
  formatFindingDecision,
  formatFindingCategory,
} from "../lib/formatters";

export type FindingFiltersState = {
  search: string;
  status: string;
  severity: string;
  file: string;
  group: string;
  category: string;
};
export const emptyFindingFilters: FindingFiltersState = {
  search: "",
  status: "all",
  severity: "all",
  file: "all",
  group: "all",
  category: "all",
};
export const FindingFilters = ({
  values,
  onChange,
  files,
  groups,
}: {
  values: FindingFiltersState;
  onChange: (values: FindingFiltersState) => void;
  files: string[];
  groups: string[];
}) => {
  const fields = [
    {
      key: "status" as const,
      label: "Status",
      options: findingDecisions.map((value) => ({
        value,
        label: formatFindingDecision(value).label,
      })),
    },
    {
      key: "severity" as const,
      label: "Severity",
      options: workflowSeverities.map((value) => ({
        value,
        label: formatSeverity(value).label,
      })),
    },
    {
      key: "file" as const,
      label: "File",
      options: [...new Set(files)].map((value) => ({ value, label: value })),
    },
    {
      key: "group" as const,
      label: "Group",
      options: [...new Set(groups)].map((value) => ({ value, label: value })),
    },
    {
      key: "category" as const,
      label: "Category",
      options: findingCategories.map((value) => ({
        value,
        label: formatFindingCategory(value),
      })),
    },
  ];
  const active = fields.filter((field) => values[field.key] !== "all").length;
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <Input
        aria-label="Search findings"
        placeholder="Search findings…"
        className="w-full text-base"
        value={values.search}
        onChange={(event) =>
          onChange({ ...values, search: event.target.value })
        }
      />
      <Popover>
        <TooltipWrapper
          content={
            active ? `Filter findings (${active} active)` : "Filter findings"
          }
        >
          <PopoverTrigger
            render={
              <Button
                size="icon"
                variant={active ? "secondary" : "ghost"}
                aria-label="Filter findings"
              />
            }
          >
            <ListFilter aria-hidden="true" className="size-5" />
          </PopoverTrigger>
        </TooltipWrapper>
        <PopoverContent className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-4 text-base">
          <PopoverTitle>Finding filters</PopoverTitle>
          {fields.map((field) => (
            <label
              key={field.key}
              className="flex w-full min-w-0 flex-col gap-2 text-base"
            >
              {field.label}
              <Select
                value={values[field.key]}
                onValueChange={(value) =>
                  value && onChange({ ...values, [field.key]: value })
                }
              >
                <SelectTrigger
                  aria-label={field.label}
                  className="w-full text-base"
                >
                  <SelectValue>
                    {values[field.key] === "all"
                      ? "All"
                      : field.options.find(
                          (option) => option.value === values[field.key],
                        )?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-base">
                    All
                  </SelectItem>
                  {field.options.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-base"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ))}
          <Button variant="ghost" onClick={() => onChange(emptyFindingFilters)}>
            Clear filters
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
};
