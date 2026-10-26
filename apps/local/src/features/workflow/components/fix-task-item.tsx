"use client";
import { WorkflowHistoryAction } from "./workflow-history-action";
import { LoadingSwap } from "@/components/ui/loading-swap";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { WorkflowChevron, WorkflowDisclosure } from "./workflow-disclosure";
import { useFixTaskPrompt } from "../hooks/use-fix-task-prompt";
import {
  Eye,
  Play,
  Send,
  X,
  FileWarning,
  FolderGit2,
  History,
} from "lucide-react";
import type {
  FixTaskSchema,
  ReviewIdentitySchema,
  PreviewFileSchema,
} from "@senslop/contracts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { useConfirm } from "@/hooks/use-confirm";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { FixPrompt } from "../../agents/components/fix-prompt";
import {
  formatFixTaskStatus,
  formatTaskActivity,
  formatWorkspaceKind,
} from "../lib/formatters";
import { ChangeInspector } from "./change-inspector";
import type { WorkflowActionSchema } from "../schemas";

export const FixTaskItem = ({
  task,
  onAction,
}: {
  task: FixTaskSchema;
  onAction: (
    operation: WorkflowActionSchema,
    review?: ReviewIdentitySchema,
  ) => Promise<unknown>;
}) => {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [inspect, setInspect] = useState(false);
  const [selected, setSelected] = useState<string[] | null>(null);
  const status = formatFixTaskStatus(task.status);
  const { confirm, ConfirmationDialog } = useConfirm(
    "Cancel fix task?",
    "Task history is retained. A separately launched agent may continue running; stop it in its own terminal.",
  );
  const prompt = useFixTaskPrompt(task, open);
  const act = async (operation: WorkflowActionSchema) => {
    if (busy) return false;
    setBusy(true);
    try {
      await onAction(operation, task.review);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };
  const files: PreviewFileSchema[] = task.changes.map((change) => ({
    path: change.path,
    oldPath: null,
    status: change.before === null ? "A" : change.after === null ? "D" : "M",
    binary: false,
    before: change.before,
    after: change.after,
    beforeHash: change.before === null ? null : "0".repeat(64),
    afterHash: change.after === null ? null : "0".repeat(64),
    diff: "",
    added: 0,
    deleted: 0,
  }));
  const choices =
    selected ??
    task.changes
      .filter((change) => !change.outsideRequestedFiles)
      .map((change) => change.path);
  return (
    <>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="flex min-w-0 flex-col gap-3 border-b p-4"
      >
        <div className="flex min-w-0 items-start gap-2 text-base leading-6">
          <TooltipWrapper content={status.label}>
            <span
              tabIndex={0}
              aria-label={status.label}
              className="flex h-lh items-center"
            >
              <status.Icon
                aria-hidden="true"
                className={cn(
                  "size-5 shrink-0 text-muted-foreground",
                  status.loading && "animate-spin",
                )}
              />
            </span>
          </TooltipWrapper>
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-start gap-2 text-left leading-6 text-base font-medium">
            <span className="min-w-0 flex-1 wrap-break-word">{task.title}</span>
            <WorkflowChevron />
          </CollapsibleTrigger>
          {!["reviewed", "failed", "canceled"].includes(task.status) && (
            <TooltipWrapper content="Cancel task" className="h-lh items-center">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Cancel task"
                onClick={async () => {
                  if (await confirm())
                    await act({ action: "cancel-task", taskId: task.id });
                }}
              >
                <X aria-hidden="true" className="size-5 shrink-0" />
              </Button>
            </TooltipWrapper>
          )}
          <WorkflowHistoryAction
            kind="tasks"
            id={task.id}
            disabled={!["reviewed", "failed", "canceled"].includes(task.status)}
            onAction={(operation) => onAction(operation, task.review)}
          />
        </div>
        <CollapsibleContent>
          <div className="flex min-w-0 flex-col gap-3">
            <span className="font-mono text-base text-muted-foreground">
              Round {task.review.round} / {task.review.hash.slice(0, 8)}
            </span>
            {["ready", "in-progress", "returned"].includes(task.status) && (
              <div className="flex flex-wrap gap-2">
                {task.status === "ready" && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: "claim-task",
                        taskId: task.id,
                        agent: "External agent",
                      })
                    }
                  >
                    <LoadingSwap
                      isLoading={busy}
                      className="flex items-center gap-2"
                    >
                      <Play aria-hidden="true" className="size-5 shrink-0" />
                      Start task
                    </LoadingSwap>
                  </Button>
                )}
                {task.status === "in-progress" && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act({ action: "return-task", taskId: task.id })
                    }
                  >
                    <LoadingSwap
                      isLoading={busy}
                      className="flex items-center gap-2"
                    >
                      <Send aria-hidden="true" className="size-5 shrink-0" />
                      Capture returned edits
                    </LoadingSwap>
                  </Button>
                )}
                {task.status === "returned" && (
                  <Button onClick={() => setInspect(true)}>
                    <Eye aria-hidden="true" className="size-5 shrink-0" />
                    Review changes
                  </Button>
                )}
              </div>
            )}
            <WorkflowDisclosure title="Workspace" Icon={FolderGit2}>
              <div className="flex min-w-0 flex-col gap-2 text-base">
                <p className="text-muted-foreground">
                  {formatWorkspaceKind(task.workspaceKind).label}
                </p>
                {task.directory && (
                  <p className="wrap-break-word font-mono">{task.directory}</p>
                )}
              </div>
            </WorkflowDisclosure>
            {prompt.data && (
              <FixPrompt label="Agent handoff" prompt={prompt.data} flat />
            )}
            {prompt.error && (
              <span role="alert" className="text-destructive">
                {prompt.error.message}
              </span>
            )}
            <WorkflowDisclosure title="Activity" Icon={History} defaultOpen>
              <ol className="flex flex-col gap-2 border-l pl-3">
                {task.activity.map((event, index) => {
                  const activity = formatTaskActivity(event.label);
                  return (
                    <li
                      key={index}
                      className="flex items-center gap-2 text-base text-muted-foreground"
                    >
                      <activity.Icon
                        aria-hidden="true"
                        className="size-5 shrink-0"
                      />
                      {activity.label}
                    </li>
                  );
                })}
              </ol>
            </WorkflowDisclosure>
          </div>
        </CollapsibleContent>
      </Collapsible>
      {ConfirmationDialog}
      <ChangeInspector
        open={inspect}
        onOpenChange={setInspect}
        title="Returned fix changes"
        description="Inspect the edits before applying them. Findings require a separate verification decision."
        files={files}
      >
        <div className="flex max-h-40 shrink-0 scroll-fade-y flex-col gap-2 overflow-y-auto border-t pt-3">
          {task.changes.map((change) => (
            <label
              key={change.path}
              className="flex min-w-0 items-center gap-2"
            >
              <Checkbox
                checked={choices.includes(change.path)}
                onCheckedChange={(checked) =>
                  setSelected(
                    checked
                      ? [...choices, change.path]
                      : choices.filter((path) => path !== change.path),
                  )
                }
              />
              <span className="min-w-0 flex-1 wrap-break-word font-mono text-base">
                {change.path}
              </span>
              {change.outsideRequestedFiles && (
                <TooltipWrapper content="Outside requested files; inspect whether this edit is needed">
                  <span tabIndex={0} aria-label="Outside requested files">
                    <FileWarning
                      aria-hidden="true"
                      className="size-5 shrink-0 text-muted-foreground"
                    />
                  </span>
                </TooltipWrapper>
              )}
            </label>
          ))}
        </div>
        <div className="flex shrink-0 justify-end gap-2">
          {task.workspaceKind === "managed" ? (
            <Button
              aria-label="Apply selected files"
              aria-busy={busy}
              disabled={busy || !choices.length}
              onClick={async () => {
                const applied = await act({
                  action: "apply-task",
                  taskId: task.id,
                  paths: choices,
                });
                if (applied) setInspect(false);
              }}
            >
              <LoadingSwap isLoading={busy}>Apply selected files</LoadingSwap>
            </Button>
          ) : (
            <Button
              aria-label="Mark changes reviewed"
              aria-busy={busy}
              disabled={busy}
              onClick={async () => {
                if (await act({ action: "review-task", taskId: task.id }))
                  setInspect(false);
              }}
            >
              <LoadingSwap isLoading={busy}>Mark changes reviewed</LoadingSwap>
            </Button>
          )}
        </div>
      </ChangeInspector>
    </>
  );
};
