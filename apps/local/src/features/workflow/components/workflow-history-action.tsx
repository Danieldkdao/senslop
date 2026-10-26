"use client";

import { useState } from "react";
import { ListX, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { toast } from "@/components/ui/toast";
import { useConfirm } from "@/hooks/use-confirm";
import type { WorkflowActionSchema, WorkflowHistoryKind } from "../schemas";

export const WorkflowHistoryAction = ({
  kind,
  id,
  disabled = false,
  onAction,
}: {
  kind: WorkflowHistoryKind;
  id?: string;
  disabled?: boolean;
  onAction: (operation: WorkflowActionSchema) => Promise<unknown>;
}) => {
  const [busy, setBusy] = useState(false);
  const label = id ? "Remove from history" : "Clear finished history";
  const Icon = id ? Trash2 : ListX;
  const { confirm, ConfirmationDialog } = useConfirm(
    `${label}?`,
    "Linked evidence remains available in saved reviews and reports; active items stay in the list.",
  );
  return (
    <>
      <TooltipWrapper
        className="h-lh items-center"
        content={
          disabled
            ? "Finish or cancel items before clearing their history"
            : label
        }
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={busy || disabled}
          onClick={async () => {
            if (!(await confirm())) return;
            setBusy(true);
            try {
              await onAction({
                action: "remove-history",
                kind,
                ...(id ? { id } : {}),
              });
              toast.success(
                id ? "Removed from history" : "Finished history cleared",
              );
            } catch {
              /* The workflow action reports request errors. */
            } finally {
              setBusy(false);
            }
          }}
        >
          <LoadingSwap
            isLoading={busy}
            className="flex items-center justify-center"
          >
            <Icon aria-hidden="true" className="size-5 shrink-0" />
          </LoadingSwap>
        </Button>
      </TooltipWrapper>
      {ConfirmationDialog}
    </>
  );
};
