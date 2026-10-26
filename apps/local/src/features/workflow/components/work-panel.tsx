"use client";
import type { ReviewIdentitySchema } from "@senslop/contracts";
import { ClipboardList, FlaskConical, ScanSearch } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { WorkflowStateSchema, WorkflowActionSchema } from "../schemas";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { WorkflowHistoryAction } from "./workflow-history-action";
import { FixTaskItem } from "./fix-task-item";
import { CheckForm } from "./check-form";
import { CheckResults } from "./check-results";
import { VerificationResults } from "./verification-results";

export const WorkPanel = ({
  state,
  tab,
  onTabChange,
  onAction,
}: {
  state?: WorkflowStateSchema;
  tab: string;
  onTabChange: (tab: string) => void;
  onAction: (
    operation: WorkflowActionSchema,
    review?: ReviewIdentitySchema,
  ) => Promise<unknown>;
}) => (
  <Tabs
    value={tab}
    onValueChange={(value) =>
      onTabChange(
        value === "checks"
          ? "checks"
          : value === "verification"
            ? "verification"
            : "tasks",
      )
    }
    className="flex min-h-0 flex-1 flex-col gap-0 text-base"
  >
    <TabsList
      className="w-full shrink-0 gap-0 border-b p-0 group-data-horizontal/tabs:h-12"
      variant="line"
    >
      {[
        { value: "tasks", label: "Fix tasks", Icon: ClipboardList },
        { value: "checks", label: "Checks", Icon: FlaskConical },
        { value: "verification", label: "Verification", Icon: ScanSearch },
      ].map(({ value, label, Icon }) => (
        <TooltipWrapper
          key={value}
          content={label}
          className="h-full min-w-0 flex-1"
        >
          <TabsTrigger
            value={value}
            aria-label={label}
            className="h-full w-full rounded-none text-base data-active:text-primary after:bg-primary group-data-horizontal/tabs:after:bottom-0"
          >
            <Icon aria-hidden="true" className="size-5" />
          </TabsTrigger>
        </TooltipWrapper>
      ))}
    </TabsList>
    {/* Scroll animations stay inside panels so tab exits can finish. */}
    <TabsContent
      value="tasks"
      className="flex min-h-0 flex-col overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 scroll-fade-y flex-col overflow-y-auto [&>*]:shrink-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <span className="font-medium">
            Fix tasks ({state?.tasks.length ?? 0})
          </span>
          <WorkflowHistoryAction
            kind="tasks"
            disabled={
              !state?.tasks.some(
                (item) =>
                  !["ready", "in-progress", "returned"].includes(item.status),
              )
            }
            onAction={onAction}
          />
        </div>
        {state?.tasks.length ? (
          state.tasks.map((task) => (
            <FixTaskItem key={task.id} task={task} onAction={onAction} />
          ))
        ) : (
          <span className="p-4 text-base text-muted-foreground">
            Select findings in Review to create a fix task.
          </span>
        )}
      </div>
    </TabsContent>
    <TabsContent
      value="checks"
      className="flex min-h-0 flex-col overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 scroll-fade-y flex-col overflow-y-auto [&>*]:shrink-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <span className="font-medium">
            Checks ({state?.checks.length ?? 0})
          </span>
          <WorkflowHistoryAction
            kind="checks"
            disabled={
              !state?.checks.some(
                (item) => !["queued", "running"].includes(item.status),
              )
            }
            onAction={onAction}
          />
        </div>
        <div className="border-b p-4">
          <CheckForm
            onAction={onAction}
            checks={state?.checks ?? []}
            findings={state?.findings}
            defaultTimeout={state?.policy.checkTimeoutSeconds}
            suggestedCommands={state?.suggestedCommands}
          />
        </div>
        <CheckResults
          checks={state?.checks ?? []}
          currentRound={state?.rounds[0]}
          onAction={onAction}
        />
      </div>
    </TabsContent>
    <TabsContent
      value="verification"
      className="flex min-h-0 flex-col overflow-hidden"
    >
      <div className="flex min-h-0 flex-1 scroll-fade-y flex-col overflow-y-auto [&>*]:shrink-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <span className="font-medium">
            Verification ({state?.verifications.length ?? 0})
          </span>
          <WorkflowHistoryAction
            kind="verification"
            disabled={
              !state?.verifications.some(
                (item) => !["queued", "running"].includes(item.status),
              )
            }
            onAction={onAction}
          />
        </div>
        <VerificationResults
          runs={state?.verifications ?? []}
          findings={state?.findings}
          onAction={onAction}
        />
      </div>
    </TabsContent>
  </Tabs>
);
