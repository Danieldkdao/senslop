"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ClipboardCheck } from "lucide-react";
import { verificationOutcomes } from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingSwap } from "@/components/ui/loading-swap";
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
import { formatVerificationOutcome } from "../lib/formatters";
import type { WorkflowActionSchema } from "../schemas";

export const manualVerificationSchema = z.object({
  outcome: z.enum(verificationOutcomes),
  note: z.string().max(5000),
});
export type ManualVerificationSchema = z.infer<typeof manualVerificationSchema>;

export const ManualVerification = ({
  findingId,
  onAction,
}: {
  findingId: string;
  onAction: (action: WorkflowActionSchema) => Promise<unknown>;
}) => {
  const [open, setOpen] = useState(false);
  const form = useForm<ManualVerificationSchema>({
    resolver: zodResolver(manualVerificationSchema),
    defaultValues: { outcome: "unverified", note: "" },
  });
  const outcome = useWatch({ control: form.control, name: "outcome" });
  const display = formatVerificationOutcome(outcome);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipWrapper content="Manual verification">
        <PopoverTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              aria-label="Manual verification"
            />
          }
        >
          <ClipboardCheck aria-hidden="true" className="size-4" />
        </PopoverTrigger>
      </TooltipWrapper>
      <PopoverContent className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 text-base">
        <PopoverTitle>Manual verification</PopoverTitle>
        <form
          noValidate
          className="flex w-full flex-col gap-3"
          onSubmit={form.handleSubmit(async (values) => {
            try {
              await onAction({
                action: "assess",
                findingId,
                outcome: values.outcome,
                explanation: values.note.trim() || "Manually assessed",
                checkIds: [],
              });
              setOpen(false);
            } catch {}
          })}
        >
          <Select
            value={outcome}
            onValueChange={(value) => value && form.setValue("outcome", value)}
          >
            <SelectTrigger
              className="w-full text-base"
              aria-label="Verification outcome"
            >
              <SelectValue>
                <display.Icon aria-hidden="true" className="size-4" />
                {display.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {verificationOutcomes.map((value) => {
                const item = formatVerificationOutcome(value);
                return (
                  <SelectItem key={value} value={value} className="text-base">
                    <item.Icon aria-hidden="true" className="size-4" />
                    {item.label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Input
            aria-label="Verification note, optional"
            placeholder="Note, optional"
            className="w-full text-base"
            {...form.register("note")}
            aria-invalid={!!form.formState.errors.note}
          />
          {form.formState.errors.note && (
            <span role="alert" className="text-destructive">
              {form.formState.errors.note.message}
            </span>
          )}
          <Button type="submit" disabled={form.formState.isSubmitting}>
            <LoadingSwap isLoading={form.formState.isSubmitting}>
              Save verification
            </LoadingSwap>
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
};
