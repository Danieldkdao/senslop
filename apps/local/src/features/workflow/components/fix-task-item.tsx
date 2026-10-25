"use client";
import { useState } from "react";
import { useFixTaskPrompt } from "../hooks/use-fix-task-prompt";
import { Eye, Play, Send, X, FileWarning, FolderGit2 } from "lucide-react";
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
import { formatFixTaskStatus } from "../lib/formatters";
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
    try {
      await onAction(operation, task.review);
      return true;
    } catch {
      return false;
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
        className="flex min-w-0 flex-col gap-2 border-b py-3"
      >
        <div className="flex min-w-0 items-center gap-2">
          <TooltipWrapper content={status.label}>
            <span tabIndex={0} aria-label={status.label}>
              <status.Icon
                aria-hidden="true"
                className="size-5 text-muted-foreground"
              />
            </span>
          </TooltipWrapper>
          <CollapsibleTrigger className="min-w-0 flex-1 wrap-break-word text-left text-base font-medium">
            {task.title}
          </CollapsibleTrigger>
          {!["reviewed", "failed", "canceled"].includes(task.status) && (
            <TooltipWrapper content="Cancel task">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Cancel task"
                onClick={async () => {
                  if (await confirm())
                    await act({ action: "cancel-task", taskId: task.id });
                }}
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </TooltipWrapper>
          )}
        </div>
        <CollapsibleContent>
          <div className="flex min-w-0 flex-col gap-3">
            <span className="font-mono text-base text-muted-foreground">
              Round {task.review.round} / {task.review.hash.slice(0, 8)}
            </span>
            {task.directory && (
              <div className="flex min-w-0 items-start gap-2">
                <FolderGit2 aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 wrap-break-word font-mono text-base">
                  {task.directory}
                </span>
              </div>
            )}
            {task.agent && (
              <span className="text-muted-foreground">{task.agent}</span>
            )}
            {prompt.data && (
              <FixPrompt label="Agent handoff" prompt={prompt.data} secondary />
            )}
            {prompt.error && (
              <span role="alert" className="text-destructive">
                {prompt.error.message}
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              {task.status === "ready" && (
                <Button
                  onClick={() =>
                    void act({
                      action: "claim-task",
                      taskId: task.id,
                      agent: "External agent",
                    })
                  }
                >
                  <Play aria-hidden="true" className="size-4" />
                  Start task
                </Button>
              )}
              {task.status === "in-progress" && (
                <Button
                  onClick={() =>
                    void act({ action: "return-task", taskId: task.id })
                  }
                >
                  <Send aria-hidden="true" className="size-4" />
                  Capture returned edits
                </Button>
              )}
              {task.status === "returned" && (
                <Button onClick={() => setInspect(true)}>
                  <Eye aria-hidden="true" className="size-4" />
                  Review changes
                </Button>
              )}
            </div>
            <ol className="flex flex-col gap-2 border-l pl-3">
              {task.activity.map((event, index) => (
                <li key={index} className="text-base text-muted-foreground">
                  {event.label}
                </li>
              ))}
            </ol>
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
        <div className="flex max-h-40 shrink-0 flex-col gap-2 overflow-y-auto border-t pt-3">
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
                      className="size-4 text-muted-foreground"
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
              disabled={!choices.length}
              onClick={async () => {
                const applied = await act({
                  action: "apply-task",
                  taskId: task.id,
                  paths: choices,
                });
                if (applied) setInspect(false);
              }}
            >
              Apply selected files
            </Button>
          ) : (
            <Button
              onClick={async () => {
                if (await act({ action: "review-task", taskId: task.id }))
                  setInspect(false);
              }}
            >
              Mark changes reviewed
            </Button>
          )}
        </div>
      </ChangeInspector>
    </>
  );
};
