"use client";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Cpu,
  Timer,
  CircleDollarSign,
  ChartNoAxesCombined,
  Info,
} from "lucide-react";
import type {
  ProjectPolicySchema,
  UsageRecordSchema,
} from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsAutosave } from "../../settings/hooks/use-settings-autosave";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from "@/components/ui/popover";
import type { WorkflowActionSchema } from "../schemas";
import { summarizeUsage } from "../lib/usage-summary";
import {
  formatUsageNumber,
  formatUsageDuration,
  formatUsageCost,
} from "../lib/formatters";

export const optionalLimit = z
  .string()
  .refine(
    (value) =>
      !value ||
      (/^\d+$/.test(value) &&
        Number(value) > 0 &&
        Number.isSafeInteger(Number(value))),
    "Enter a positive whole number or leave blank.",
  );
export type OptionalLimitSchema = z.infer<typeof optionalLimit>;
const budgetSchema = z.object({
  tokenBudget: optionalLimit,
  timeLimitSeconds: optionalLimit,
});
export type BudgetSchema = z.infer<typeof budgetSchema>;
export const UsagePopover = ({
  usage,
  policy,
  onAction,
  onOpenSettings,
}: {
  usage: UsageRecordSchema[];
  policy: ProjectPolicySchema;
  onAction: (operation: WorkflowActionSchema) => Promise<unknown>;
  onOpenSettings?: () => void;
}) => {
  const currentPolicy = useRef(policy);
  useEffect(() => {
    currentPolicy.current = policy;
  }, [policy]);
  const summary = summarizeUsage(usage);
  const ratio = policy.tokenBudget
    ? Math.min(100, (summary.tokens / policy.tokenBudget) * 100)
    : 0;
  const form = useForm<BudgetSchema>({
    resolver: zodResolver(budgetSchema),
    mode: "onChange",
    resetOptions: { keepDirtyValues: true },
    values: {
      tokenBudget:
        policy.tokenBudget === null ? "" : String(policy.tokenBudget),
      timeLimitSeconds:
        policy.timeLimitSeconds === null ? "" : String(policy.timeLimitSeconds),
    },
  });
  const autosave = useSettingsAutosave({
    form,
    schema: budgetSchema,
    save: async (values) => {
      await onAction({
        action: "save-review-limits",
        limits: {
          mode: currentPolicy.current.mode,
          tokenBudget: values.tokenBudget ? Number(values.tokenBudget) : null,
          timeLimitSeconds: values.timeLimitSeconds
            ? Number(values.timeLimitSeconds)
            : null,
        },
      });
    },
  });
  return (
    <Popover>
      <TooltipWrapper
        content={`Usage and budgets: ${formatUsageNumber(summary.tokens)} recorded tokens`}
      >
        <PopoverTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Usage and budgets"
            />
          }
        >
          <svg
            aria-hidden="true"
            className="size-6 -rotate-90"
            viewBox="0 0 24 24"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-muted-foreground/20"
            />
            <circle
              cx="12"
              cy="12"
              r="9"
              pathLength="100"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${ratio} 100`}
              className="text-primary/85"
            />
          </svg>
        </PopoverTrigger>
      </TooltipWrapper>
      <PopoverContent className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-4 text-base">
        <div className="flex items-center gap-2">
          <PopoverTitle className="flex-1">Review usage</PopoverTitle>
          {onOpenSettings && (
            <TooltipWrapper content="All usage statistics">
              <Button
                size="icon"
                variant="ghost"
                aria-label="All usage statistics"
                onClick={onOpenSettings}
              >
                <ChartNoAxesCombined aria-hidden="true" className="size-5" />
              </Button>
            </TooltipWrapper>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {[
            {
              Icon: Cpu,
              label: summary.incomplete
                ? "Recorded token count; some usage is unknown"
                : "Measured input and output tokens",
              value: `${summary.incomplete ? "≥ " : ""}${formatUsageNumber(summary.tokens)}`,
            },
            {
              Icon: Timer,
              label: "Recorded model execution time",
              value: formatUsageDuration(summary.durationMs),
            },
            {
              Icon: CircleDollarSign,
              label:
                "Estimated cost; unknown when reliable pricing is unavailable",
              value: formatUsageCost(summary.cost),
            },
          ].map((stat) => (
            <TooltipWrapper key={stat.label} content={stat.label}>
              <span tabIndex={0} className="flex items-center gap-2">
                <stat.Icon
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
                {stat.value}
              </span>
            </TooltipWrapper>
          ))}
        </div>
        <form
          noValidate
          className="flex w-full flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void autosave.flush();
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              void autosave.flush();
          }}
        >
          <label className="flex w-full flex-col gap-2">
            Token allowance
            <Input
              {...form.register("tokenBudget")}
              inputMode="numeric"
              placeholder="No limit"
              className="w-full text-base"
            />
          </label>
          <label className="flex w-full flex-col gap-2">
            Execution time in seconds
            <Input
              {...form.register("timeLimitSeconds")}
              inputMode="numeric"
              placeholder="No limit"
              className="w-full text-base"
            />
          </label>
          {Object.values(form.formState.errors).map((error, index) => (
            <span role="alert" key={index} className="text-destructive">
              {error.message}
            </span>
          ))}
          <div className="flex items-center gap-2">
            <TooltipWrapper content="Dollar limits require reliable model pricing. Usage includes retries and context calls; cancellation may still incur in-flight charges.">
              <span tabIndex={0}>
                <Info
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
              </span>
            </TooltipWrapper>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
};
