"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { resyncModes, type ResyncMode } from "@senslop/contracts";
import { FolderSync } from "lucide-react";
import { useAiSettings } from "../../agents/hooks/use-ai-settings";
import { assignedModel } from "../../agents/lib/model-selection";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { Switch } from "@/components/ui/switch";
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
import { formatResyncMode } from "../lib/formatters";

const resyncFormSchema = z.object({
  mode: z.enum(resyncModes),
  grouping: z.boolean(),
});
export type ResyncFormSchema = z.infer<typeof resyncFormSchema>;

export const ResyncPopover = ({
  disabled,
  busy,
  error,
  onResync,
  unavailableReason,
}: {
  disabled: boolean;
  busy: boolean;
  error: string | null;
  unavailableReason?: string;
  onResync: (mode: ResyncMode, grouping?: boolean) => Promise<boolean>;
}) => {
  const [open, setOpen] = useState(false);
  const { settings } = useAiSettings();
  const configured = !!assignedModel(settings.data, "grouping");
  const { control, handleSubmit } = useForm<ResyncFormSchema>({
    resolver: zodResolver(resyncFormSchema),
    defaultValues: { mode: "new", grouping: true },
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipWrapper
        content={
          disabled && unavailableReason
            ? `${unavailableReason} (Shift+S)`
            : "Re-sync changes (Shift+S). Choose whether to keep this round or show only newer edits. Git is unchanged."
        }
      >
        <PopoverTrigger
          disabled={disabled}
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Re-sync review"
              disabled={disabled}
            />
          }
        >
          <FolderSync aria-hidden="true" className="size-5" />
        </PopoverTrigger>
      </TooltipWrapper>
      <PopoverContent className="flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-4 text-base">
        <PopoverTitle>Re-sync changes</PopoverTitle>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={handleSubmit(async (values) => {
            if (disabled || busy) return;
            if (
              await onResync(
                values.mode,
                settings.data?.groupingMode === "ask"
                  ? configured && values.grouping
                  : undefined,
              )
            )
              setOpen(false);
          })}
        >
          <label htmlFor="resync-mode">Changes to re-sync</label>
          <Controller
            name="mode"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => value && field.onChange(value)}
                disabled={busy}
              >
                <SelectTrigger id="resync-mode" className="w-full text-base">
                  <SelectValue>{formatResyncMode(field.value)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {resyncModes.map((mode) => (
                    <SelectItem key={mode} value={mode} className="text-base">
                      {formatResyncMode(mode)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-muted-foreground">
            Keeping current changes updates this review and preserves its notes,
            chats, and AI review history. Showing only newer edits starts a
            separate review.
          </p>
          {settings.data?.groupingMode === "ask" && (
            <label
              htmlFor="resync-grouping"
              className="flex items-center gap-3"
            >
              <Controller
                name="grouping"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="resync-grouping"
                    checked={configured && field.value}
                    onCheckedChange={field.onChange}
                    disabled={busy || !configured}
                  />
                )}
              />
              Group changes and write summaries
            </label>
          )}
          {!configured && (
            <p className="text-muted-foreground">
              Grouping is unavailable until a grouping model is configured.
            </p>
          )}
          {unavailableReason && (
            <p role="status" className="text-muted-foreground">
              {unavailableReason}
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="text-base"
            disabled={disabled || busy || settings.isPending}
          >
            <LoadingSwap isLoading={busy}>Start re-sync</LoadingSwap>
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
};
