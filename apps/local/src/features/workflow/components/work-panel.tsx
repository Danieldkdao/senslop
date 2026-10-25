"use client";
import type { ReviewIdentitySchema } from "@senslop/contracts";
import { ClipboardList, FlaskConical, ScanSearch } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { WorkflowStateSchema, WorkflowActionSchema } from "../schemas";
import { FixTaskItem } from "./fix-task-item";
import { CheckForm } from "./check-form";
import { CheckResults } from "./check-results";
import { VerificationResults } from "./verification-results";

export const WorkPanel = ({
  state,
  onAction,
}: {
  state?: WorkflowStateSchema;
  onAction: (
    operation: WorkflowActionSchema,
    review?: ReviewIdentitySchema,
  ) => Promise<unknown>;
}) => (
  <Tabs
    defaultValue="tasks"
    className="flex min-h-0 flex-1 flex-col gap-3 p-4 text-base"
  >
    <TabsList className="w-full">
      <TabsTrigger value="tasks" className="text-base">
        <ClipboardList aria-hidden="true" className="size-4" />
        Fix tasks
      </TabsTrigger>
      <TabsTrigger value="checks" className="text-base">
        <FlaskConical aria-hidden="true" className="size-4" />
        Checks
      </TabsTrigger>
      <TabsTrigger
        value="verification"
        aria-label="Verification"
        className="text-base"
      >
        <ScanSearch aria-hidden="true" className="size-4" />
        <span className="sr-only">Verification</span>
      </TabsTrigger>
    </TabsList>
    <TabsContent value="tasks" className="min-h-0 overflow-y-auto">
      {state?.tasks.length ? (
        state.tasks.map((task) => (
          <FixTaskItem key={task.id} task={task} onAction={onAction} />
        ))
      ) : (
        <span className="text-base text-muted-foreground">
          Select findings in Review to create a fix task.
        </span>
      )}
    </TabsContent>
    <TabsContent
      value="checks"
      className="flex min-h-0 flex-col gap-4 overflow-y-auto"
    >
      <CheckForm
        onAction={onAction}
        checks={state?.checks ?? []}
        findings={state?.findings}
        defaultTimeout={state?.policy.checkTimeoutSeconds}
        suggestedCommands={state?.suggestedCommands}
      />
      <CheckResults
        checks={state?.checks ?? []}
        currentRound={state?.rounds[0]}
        onAction={onAction}
      />
    </TabsContent>
    <TabsContent value="verification" className="min-h-0 overflow-y-auto">
      <VerificationResults
        runs={state?.verifications ?? []}
        onAction={onAction}
      />
    </TabsContent>
  </Tabs>
);
