"use client";

import { useId, useState } from "react";
import { ClipboardList, Settings, ShieldCheck } from "lucide-react";
import type {
  ProjectPolicySchema,
  ReviewInstructionsSchema,
} from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WorkflowActionSchema } from "../../workflow/schemas";
import { formatAnalysisMode } from "../../workflow/lib/formatters";
import { EffectiveReviewRules } from "./effective-review-rules";

type ReviewOptionsPopoverProps = {
  policy?: ProjectPolicySchema;
  instructions?: ReviewInstructionsSchema;
  loading?: boolean;
  error?: string;
  onAction: (operation: WorkflowActionSchema) => Promise<unknown>;
  onBrief: () => void;
  onRules: () => void;
};

export const ReviewOptionsPopover = ({
  policy,
  instructions,
  loading,
  error,
  onAction,
  onBrief,
  onRules,
}: ReviewOptionsPopoverProps) => {
  const [open, setOpen] = useState(false);
  const depthId = useId();
  const depth = policy ? formatAnalysisMode(policy.mode) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipWrapper content="Review settings">
        <PopoverTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Review settings" />
          }
        >
          <Settings aria-hidden="true" className="size-4" />
        </PopoverTrigger>
      </TooltipWrapper>
      <PopoverContent
        align="end"
        className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden p-0 text-base"
      >
        {/* Keep scroll animations off the popup so its exit animation can finish. */}
        <div className="flex max-h-[min(40rem,80dvh)] flex-col gap-4 overflow-y-auto overscroll-contain scroll-fade-y p-4">
          <PopoverTitle>Review settings</PopoverTitle>
          {policy && depth && (
            <div className="flex flex-col gap-2">
              <label htmlFor={depthId} className="font-medium">
                Analysis depth
              </label>
              <Select
                value={policy.mode}
                onValueChange={(value) => {
                  if (value === "quick" || value === "thorough")
                    void onAction({
                      action: "save-review-limits",
                      limits: {
                        mode: value,
                        tokenBudget: policy.tokenBudget,
                        timeLimitSeconds: policy.timeLimitSeconds,
                      },
                    }).catch(() => {});
                }}
              >
                <SelectTrigger
                  id={depthId}
                  aria-label="Analysis depth"
                  className="w-full text-base"
                >
                  <SelectValue>
                    <depth.Icon aria-hidden="true" className="size-4" />
                    {depth.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["quick", "thorough"] as const).map((mode) => {
                    const display = formatAnalysisMode(mode);
                    return (
                      <SelectItem key={mode} value={mode}>
                        <display.Icon aria-hidden="true" className="size-4" />
                        {display.label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground">{depth.description}</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="h-11 w-full justify-start text-base"
              onClick={() => {
                setOpen(false);
                onBrief();
              }}
            >
              <ClipboardList aria-hidden="true" className="size-4" />
              Review brief
            </Button>
            <Button
              variant="outline"
              className="h-11 w-full justify-start text-base"
              onClick={() => {
                setOpen(false);
                onRules();
              }}
            >
              <ShieldCheck aria-hidden="true" className="size-4" />
              Review profiles and rules
            </Button>
          </div>
          <section
            className="flex min-w-0 flex-col gap-3 border-t pt-4"
            aria-label="Effective rules"
          >
            <h3 className="font-medium">Effective rules</h3>
            {loading && (
              <p role="status" className="text-muted-foreground">
                Loading review rules…
              </p>
            )}
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            {instructions && (
              <EffectiveReviewRules instructions={instructions} />
            )}
          </section>
        </div>
      </PopoverContent>
    </Popover>
  );
};
